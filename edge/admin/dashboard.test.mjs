import assert from "node:assert/strict";
import test from "node:test";
import dashboard from "./dashboard.mjs";
import {startSession, validSession} from "./session.mjs";

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

const key = "fa32".repeat(16);
const native = { ADMIN_LOGIN_KEY: key, ADMIN_LOGIN_LIMIT: {limit: async () => ({success: true})} };
const origin = "https://admin.ashtonmilton.net";
const login = (password, source = origin) => new Request(origin + "/login", {
  method: "POST", body: new URLSearchParams({password}), headers: {Origin: source}
});

test("Native login gates publishing, rate-limits attempts and issues an eight-hour host-only session", async () => {
  const form = await dashboard.fetch(request, native, {});
  assert.match(await form.text(), /Admin Password/);
  assert.equal((await dashboard.fetch(publishRequest(), native, {})).status, 401);
  assert.equal((await dashboard.fetch(login(key, "https://ashtonmilton.net"), native, {})).status, 403);
  assert.equal((await dashboard.fetch(login("de19".repeat(16)), native, {})).status, 401);
  const rateLimited = {...native, ADMIN_LOGIN_LIMIT: {limit: async () => ({success: false})}};
  assert.equal((await dashboard.fetch(login(key), rateLimited, {})).status, 429);
  const signedIn = await dashboard.fetch(login(key), native, {});
  assert.equal(signedIn.status, 303);
  const cookie = signedIn.headers.get("Set-Cookie");
  assert.match(cookie, /^__Host-ashton_admin=.+; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800$/);
  const headers = {Cookie: cookie.split(";")[0]};
  assert.ok(await validSession(new Request(origin, {headers}), key));
  assert.equal(await validSession(new Request(origin, {headers: {Cookie: headers.Cookie + "a"}}), key), false);
  assert.equal(await validSession(new Request(origin, {headers}), "de19".repeat(16)), false);
  const expired = (await startSession(key, Date.now() - 9 * 3600000)).split(";")[0];
  assert.equal(await validSession(new Request(origin, {headers: {Cookie: expired}}), key), false);
  const logout = await dashboard.fetch(new Request(origin + "/logout", {method: "POST", headers: {...headers, Origin: origin}}), native, {});
  assert.match(logout.headers.get("Set-Cookie"), /Max-Age=0$/);
});

test("Revision preserves metadata and URL and guards against overwriting a newer version", async (context) => {
  const previous = "a".repeat(40);
  const fixture = `---\nlayout: "layouts/article.njk"\ntemplateEngineOverride: "md"\ndashboardEditable: true\npermalink: "/writing/test-note/"\ntitle: "Original Note"\nsummary: "Original Summary"\ncategory: "Notes"\ntags: ["Development"]\ndate: "2026-11-26"\n---\n\nBody.\n`;
  const upstream = context.mock.method(globalThis, "fetch", async (_, options) => options.method === "PUT"
    ? Response.json({commit: {sha: "b".repeat(40)}})
    : Response.json({type: "file", encoding: "base64", size: fixture.length, sha: previous, content: Buffer.from(fixture).toString("base64")}));
  const publishing = {...env, GITHUB_PUBLISH_TOKEN: "server-only-test-value"};
  const user = identity("owner@example.test");
  const revision = (revisionSha) => new Request(origin + "/edit", {method: "POST", headers: {Origin: origin},
    body: new URLSearchParams({slug: "test-note", previous: revisionSha, title: "Revised Name", summary: "Revised summary.", writing: "Revised <script> body.", confirm: "yes"})});
  assert.equal((await dashboard.fetch(revision("c".repeat(40)), publishing, user)).status, 409);
  assert.equal(upstream.mock.callCount(), 1);
  assert.equal((await dashboard.fetch(revision(previous), publishing, user)).status, 303);
  const payload = JSON.parse(upstream.mock.calls[2].arguments[1].body);
  const markdown = Buffer.from(payload.content, "base64").toString("utf8");
  assert.equal(payload.sha, previous);
  assert.match(markdown, /permalink: "\/writing\/test-note\/"/);
  assert.match(markdown, /date: "2026-11-26"/);
  assert.match(markdown, /Revised &lt;script>/);
});

test("Pages and the unified Work list remain usable with Worker-supported fetch options", async (context) => {
  let status = 200;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.redirect !== "manual") throw new TypeError("Unsupported Workers redirect mode");
    if (url.endsWith("assets/search-index.json")) return Response.json([{url:"/writing/an-essay/", title:"An Essay"}]);
    assert.match(url, /\/contents\/src\/writing\/essays\?ref=main$/);
    return Response.json([{type: "file", name: "an-essay.md"}], {status});
  });
  const load = () => dashboard.fetch(new Request(origin + "/content"), {...env, GITHUB_PUBLISH_TOKEN: "fixture"}, identity("owner@example.test"));
  assert.match(await (await load()).text(), /Edit Articles, Notes and Photo Essays/);
  const work = () => dashboard.fetch(new Request(origin + "/edit"), {...env, GITHUB_PUBLISH_TOKEN:"fixture"}, identity("owner@example.test"));
  assert.match(await (await work()).text(), /<a href="\/edit\?post=an-essay">An Essay/);
  assert.match(await (await work()).text(), /data-find-work/);
  status = 403;
  const html = await (await load()).text();
  assert.match(html, /Main Pages/);
  assert.match(await (await work()).text(), /GitHub denied access to the work archive \(403\)/);
});

test("Featured Work uses public titles and does not offer unpublished repository files", async (context) => {
  context.mock.method(globalThis,"fetch",async (url) => {
    if (url.endsWith("assets/search-index.json")) return Response.json([{url:"/writing/an-essay/",title:"The Actual Title"}]);
    if (url.includes("homeFeatured.json")) return Response.json({}, {status:404});
    if (url.includes("/contents/src/writing/essays?")) return Response.json([{type:"file",name:"an-essay.md"},{type:"file",name:"archived-essay.md"}]);
    throw new Error(`Unexpected fixture: ${url}`);
  });
  const res = await dashboard.fetch(new Request(origin + "/featured"), {...env,GITHUB_PUBLISH_TOKEN:"fixture"},identity("owner@example.test"));
  assert.equal(res.status,200);
  const html = await res.text();
  assert.match(html, /<option value="\/writing\/an-essay\/">The Actual Title<\/option>/);
  assert.match(html, /Choose Published Work/);
  assert.doesNotMatch(html, /archived-essay/);
});
