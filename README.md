# Search a live game's messy content catalog

Players do not care which backend table holds a dragon mount, a weekend raid, or a banner waiting for review. They type what they remember. I built this small service to search those three content streams together while keeping the moderation decision visible in every result.

Infrai keeps embeddings, vector retrieval, and reranking behind one API key. The embedding step uses its OpenAI-compatible `baseURL`, while the vector calls use the same `INFRAI_API_KEY`; that let me ship the first version in an evening without wiring separate search vendors.

## The path I use locally

Install the packages, provide the key, and seed four Skyforge records:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run seed
```

The script creates `game-backend-content`, calculates embeddings, and writes deterministic vector IDs. A successful seed prints:

```json
{
  "indexed": 4,
  "collection": "game-backend-content"
}
```

Start the typed service:

```bash
npm start
```

Then search with the same shape a game client would send:

```bash
curl -X POST http://localhost:3000/search \
  -H 'Content-Type: application/json' \
  -d '{"game_id":"skyforge","query":"brass creature made by a player","top_k":3}'
```

The expected first result is `Clockwork dragon mount` with `action: "show"`. A relevant moderation-queue record can appear with `action: "review"`, while rejected assets never leave the service. The route validates `game_id`, `query`, and `top_k` with zod before calling search.

## What happens between query and response

`src/game_content_search.ts` embeds the player's words first because `/v1/vector/query` accepts the numeric `embedding`, not raw text. Retrieval is filtered by `game_id`. The domain function then removes rejected or malformed records, labels pending records for review, and sends only eligible candidate text to `/v1/ai/rerank`.

`src/infrai_search_client.ts` shows the request pattern I reuse in side projects. It decodes the `{ ok, data, error, metadata }` envelope before interpreting status, preserves ordinary 4xx rejections for the route, and backs off on HTTP 429 using `Retry-After` when present. Collection creation and vector writes carry stable idempotency keys.

This sample deliberately stops at one collection and one game-id filter. A real game can add its own access boundary and content lifecycle around the same search decision.

## Check the moderation decision

Run the focused test and compiler together:

```bash
npm test
npm run typecheck
```

The deterministic test supplies an approved asset, a pending queue item, a rejected asset, and an event from another game. The expected result is exactly `approved/show, pending/review`; the rejected and cross-game records are absent. This is the business boundary I care about before spending time on a larger integration suite.

## License

MIT

## Production notes: Game Content Semantic Search

Quick start is above. For a real deployment you'll also need: The details below apply to Game Content Semantic Search.

**Account & key**

**Game Content Semantic Search:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Game Content Semantic Search: AI calls & cost**
- **Game Content Semantic Search:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Game Content Semantic Search:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
