const fs = require("node:fs");
const path = require("node:path");

// Read the actual full-size image references in the two static photo essays.
module.exports = Object.fromEntries(["on-display", "after-the-blueprint"].map((slug) => {
  const source = fs.readFileSync(path.join(__dirname, "../writing/essays", slug + ".md"), "utf8");
  return [`/writing/${slug}/`, [...source.matchAll(/<img src="(\/assets\/images\/photo-essays\/[^"]+)"/g)]
    .map(([, src]) => ({ src }))];
}));
