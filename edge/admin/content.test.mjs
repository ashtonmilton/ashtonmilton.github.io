import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {applyCopy, copyFields, openCopy, uploadFile} from "./content.mjs";

for (const [id,file,anchor,first,reference] of [
  ["research","research","research-question","Research Question","George, A. L."],
  ["policy","policy-analysis","distribution","First, Distinguish Aggregate Performance from Distributional Outcomes","Benjamin, D."]
]) {
  test(`${id} opens as sections, body text and editable references without changing the template`, () => {
    const source = readFileSync(new URL(`../../src/${file}.njk`,import.meta.url),"utf8");
    const fields = copyFields(source,false,id);
    const section = fields.findIndex(({label,group}) => label === "Body Text" && group === first);
    const refs = fields.findIndex(({label,group}) => label === "Reference Entries" && group === "References");
    assert.ok(section >= 0 && refs >= 0);
    assert.ok(fields[refs].value.startsWith(reference));
    assert.ok(!fields.some(({type,value}) => type === "url" && value === `#${anchor}`));
    const form = new Map(fields.map(({value},i) => [`copy-${i}`,value]));
    form.set(`copy-${section}`,fields[section].value + "\n\n## Added Section\n\nBody <text>.");
    form.set(`copy-${refs}`,fields[refs].value + "\n\nA new reference.");
    const result = applyCopy(source,fields,form);
    assert.match(result,/<h[23]>Added Section<\/h[23]>\n<p>Body &lt;text&gt;\.<\/p>/);
    assert.ok(result.includes(`id="${anchor}">${first}`));
    assert.ok(result.includes('{% include "related-reading.njk" %}'));
    assert.ok(copyFields(result,false,id).some(({label,value}) => label === "Section Heading" && value === "Added Section"));
  });
}

test("Page editing groups appropriate fields and does not expose Work search messages", () => {
  const home = copyFields(readFileSync(new URL("../../src/index.njk", import.meta.url), "utf8"));
  assert.ok(home.some(({label,group}) => label === "Introduction" && group === "Homepage Header"));
  assert.ok(home.some(({label,group}) => label === "Research Subtitle" && group === "Current Research"));
  assert.ok(home.some(({label,group}) => label === "Search and Social Summary" && group === "Search and Sharing"));
  const work = copyFields(readFileSync(new URL("../../src/writing/index.njk", import.meta.url), "utf8"));
  assert.ok(!work.some(({value}) => ["All Work","No matching work."].includes(value)));
  assert.ok(work.some(({label}) => label === "Academic Work Disclosure"));
});

test("Copy edits preserve template logic, links, metadata and structure, and escape new markup", async () => {
  const source = '---\nlayout: "base"\ndescription: "Original metadata"\n---\n<h1>Original heading</h1><a href="/contact/">Contact</a>{% if true %}<p>{{ value }}</p>{% endif %}\n<img src="/test.webp" alt="A photo.">';
  const fields = copyFields(source, false);
  assert.deepEqual(fields.map(({value}) => value), ["Original metadata", "Original heading", "/contact/", "Contact", "A photo."]);
  const form = new Map(fields.map(({value}, i) => [`copy-${i}`, value]));
  form.set("copy-1", 'New <script> {{ value }}');
  const output = applyCopy(source, fields, form);
  assert.match(output, /<h1>New &lt;script&gt; &#123;&#123; value &#125;&#125;<\/h1>/);
  assert.ok(output.includes('<a href="/contact/">Contact</a>{% if true %}<p>{{ value }}</p>{% endif %}'));
  form.set("copy-2", "javascript:alert(1)");
  assert.throws(() => applyCopy(source, fields, form), /valid HTTPS address/);
  await assert.rejects(openCopy("article:../../arbitrary", "unused"), /not available/);
});

test("Uploads do not accept script files or replace existing assets", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async () => Response.json({}, {status: 422}));
  const form = new FormData();
  form.set("confirm", "yes");
  form.set("file", new Blob(["<script>"]), "policy.pdf");
  await assert.rejects(uploadFile("token", form), /match its extension/);
  assert.equal(fetch.mock.callCount(), 0);
  form.set("file", new Blob(["%PDF-1.7 test"]), "policy.pdf");
  await assert.rejects(uploadFile("token", form), /does not replace/);
  const [url, request] = fetch.mock.calls[0].arguments;
  assert.match(url, /\/contents\/assets\/uploads\/policy\.pdf$/);
  assert.ok(!("sha" in JSON.parse(request.body)));
});
