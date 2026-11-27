const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const directory = path.resolve(__dirname, "../publications");
const types = new Set(["Research Paper", "Policy Brief", "Working Paper", "Academic Essay", "Research Report",
  "Presentation", "Professional Publication", "Dataset", "Photographic Publication"]);

module.exports = function loadPublications(root = directory) {
  const rows = JSON.parse(fs.readFileSync(path.join(root, "catalogue.json"), "utf8"));
  const seen = new Set();
  return rows.flatMap((entry) => {
    if (entry.release !== "public") return [];
    const { id, title, description, date, author, type, subjects, keywords, version, citation, file } = entry;
    const plain = (value) => typeof value === "string" && value.trim() && !/[<>]/.test(value);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id || "") || seen.has(id) ||
        ![title, description, author, version, citation].every(plain) || author !== "Ashton Milton" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date ||
        !types.has(type) || ![subjects, keywords].every((values) => Array.isArray(values) && values.length && values.every(plain)) ||
        !/^[a-z0-9][a-z0-9.-]*\.(pdf|csv|json|webp|avif|jpg|png)$/.test(file || "")) {
      throw new Error(`Invalid public publication metadata for ${id || "(no id)"}`);
    }
    const source = path.join(root, "files", file);
    if (fs.realpathSync(source) !== source || !fs.statSync(source).isFile()) throw new Error(`Unsafe publication file: ${file}`);
    const bytes = fs.statSync(source).size;
    if (!bytes || bytes > 10 * 1024 * 1024) throw new Error(`Publication file is empty or exceeds the repository limit: ${file}`);
    seen.add(id);
    return [{ id, title, description, date, author, type, subjects, keywords, version, citation, bytes, source,
      url: `/publications/${id}/`, download: `/downloads/${id}/${file}`,
      sha256: createHash("sha256").update(fs.readFileSync(source)).digest("hex") }];
  }).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
};
