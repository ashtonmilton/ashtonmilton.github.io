import {PublishError} from "./publishing.mjs";

const fixed = new Map([
  ["home", ["Home", "src/index.njk"]], ["work", ["Work", "src/writing/index.njk"]],
  ["research", ["Research", "src/research.njk"]], ["policy", ["Policy Analysis", "src/policy-analysis.njk"]],
  ["about", ["About", "src/about.njk"]], ["contact", ["Contact", "src/contact.njk"]],
  ["about-zh", ["About (Simplified Chinese)", "src/about-zh.njk"]], ["about-ja", ["About (Japanese)", "src/about-ja.njk"]],
  ["about-th", ["About (Thai)", "src/about-th.njk"]], ["about-vi", ["About (Vietnamese)", "src/about-vi.njk"]]
]);
const api = "https://api.github.com/repos/ashtonmilton/ashtonmilton.github.io/contents/";
export const editablePages = [...fixed].map(([id, [title]]) => [id, title]);
const validPost = /^article:([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const metadataKeys = new Set(["title", "metaTitle", "description", "summary", "question", "readingTime"]);
const welcomeKeys = new Set(["eyebrow", "jump", "lede", "exitTitle", "exitDescription", "exitLink"]);
const encoder = new TextEncoder();
const byteLimit = 160 * 1024;

function base64(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function resolvePage(id) {
  const article = validPost.exec(id);
  if (article && id.length <= 98) return {title: article[1].replace(/-/g, " "), path: `src/writing/essays/${article[1]}.md`, markdown: true};
  if (fixed.has(id)) { const [title, path] = fixed.get(id); return {title, path, markdown: false}; }
  throw new PublishError("This page is not available in the copy editor.", 404);
}

const entities = {amp: "&", lt: "<", gt: ">", nbsp: "\u00a0", quot: '"', apos: "'"};
const decodeEntities = (value) => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|nbsp|quot|apos);/gi, (raw, code) => {
  if (code[0] !== "#") return entities[code.toLowerCase()] ?? raw;
  const point = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : Number(code.slice(1));
  return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : raw;
});
const safeHtml = (value) => value.replace(/[&<>"{}]/g, (char) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "{":"&#123;", "}":"&#125;"})[char]);

export function copyFields(source, markdown) {
  const fields = [];
  const add = (offset, raw, label, type, value) => fields.push({offset, raw, label, type, value});
  const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  const bodyOffset = front?.[0].length || 0;
  if (front) {
    for (const line of front[1].matchAll(/^( *)([A-Za-z]+): ("(?:[^"\\]|\\.)*")[ \t]*$/gm)) {
      const parent = [...front[1].slice(0, line.index).matchAll(/^([A-Za-z]+):/gm)].at(-1)?.[1];
      if (!(line[1] ? (parent === "welcome" && welcomeKeys.has(line[2])) || (parent === "homeFeature" && metadataKeys.has(line[2])) : metadataKeys.has(line[2]))) continue;
      try { add(front[0].indexOf(front[1]) + line.index + line[1].length + line[2].length + 2, line[3], line[2], "json", JSON.parse(line[3])); }
      catch { /* Leave non-JSON YAML scalars unchanged. */ }
    }
    const tags = /^tags: (\[[^\r\n]*\])[ \t]*$/m.exec(front[1]);
    if (tags) {
      try {
        const list = JSON.parse(tags[1]);
        if (Array.isArray(list) && list.every((item) => typeof item === "string")) {
          add(front[0].indexOf(front[1]) + tags.index + 6, tags[1], "Tags, One per Line", "tags", list.join("\n"));
        }
      } catch { /* Leave other YAML tag formats unchanged. */ }
    }
  }
  const body = source.slice(bodyOffset);
  const protectedToken = /<!--[\s\S]*?-->|<(script|style|pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>|\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}|<(?:\/?[A-Za-z][\w:-]*)(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
  let end = 0;
  function text(start, finish) {
    const fragment = body.slice(start, finish);
    const paragraphs = markdown ? fragment.split(/(\r?\n[\t ]*\r?\n)/) : [fragment];
    let cursor = start;
    for (const raw of paragraphs) {
      const content = raw.trim();
      if (content && /[\p{L}\p{N}]/u.test(content) && !/^(?:```|~~~)/.test(content)) {
        add(bodyOffset + cursor + raw.indexOf(content), content, "Page Copy", markdown ? "markdown" : "html", decodeEntities(content));
      }
      cursor += raw.length;
    }
  }
  for (const token of body.matchAll(protectedToken)) {
    text(end, token.index);
    const attr = /^<img\b/i.test(token[0]) && /\salt="([^"{}]*)"/i.exec(token[0]);
    if (attr) add(bodyOffset + token.index + attr.index + 6, attr[1], "Image Description", "html", decodeEntities(attr[1]));
    const link = !markdown && /^<a\b/i.test(token[0]) && /\shref="([^"{}]+)"/i.exec(token[0]);
    if (link && /^(?:https:\/\/|mailto:|\/(?!\/)|#)/i.test(link[1])) add(bodyOffset + token.index + link.index + 7, link[1], "Link Destination", "url", decodeEntities(link[1]));
    end = token.index + token[0].length;
  }
  text(end, body.length);
  return fields.sort((a, b) => a.offset - b.offset);
}

export function applyCopy(source, fields, submitted) {
  let changed = 0;
  for (const [index, field] of [...fields.entries()].reverse()) {
    const value = submitted.get(`copy-${index}`);
    if (typeof value !== "string") throw new PublishError("The form is incomplete. Open it again before saving.");
    const input = value.replace(/\r\n/g, "\n");
    if (input === field.value.replace(/\r\n/g, "\n")) continue;
    if ((!input.trim() && field.type !== "tags") || input.length > Math.max(4000, field.value.length + 2000) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input)) {
      throw new PublishError("Keep each field non-empty and use text only.");
    }
    let replacement = safeHtml(input);
    if (field.type === "json") {
      if (input.length > 500 || /[\r\n<>{}]/.test(input)) throw new PublishError("Keep metadata on one line and use plain text under 500 characters.");
      replacement = JSON.stringify(input);
    } else if (field.type === "url") {
      if (input.length > 500 || !/^(?:https:\/\/|mailto:|\/(?!\/)|#)[^\s<>"'\\{}]+$/i.test(input)) throw new PublishError("Use a valid HTTPS address, site path, section link or email link.");
    } else if (field.type === "tags") {
      const tags = [...new Set(input.split("\n").map((tag) => tag.trim()).filter(Boolean))];
      if (tags.length > 8 || tags.some((tag) => tag.length > 60 || /[<>{}]/.test(tag))) throw new PublishError("Use up to eight short tags, one per line.");
      replacement = JSON.stringify(tags);
    } else if (field.type === "markdown") {
      // Preserve Markdown punctuation; do not introduce code, templates or embedded remote media.
      if (/^\s*(?:```|~~~|---\s*$)/m.test(input)) throw new PublishError("Edit the words without adding code blocks or metadata.");
      replacement = input.replace(/[<>{}]/g, safeHtml).replace(/!\[/g, "!&#91;");
    }
    source = source.slice(0, field.offset) + replacement + source.slice(field.offset + field.raw.length);
    changed++;
  }
  if (!changed) throw new PublishError("No changes to publish.");
  return source;
}

const headers = (token) => ({Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "AshtonMilton-Editor", "Content-Type": "application/json"});

export async function openCopy(id, token) {
  const page = resolvePage(id);
  const response = await fetch(`${api}${page.path}?ref=main`, {headers: headers(token), redirect: "manual", signal: AbortSignal.timeout(5500)});
  if (!response.ok) throw new PublishError("The source file could not be opened.", response.status === 404 ? 404 : 502);
  const file = await response.json();
  if (file.type !== "file" || file.encoding !== "base64" || file.size > byteLimit || !/^[a-f0-9]{40}$/.test(file.sha || "")) throw new PublishError("This file cannot be opened here.", 409);
  const source = new TextDecoder("utf-8", {fatal: true}).decode(Uint8Array.from(atob(file.content.replace(/\s/g, "")), (byte) => byte.charCodeAt(0)));
  if (page.markdown && /^dashboardEditable: true$/m.test(source.split(/^---$/m)[1] || "")) throw new PublishError("Use Edit Work for pieces created in this dashboard.", 409);
  return {...page, previous: file.sha, source, fields: copyFields(source, page.markdown)};
}

export async function saveCopy(id, token, form) {
  if (form.get("confirm") !== "yes") throw new PublishError("Confirm that these changes may be published.");
  const page = await openCopy(id, token);
  if (form.get("previous") !== page.previous) throw new PublishError("This page changed after you opened it. Reopen it before trying again.", 409);
  const bytes = encoder.encode(applyCopy(page.source, page.fields, form));
  if (bytes.length > byteLimit) throw new PublishError("The updated page is too large.", 413);
  const response = await fetch(api + page.path, {method: "PUT", headers: headers(token), redirect: "manual", signal: AbortSignal.timeout(9000),
    body: JSON.stringify({branch: "main", message: `Edit website copy: ${page.title}`, sha: page.previous, content: base64(bytes)})});
  if (response.status === 409 || response.status === 422) throw new PublishError("GitHub declined the change. Reopen this page before trying again.", 409);
  if (response.status !== 200) throw new PublishError("GitHub did not accept the edit.", 502);
  const sha = (await response.json()).commit?.sha;
  if (!/^[a-f0-9]{40}$/.test(sha || "")) throw new PublishError("No commit receipt was returned. Check GitHub before retrying.", 502);
  return sha;
}

export async function uploadFile(token, form) {
  const file = form.get("file");
  if (form.get("confirm") !== "yes") throw new PublishError("Confirm that this file may be made public.");
  const original = typeof file?.name === "string" ? file.name.toLowerCase() : "";
  const extension = /\.(pdf|jpg|jpeg|png|webp)$/.exec(original);
  const stem = extension ? original.slice(0, extension.index).normalize("NFKD").replace(/\p{Mark}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "";
  const name = stem ? stem + extension[0] : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.(pdf|jpg|jpeg|png|webp)$/.test(name) || name.length > 100 || !file?.size || file.size > 4 * 1024 * 1024) {
    throw new PublishError("Choose a PDF, JPEG, PNG or WebP under 4 MiB. Use a filename such as policy-brief.pdf.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = String.fromCharCode(...bytes.subarray(0, 12));
  const ext = name.split(".").at(-1);
  const formats = {pdf: head.startsWith("%PDF-"), jpg: bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    png: head.startsWith("\x89PNG\r\n\x1a\n"), webp: head.startsWith("RIFF") && head.slice(8) === "WEBP"};
  if (!formats[ext === "jpeg" ? "jpg" : ext]) throw new PublishError("The file contents do not match its extension.");
  const path = `/assets/uploads/${name}`;
  const response = await fetch(api + path.slice(1), {method: "PUT", headers: headers(token), redirect: "manual", signal: AbortSignal.timeout(12000),
    body: JSON.stringify({branch: "main", message: `Upload public asset: ${name}`, content: base64(bytes)})});
  if (response.status === 409 || response.status === 422) throw new PublishError("Upload not accepted. Use a new filename; this form does not replace files.", 409);
  if (response.status !== 201) throw new PublishError("GitHub did not accept the upload.", 502);
  const sha = (await response.json()).commit?.sha;
  if (!/^[a-f0-9]{40}$/.test(sha || "")) throw new PublishError("No commit receipt was returned. Check GitHub before retrying.", 502);
  return {sha, path};
}
