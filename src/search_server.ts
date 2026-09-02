import express from "express";
import { ZodError } from "zod";
import { searchGameContent, searchRequestSchema } from "./game_content_search.js";
import { InfraiError, InfraiSearchClient } from "./infrai_search_client.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

const client = new InfraiSearchClient(apiKey);
const app = express();
app.use(express.json({ limit: "32kb" }));

app.post("/search", async (request, response) => {
  try {
    const input = searchRequestSchema.parse(request.body);
    response.json(await searchGameContent(client, "game-backend-content", input));
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.status(status).json({ error: error.code, message: error.message });
      return;
    }
    response.status(502).json({ error: "search_unavailable" });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Game content search listening on http://localhost:${port}`));
