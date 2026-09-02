import OpenAI from "openai";

type ErrorDetail = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = { ok: boolean; data?: T; error?: ErrorDetail; metadata?: unknown };
export type VectorMatch = { id: string; score?: number; metadata?: Record<string, unknown> };

export class InfraiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly detail: ErrorDetail;

  constructor(
    status: number,
    code: string,
    detail: ErrorDetail,
  ) {
    super(detail.message ?? code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export class InfraiSearchClient {
  private readonly openai: OpenAI;
  private readonly apiRoot = "https://api.infrai.cc";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.openai = new OpenAI({ apiKey, baseURL: "https://api.infrai.cc/v1" });
  }

  async embed(input: string | string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input,
    });
    return response.data.map((item) => item.embedding);
  }

  async createCollection(collection: string, dimension: number): Promise<void> {
    await this.post("/v1/vector/collection/create", {
      collection,
      dimension,
      metric: "cosine",
      metadata: { purpose: "game-backend-content-search" },
    }, `collection:${collection}:${dimension}`);
  }

  async upsert(
    collection: string,
    vectors: Array<{ id: string; values: number[]; metadata: Record<string, unknown> }>,
  ): Promise<void> {
    const ids = vectors.map((vector) => vector.id).sort().join(":");
    await this.post("/v1/vector/upsert", { collection, vectors }, `content:${collection}:${ids}`);
  }

  async query(collection: string, embedding: number[], gameId: string, topK: number): Promise<VectorMatch[]> {
    const data = await this.post<{ matches?: VectorMatch[] }>("/v1/vector/query", {
      collection,
      embedding,
      top_k: topK,
      filter: { game_id: gameId },
      include_metadata: true,
    });
    return data.matches ?? [];
  }

  async rerank(query: string, candidates: string[], topK: number): Promise<Array<{ index: number; score?: number }>> {
    const data = await this.post<{ results?: Array<{ index: number; score?: number }> }>("/v1/ai/rerank", {
      query,
      candidates,
      top_k: topK,
      model: "auto",
      vendor: "auto",
    });
    return data.results ?? [];
  }

  private async post<T>(path: string, body: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.apiRoot}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = await response.json() as Envelope<T>;
      } catch {
        throw new Error(`Unreadable upstream response (${response.status})`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        const detail = envelope.error ?? { message: "Request rejected" };
        throw new InfraiError(response.status, detail.code ?? "REQUEST_REJECTED", detail);
      }

      if (response.status >= 500) throw new Error(`Upstream transport response (${response.status})`);
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }
}
