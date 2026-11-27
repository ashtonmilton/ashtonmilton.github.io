import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {normalise, queryWork, rankWork, workDocument} from "../assets/js/work-relevance.js";

const rows = JSON.parse(readFileSync(new URL("../_site/assets/search-index.json", import.meta.url)));
function search(query) {
  return rows.map((row) => [row.url, rankWork(workDocument(row), queryWork(query))]).filter((row) => row[1]).sort((a, b) => b[1] - a[1]).map(([url]) => url);
}

test("Full archive ranks direct hits first and returns work connected by established subjects", () => {
  const asia = search("Asia");
  assert.ok(asia.length >= 6, asia.join(", "));
  assert.equal(asia[0], "/writing/east-asian-cities-newer/");
  assert.ok(asia.includes("/writing/growth-with-vulnerability/"));
  assert.ok(asia.includes("/writing/after-the-blueprint/"));
  assert.ok(!search("Japan").includes("/writing/growth-with-vulnerability/"));
  assert.ok(search("education and migration").includes("/writing/what-is-hukou/"));
  assert.ok(search("social protection").includes("/writing/growth-with-vulnerability/"));
  assert.ok(search("photographs").includes("/writing/on-display/"));
  assert.deepEqual(search("zxzx nonexistent qzqz"), []);
  assert.equal(normalise("CHINA’S Cities, Kantō"), "chinas cities kanto");
});
