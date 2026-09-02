import { createHash } from "node:crypto";
import { z } from "zod";
import { InfraiSearchClient, type VectorMatch } from "./infrai_search_client.js";

export const searchRequestSchema = z.object({
  game_id: z.string().min(2).max(80),
  query: z.string().min(3).max(500),
  top_k: z.number().int().min(1).max(10).default(5),
}).strict();

export const contentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("player_asset"), game_id: z.string(), title: z.string(), text: z.string(), moderation: z.enum(["approved", "pending", "rejected"]) }),
  z.object({ kind: z.literal("live_event"), game_id: z.string(), title: z.string(), text: z.string(), moderation: z.literal("approved") }),
  z.object({ kind: z.literal("moderation_queue"), game_id: z.string(), title: z.string(), text: z.string(), moderation: z.literal("pending") }),
]);

export type GameContent = z.infer<typeof contentSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SearchResult = GameContent & { id: string; score: number; action: "show" | "review" };

export function applyModerationDecision(gameId: string, matches: VectorMatch[]): SearchResult[] {
  return matches.flatMap((match) => {
    const parsed = contentSchema.safeParse(match.metadata);
    if (!parsed.success || parsed.data.game_id !== gameId || parsed.data.moderation === "rejected") return [];
    return [{
      ...parsed.data,
      id: match.id,
      score: match.score ?? 0,
      action: parsed.data.moderation === "pending" ? "review" as const : "show" as const,
    }];
  });
}

export async function seedGameContent(client: InfraiSearchClient, collection: string, items: GameContent[]) {
  const parsed = items.map((item) => contentSchema.parse(item));
  const embeddings = await client.embed(parsed.map((item) => `${item.title}\n${item.text}`));
  const dimension = embeddings[0]?.length;
  if (!dimension) throw new Error("At least one content item is required");
  await client.upsert(collection, parsed.map((item, index) => ({
    id: createHash("sha256").update(`${item.game_id}:${item.kind}:${item.title}`).digest("hex").slice(0, 24),
    values: embeddings[index]!,
    metadata: item,
  })));
  return { indexed: parsed.length, collection };
}

export async function searchGameContent(client: InfraiSearchClient, collection: string, input: SearchRequest) {
  const request = searchRequestSchema.parse(input);
  const [embedding] = await client.embed(request.query);
  if (!embedding) throw new Error("Embedding response was empty");
  const matches = await client.query(collection, embedding, request.game_id, request.top_k * 2);
  const eligible = applyModerationDecision(request.game_id, matches);
  if (eligible.length === 0) return { query: request.query, results: [] };
  const ranked = await client.rerank(
    request.query,
    eligible.map((item) => `${item.title}\n${item.text}`),
    Math.min(request.top_k, eligible.length),
  );
  const results = ranked.flatMap((rank) => {
    const item = eligible[rank.index];
    return item ? [{ ...item, score: rank.score ?? item.score }] : [];
  });
  return { query: request.query, results };
}
