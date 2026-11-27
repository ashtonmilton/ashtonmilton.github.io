import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {parseWriting} from "./legacy.mjs";
import {revisePhotoMetadata, safeWriting} from "./publishing.mjs";

const source = (slug) => readFileSync(new URL(`../../src/writing/essays/${slug}.md`, import.meta.url), "utf-8");

test("An original HTML note and a Markdown essay both open in the same text format", () => {
  const note = parseWriting(source("the-trouble-with-another-line"));
  assert.match(note.writing, /\[government announced\]\(https:\/\/www\.gov\.uk\//);
  assert.doesNotMatch(note.writing, /<p>/);
  const essay = parseWriting(source("east-asian-cities-newer"));
  assert.match(essay.writing, /## Cities Carry the History/);
  assert.equal(essay.data.relatedReading.length, 2);
  assert.match(safeWriting(essay.writing), /\[https:\/\/doi\.org/);
});

test("An original gallery retains every photo, pair, caption and note in the unified editor", () => {
  for (const [slug, count] of [["after-the-blueprint", 8], ["on-display", 7]]) {
    const original = parseWriting(source(slug));
    assert.equal(original.photos.length, count);
    assert.ok(original.photos.some((photo) => photo.pair && photo.notes));
    assert.ok(original.photos.some((photo) => photo.notes.includes("Companion photo essay")));
    assert.ok(original.photos.every(({srcset, alt, caption, width, height}) => srcset && alt && caption && width && height));
    const preserved = parseWriting(revisePhotoMetadata({slug, ...original}, {photos: original.photos}, original.writing).markdown);
    assert.equal(preserved.legacyPhotos, true);
    assert.equal(preserved.originalBody, original.originalBody);
    const reordered = [...original.photos].reverse();
    const changed = parseWriting(revisePhotoMetadata({slug, ...original}, {photos: reordered}, original.writing).markdown);
    assert.equal(changed.legacyPhotos, false);
    assert.deepEqual(changed.photos, reordered);
  }
});
