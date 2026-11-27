import assert from "node:assert/strict";
import test from "node:test";
import {changeVisibility, removeAsset} from "./removal.mjs";
import {parseWriting} from "./legacy.mjs";

const sha = "a".repeat(40);
const path = "/assets/uploads/article.pdf";
const form = new URLSearchParams({asset: path, confirm: "yes"});

test("Public file removal blocks files used on the current published site", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async (url) => url.includes("/git/ref/")
    ? Response.json({object:{sha}}) : Response.json({revision:sha, references:{[path]: ["/writing/a-piece/"]}}));
  await assert.rejects(removeAsset(form, "token"), /Still used on \/writing\/a-piece\//);
  assert.equal(fetch.mock.callCount(), 2);
});

test("Missing or stale Pages index can unpublish unlinked work using the exact current Git sources", async (context) => {
  const source = '---\ntitle: "Test Note"\nstatus: "published"\npermalink: "/writing/test-note/"\n---\nTest.\n';
  const tree = "b".repeat(40), linkBlob = "c".repeat(40), commit = "d".repeat(40);
  const action = new URLSearchParams({slug:"test-note", action:"archive", previous:sha, confirm:"yes"});
  let linked = true, incomplete = false, writes = 0;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.includes("/git/ref/")) return Response.json({object:{sha}});
    if (url.includes("editorial-references")) return new Response(null, {status:404});
    if (url.endsWith(`git/commits/${sha}`)) return Response.json({tree:{sha:tree}});
    if (url.includes("?recursive=1")) return Response.json({tree:[
      {type:"blob",mode:"100644",path:"src/writing/essays/test-note.md",size:source.length,sha},
      {type:"blob",mode:"100644",path:"src/writing/essays/another-note.md",size:63,sha:linkBlob}
    ]});
    if (url.endsWith("/graphql")) {
      const {query} = JSON.parse(options.body);
      assert.ok(query.includes(linkBlob));
      assert.ok(!query.includes(`oid:"${sha}"`));
      return Response.json({data:{repository:{f0:{oid:linkBlob, isTruncated:incomplete,
        text:linked ? "[Another note](../test-note/)" : "[Unrelated note](/writing/test-note-two/)"}}}});
    }
    if (url.includes("contents/src/writing/essays/test-note.md")) return Response.json({sha,type:"file",encoding:"base64",size:source.length,content:Buffer.from(source).toString("base64")});
    assert.notEqual(options.method, "GET");
    writes++;
    if (url.endsWith("git/trees")) {
      const {base_tree, tree:entries} = JSON.parse(options.body);
      assert.equal(base_tree, tree);
      assert.equal(entries[0].path, "src/writing/essays/test-note.md");
      assert.equal(parseWriting(entries[0].content).data.status, "archived");
      return Response.json({sha:tree});
    }
    if (url.endsWith("git/commits")) return Response.json({sha:commit});
    assert.deepEqual(JSON.parse(options.body), {sha:commit, force:false});
    return Response.json({object:{sha:commit}});
  });
  await assert.rejects(changeVisibility(action, "token"), /Still used on src\/writing\/essays\/another-note\.md/);
  linked = false;
  incomplete = true;
  await assert.rejects(changeVisibility(action, "token"), /could not be checked completely/);
  assert.equal(writes, 0);
  incomplete = false;
  assert.equal(await changeVisibility(action, "token"), commit);
  assert.equal(writes, 3);
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
