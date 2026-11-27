import assert from "node:assert/strict";
import test from "node:test";
import {recordReadership} from "./readership.mjs";

test("Optional readership accepts only coarse validated events and never stores identity or search text", async () => {
  const writes = [];
  const env = {READERSHIP_ENABLED: "on", READERSHIP_EVENTS: {writeDataPoint: (row) => writes.push(row)}, READERSHIP_LIMIT: {limit: async () => ({success: true})}};
  const req = (body, source = "https://ashtonmilton.net") => new Request("https://ashtonmilton.net/_readership", {method: "POST", headers: {Origin: source}, body: JSON.stringify(body)});
  const event = {kind: "search", path: "/writing/", detail: "Education"};
  assert.equal((await recordReadership(req(event), {})).status, 404);
  assert.equal((await recordReadership(req(event, "https://another.example"), env)).status, 403);
  assert.equal((await recordReadership(req({...event, detail: "name@example.test"}), env)).status, 400);
  assert.equal((await recordReadership(req({...event, path: "/writing/?private=term"}), env)).status, 400);
  assert.equal((await recordReadership(req({...event, detail: "x".repeat(900)}), env)).status, 413);
  assert.equal((await recordReadership(req(event), env)).status, 204);
  assert.deepEqual(writes, [{indexes: ["search"], blobs: ["search", "/writing/", "Education", "Unknown"], doubles: [1]}]);
});
