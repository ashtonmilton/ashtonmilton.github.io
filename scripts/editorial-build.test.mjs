import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import test from "node:test";
import {publicationFromForm, publicationSource} from "../edge/admin/publishing.mjs";
import {parseWriting} from "../edge/admin/legacy.mjs";

test("A new photo essay and reordered homepage features pass the public build verifier", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "ashton-editorial-"));
  try {
    for (const path of ["src", "assets", "edge", "lib", "localisation", "publications", "scripts", "robots.txt", ".eleventy.js", "package.json"]) {
      cpSync(path, join(cwd, path), {recursive: true});
    }
    symlinkSync(resolve("node_modules"), join(cwd, "node_modules"));
    mkdirSync(join(cwd, "assets/uploads"), {recursive: true});
    const photos = ["01-framed-tiananmen.webp", "02-tiananmen.webp"].map((name, index) => {
      copyFileSync(join(cwd, "assets/images/photo-essays/on-display", name), join(cwd, "assets/uploads", name));
      return {src: `/assets/uploads/${name}`, alt: `Test photo ${index + 1}.`, caption: `Caption ${index + 1}.`, place: "Beijing", width: 1152, height: 1536};
    });
    const form = new URLSearchParams({title: "Local Photo Fixture", type: "photo", summary: "An isolated test photo essay.", confirm: "yes", writing: "An introduction."});
    const post = await publicationFromForm(form, new Date(), {question: "What is visible?", photos, shareImage: photos[0].src, scripts: ["/assets/js/photo-essay.js"]});
    writeFileSync(join(cwd, `src/writing/essays/${post.slug}.md`), post.markdown);
    writeFileSync(join(cwd, "src/_data/homeFeatured.json"), JSON.stringify([`/writing/${post.slug}/`, "/policy-analysis/", "/writing/what-is-hukou/"]));
    const checkBuild = () => {
      for (const [cmd, args] of [[process.execPath, ["node_modules/@11ty/eleventy/cmd.cjs"]], ["python3", ["scripts/build-search.py"]], ["python3", ["scripts/verify-site.py"]]]) {
        const result = spawnSync(cmd, args, {cwd, encoding: "utf8", env:{...process.env, GITHUB_SHA:"a".repeat(40)}});
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      }
    };
    checkBuild();
    const used = JSON.parse(readFileSync(join(cwd, "_site/assets/editorial-references.json"), "utf8"));
    assert.deepEqual(used.references[photos[0].src], [`/writing/${post.slug}/`]);
    assert.ok(used.references[`/writing/${post.slug}/`].includes("/"));
    const archived = parseWriting(post.markdown);
    writeFileSync(join(cwd, `src/writing/essays/${post.slug}.md`), publicationSource({...archived.data, permalink:false,
      status:"archived", adminArchivedUrl:archived.data.permalink, eleventyExcludeFromCollections:true}, archived.originalBody));
    writeFileSync(join(cwd, "src/_data/homeFeatured.json"), JSON.stringify(["/policy-analysis/", "/writing/what-is-hukou/", "/writing/on-display/"]));
    rmSync(join(cwd, "_site"), {recursive:true});
    checkBuild();
    assert.equal(existsSync(join(cwd, `_site/writing/${post.slug}/index.html`)), false);
    assert.equal(JSON.parse(readFileSync(join(cwd, "_site/assets/editorial-references.json"), "utf8")).references[photos[0].src], undefined);
  } finally {
    rmSync(cwd, {recursive: true, force: true});
  }
});
