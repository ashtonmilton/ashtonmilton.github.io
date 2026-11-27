import assert from "node:assert/strict";
import test from "node:test";
import dashboard from "./dashboard.mjs";

const env = { ACCESS_AUDIENCE: "test-audience", ADMIN_EMAILS: "owner@example.test" };
const request = new Request("https://admin.ashtonmilton.net/");
const identity = (email, aud = env.ACCESS_AUDIENCE) => ({access: {aud, getIdentity: async () => ({email})}});

test("Dashboard rejects unauthenticated, incorrect audience, and non-allowlisted requests", async () => {
  for (const ctx of [{}, identity("owner@example.test", "wrong"), identity("other@example.test")]) {
    const denied = await dashboard.fetch(request, env, ctx);
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("Cache-Control"), "private, no-store");
  }
  assert.equal((await dashboard.fetch(request, {}, identity("owner@example.test"))).status, 403);
});

test("Allowed dashboard uses upstream data, escapes catalogue text and does not invent metrics", async (context) => {
  context.mock.method(globalThis, "fetch", async (url) => url.endsWith("/catalogue.json")
    ? Response.json([{ title: "<em>fixture</em>", type: "Research Paper", version: "1" }]) : new Response(null));
  const response = await dashboard.fetch(request, env, identity("owner@example.test"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("X-Robots-Tag"), /noindex/);
  const html = await response.text();
  assert.match(html, /Public site responded successfully/);
  assert.match(html, /&lt;em&gt;fixture&lt;\/em&gt;/);
  assert.match(html, /Edge analytics unavailable/);
});
