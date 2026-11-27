import assert from "node:assert/strict";
import test from "node:test";
import {changeVisibility, removeAsset} from "./removal.mjs";
import {parseWriting} from "./legacy.mjs";

const sha = "a".repeat(40);
const path = "/assets/uploads/article.pdf";
const form = new URLSearchParams({asset: path, confirm: "yes"});

test("Public file removal blocks stale deployments and files used on the site", async (context) => {
  let revision = "b".repeat(40);
  const fetch = context.mock.method(globalThis, "fetch", async (url) => url.includes("/git/ref/")
    ? Response.json({object:{sha}}) : Response.json({revision, references:{[path]: ["/writing/a-piece/"]}}));
  await assert.rejects(removeAsset(form, "token"), /most recent GitHub Pages deployment/);
  revision = sha;
  await assert.rejects(removeAsset(form, "token"), /Still used on \/writing\/a-piece\//);
  assert.equal(fetch.mock.callCount(), 4);
});

test("Unused files are removed in a recoverable commit without force-pushing", async (context) => {
  const tree = "b".repeat(40);
  const commit = "c".repeat(40);
  context.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.includes("/git/ref/")) return Response.json({object:{sha}});
    if (url.includes("editorial-references")) return Response.json({revision:sha,references:{}});
    if (url.endsWith(`git/commits/${sha}`)) return Response.json({tree:{sha:tree}});
    if (url.endsWith("git/trees")) {
      assert.deepEqual(JSON.parse(options.body), {base_tree:tree, tree:[{path:path.slice(1), mode:"100644", type:"blob", sha:null}]});
      return Response.json({sha:tree});
    }
    if (url.endsWith("git/commits")) return Response.json({sha:commit});
    assert.equal(options.method, "PATCH");
    assert.deepEqual(JSON.parse(options.body), {sha:commit, force:false});
    return Response.json({object:{sha:commit}});
  });
  assert.equal(await removeAsset(form, "token"), commit);
});

test("Archived work can be restored at its original URL without changing its body", async (context) => {
  const archived = '---\ntitle: "Original Note"\nstatus: "archived"\npermalink: false\nadminArchivedUrl: "/writing/old-note/"\neleventyExcludeFromCollections: true\n---\n<p>Keep this exact body.</p>\n';
  const commit = "d".repeat(40);
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /\/contents\/src\/writing\/essays\/old-note\.md/);
    if (options.method !== "PUT") return Response.json({sha,type:"file",encoding:"base64",size:archived.length,content:Buffer.from(archived).toString("base64")});
    const request = JSON.parse(options.body);
    assert.equal(request.sha, sha);
    const restored = parseWriting(Buffer.from(request.content,"base64").toString("utf8"));
    assert.equal(restored.data.permalink, "/writing/old-note/");
    assert.equal(restored.data.status, "published");
    assert.equal(restored.originalBody, parseWriting(archived).originalBody);
    assert.ok(!("eleventyExcludeFromCollections" in restored.data));
    return Response.json({commit:{sha:commit}});
  });
  assert.equal(await changeVisibility(new URLSearchParams({slug:"old-note",action:"restore",previous:sha,confirm:"yes"}), "token"), commit);
});
