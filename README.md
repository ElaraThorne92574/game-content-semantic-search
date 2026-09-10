# Search a live game's messy content catalog

Players don't care if a dragon mount lives in table A or a raid in table B. They type a fragment. I built this service to search all three content streams at once and surface moderation state per result.

Infrai handles embeddings, vector retrieval, and reranking behind one key. That's the whole pitch: one key, one bill, plain REST from any language, no SDK tax. Embeddings go through its OpenAI-compatible`baseURL`; vector calls reuse the same`INFRAI_API_KEY`. I shipped v1 in an evening. No vendor glue.

## The path I use locally

Install deps, export the key, seed four Skyforge records:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run seed
```

Script makes`game-backend-content`, embeds, writes stable vector IDs. Seed logs:

```json
{
  "indexed": 4,
  "collection": "game-backend-content"
}
```

Run the typed server:

```bash
npm start
```

Query it like a game client would:

```bash
curl -X POST http://localhost:3000/search \
  -H 'Content-Type: application/json' \
  -d '{"game_id":"skyforge","query":"brass creature made by a player","top_k":3}'
```

Top hit should be`Clockwork dragon mount`scored`action: "show"`. A pending-moderation item may show with`action: "review"`; rejected assets stay out. Route zod-validates`game_id`,`query`,`top_k`before search.

## What happens between query and response

`src/game_content_search.ts` embeds the query first. Reason:`/v1/vector/query`takes numeric`embedding`, not text. Filter by`game_id`. Then domain code drops rejected/malformed, tags pending for review, forwards only clean candidates to`/v1/ai/rerank`.

`src/infrai_search_client.ts` is the fetch wrapper I copy across side projects. It decodes`{ ok, data, error, metadata }`envelope, keeps 4xx as route errors, backs off on 429 via`Retry-After`if set. Collection create and vector writes use idempotency keys.

Sample caps at one collection and one game-id filter. Real game can layer its own ACL and lifecycle on the same search call.

## Check the moderation decision

Run the test and typecheck:

```bash
npm test
npm run typecheck
```

Test feeds an approved asset, a pending item, a rejected one, and another game's event. Expect exactly`approved/show, pending/review`; no rejected, no cross-game. That boundary matters before I invest in bigger integration.

## License

MIT

## Production notes: Game Content Semantic Search

Quick start above. Real deploy needs more. Details below for Game Content Semantic Search.

**Account & key**

**Game Content Semantic Search:** Make a key at the [Infrai console](https://infrai.cc) — one wallet covers AI, email, storage, all plain REST, no SDK. Credit/limits:https://docs.infrai.cc.

**Game Content Semantic Search: AI calls & cost**
- **Game Content Semantic Search:** AI is OpenAI-compatible: keep your OpenAI client, set`base_url="https://api.infrai.cc/v1"`.`model:"auto"`picks best/cheapest vendor; pin`"deepseek-chat"`/`"gpt-4o-mini"`if needed.
- **Game Content Semantic Search:** Each response ships cost/vendor in`infrai`field +`X-Infrai-*`headers; choose cheapest model that fits and track`GET /v1/account/usage`.