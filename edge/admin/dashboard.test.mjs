import assert from "node:assert/strict";
import test from "node:test";
import dashboard from "./dashboard.mjs";

const env = { ACCESS_AUDIENCE: "test-audience", ADMIN_EMAILS: "owner@example.test" };
const request = new Request("https://admin.ashtonmilton.net/");
const identity = (email, aud = env.ACCESS_AUDIENCE) => ({access: {aud, getIdentity: async () => ({email})}});

function publishRequest(overrides = {}, origin = "https://admin.ashtonmilton.net") {
  const body = new FormData();
  for (const [key, value] of Object.entries({title: "Test Note", summary: "A short test note.", type: "note",
    writing: "Test **with formatting**, {% include 'private' %} and <em>text</em>.", confirm: "yes", ...overrides})) {
    body.set(key, value);
  }
  return new Request("https://admin.ashtonmilton.net/publish", {method: "POST", body, headers: {Origin: origin}});
}

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

test("Publishing checks identity, same origin, permission to release, and input", async (context) => {
  const server = context.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected request"); });
  const authorised = identity("owner@example.test");
  const publishing = {...env, GITHUB_PUBLISH_TOKEN: "server-only-test-value"};
  assert.equal((await dashboard.fetch(publishRequest(), publishing, {})).status, 403);
  assert.equal((await dashboard.fetch(publishRequest({}, "https://ashtonmilton.net"), publishing, authorised)).status, 403);
  assert.equal((await dashboard.fetch(publishRequest(), env, authorised)).status, 503);
  assert.equal((await dashboard.fetch(publishRequest({confirm: "no"}), publishing, authorised)).status, 400);
  assert.equal((await dashboard.fetch(publishRequest({slug: "../other"}), publishing, authorised)).status, 400);
  assert.equal((await dashboard.fetch(publishRequest({date: "2099-05-30"}), publishing, authorised)).status, 400);
  assert.equal(server.mock.callCount(), 0);
});

test("Publishing creates one Markdown file without overwrite and returns the real commit reference", async (context) => {
  const commit = "f".repeat(40);
  let upstreamStatus = 201;
  const stub = context.mock.method(globalThis, "fetch", async () => Response.json({commit: {sha: commit}}, {status: upstreamStatus}));
  const publishing = {...env, GITHUB_PUBLISH_TOKEN: "server-only-test-value"};
  const user = identity("owner@example.test");
  const result = await dashboard.fetch(publishRequest(), publishing, user);
  assert.equal(result.status, 303);
  assert.equal(result.headers.get("Location"), `https://admin.ashtonmilton.net/?commit=${commit}&post=test-note`);
  const [url, options] = stub.mock.calls[0].arguments;
  assert.equal(url, "https://api.github.com/repos/ashtonmilton/ashtonmilton.github.io/contents/src/writing/essays/test-note.md");
  const data = JSON.parse(options.body);
  const markdown = Buffer.from(data.content, "base64").toString("utf8");
  assert.equal(data.branch, "main");
  assert.ok(!("sha" in data));
  assert.match(markdown, /templateEngineOverride: "md"/);
  assert.match(markdown, /category: "Notes"/);
  assert.match(markdown, /&lt;em>text/);
  upstreamStatus = 422;
  assert.equal((await dashboard.fetch(publishRequest(), publishing, user)).status, 409);
});
