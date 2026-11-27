const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { tmpdir } = require("node:os");
const loadPublications = require("../lib/publications.cjs");

test("Only approved files enter the catalogue and invalid releases fail", (context) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), "ashton-catalogue-")));
  context.after(() => fs.rmSync(root, { recursive: true }));
  fs.mkdirSync(path.join(root, "files"));
  fs.writeFileSync(path.join(root, "files/sample.csv"), "year,value\n2026,1\n");
  const valid = {
    release: "public", id: "sample", title: "Test only", description: "Fixture",
    date: "2026-11-27", author: "Ashton Milton", type: "Dataset", subjects: ["Test"],
    keywords: ["sample"], version: "1.0", citation: "A citation.", file: "sample.csv"
  };
  const write = (rows) => fs.writeFileSync(path.join(root, "catalogue.json"), JSON.stringify(rows));
  write([{ ...valid, release: "private", file: "missing.pdf" }, valid]);
  const [entry, ...rest] = loadPublications(root);
  assert.equal(entry.download, "/downloads/sample/sample.csv");
  assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  assert.equal(rest.length, 0);
  for (const invalid of [{ file: "../sample.csv" }, { date: "2026-02-30" }, { citation: "" }]) {
    write([{ ...valid, ...invalid }]);
    assert.throws(() => loadPublications(root), /Invalid public publication metadata/);
  }
});
