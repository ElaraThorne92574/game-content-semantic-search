import assert from "node:assert/strict";
import test from "node:test";
import { applyModerationDecision } from "../src/game_content_search.js";

test("search results expose approved content and route pending content to review", () => {
  const results = applyModerationDecision("skyforge", [
    { id: "approved", score: 0.92, metadata: { kind: "player_asset", game_id: "skyforge", title: "Dragon", text: "A brass mount", moderation: "approved" } },
    { id: "pending", score: 0.86, metadata: { kind: "moderation_queue", game_id: "skyforge", title: "Banner", text: "Trademark check", moderation: "pending" } },
    { id: "rejected", score: 0.81, metadata: { kind: "player_asset", game_id: "skyforge", title: "Billboard", text: "Removed asset", moderation: "rejected" } },
    { id: "other-game", score: 0.78, metadata: { kind: "live_event", game_id: "deepsea", title: "Dive", text: "Weekend event", moderation: "approved" } },
  ]);

  assert.deepEqual(results.map(({ id, action }) => ({ id, action })), [
    { id: "approved", action: "show" },
    { id: "pending", action: "review" },
  ]);
});
