import { seedGameContent, type GameContent } from "./game_content_search.js";
import { InfraiSearchClient } from "./infrai_search_client.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

const sample: GameContent[] = [
  { kind: "player_asset", game_id: "skyforge", title: "Clockwork dragon mount", text: "A brass dragon mount built by player Mira with folding wings.", moderation: "approved" },
  { kind: "live_event", game_id: "skyforge", title: "Moonfall weekend", text: "The Moonfall raid opens Friday at 18:00 UTC and rewards lunar armor.", moderation: "approved" },
  { kind: "moderation_queue", game_id: "skyforge", title: "Neon arena banner", text: "A submitted arena banner awaiting a trademark review.", moderation: "pending" },
  { kind: "player_asset", game_id: "skyforge", title: "Removed chat billboard", text: "A billboard removed after moderation review.", moderation: "rejected" },
];

const result = await seedGameContent(new InfraiSearchClient(apiKey), "game-backend-content", sample);
console.log(JSON.stringify(result, null, 2));
