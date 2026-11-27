import assert from "node:assert/strict";
import test from "node:test";
import {photoSelection, saveFeatured, savePhotoEssay} from "./editorial.mjs";

const first = "/assets/uploads/tokyo.webp";
const second = "/assets/uploads/bangkok.webp";
const candidateFiles = (paths) => paths.map((path) => ({type: "file", path: path.slice(1), name: path.split("/").at(-1)}));
const buf = (text) => ({encoding: "base64", content: Buffer.from(text).toString("base64")});
const photo = () => new URLSearchParams({title:"City Streets", summary:"A photographic study of two streets.", question:"What do streets reveal?", confirm:"yes",
  "photo-1":first, "width-1":"1000", "height-1":"500", "alt-1":"A street in Tokyo.", "caption-1":"An ordinary street.",
  "photo-2":second, "width-2":"1200", "height-2":"800", "alt-2":"A street in Bangkok.", "caption-2":"A crossing between streets."});

test("Photo essays require uploaded images, real dimensions and captions", () => {
  const form = photo();
  assert.equal(photoSelection(form, [first, second]).length, 2);
  form.set("photo-2", first);
  assert.throws(() => photoSelection(form, [first, second]), /different image/);
  form.set("photo-2", second);
  form.set("alt-2", "");
  assert.throws(() => photoSelection(form, [first, second]), /alt 2/);
});

test("Photo publication creates one article file after checking the live template", async (context) => {
  const sha = "a".repeat(40);
  const api = context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.redirect, "manual");
    if (options.method === "PUT") return Response.json({commit: {sha}}, {status: 201});
    if (url.includes("article.njk")) return Response.json(buf("photos | photoSpreads"));
    if (url.includes("/assets/uploads")) return Response.json(candidateFiles([first, second]));
    throw new Error("Unexpected endpoint");
  });
  assert.deepEqual(await savePhotoEssay(photo(), "fixture"), {slug:"city-streets", sha});
  const write = api.mock.calls.find(({arguments:[, options]}) => options.method === "PUT");
  const {content} = JSON.parse(write.arguments[1].body);
  const markdown = Buffer.from(content, "base64").toString("utf8");
  assert.match(markdown, /category: "Photo Essays"/);
  assert.match(markdown, /question: "What do streets reveal\?"/);
  assert.match(markdown, /"width":1200,"height":800/);
});

test("Featured Work publishes exactly three eligible paths in the requested order", async (context) => {
  const paths = ["/writing/an-essay/", "/policy-analysis/", "/writing/a-note/"];
  const token = "fixture";
  const commit = "b".repeat(40);
  context.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(request.redirect, "manual");
    if (request.method === "PUT") {
      const json = JSON.parse(request.body);
      assert.deepEqual(JSON.parse(Buffer.from(json.content, "base64").toString("utf8")), paths);
      return Response.json({commit: {sha: commit}}, {status: 201});
    }
    if (url.includes("homeFeatured.json")) return new Response(null, {status: 404});
    if (url.includes("index.njk")) return Response.json(buf("selected in homeFeatured or"));
    if (url.includes(".md?ref=main")) return Response.json(buf("---\nstatus: published\n---\nText"));
    return Response.json(candidateFiles(["/an-essay.md", "/a-note.md"]));
  });
  const form = new URLSearchParams({"slot-1":paths[0], "slot-2":paths[1], "slot-3":paths[2], previous:"", confirm:"yes"});
  assert.equal(await saveFeatured(form, token), commit);
  form.set("slot-2", paths[0]);
  await assert.rejects(saveFeatured(form, token), /three different pieces/);
});
