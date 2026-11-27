import {PublishError} from "./publishing.mjs";
import {parseFragment} from "parse5";
import {applyEdition, editionFields, generatedProfiles} from "./translations.mjs";

const fixed = new Map([
  ["home", ["Home", "src/index.njk"]], ["work", ["Work", "src/writing/index.njk"]],
  ["research", ["Research", "src/research.njk"]], ["policy", ["Policy Analysis", "src/policy-analysis.njk"]],
  ["about", ["About", "src/about.njk"]], ["contact", ["Contact", "src/contact.njk"]],
  ["about-zh", ["About (Simplified Chinese)", "src/about-zh.njk"]], ["about-ja", ["About (Japanese)", "src/about-ja.njk"]],
  ["about-th", ["About (Thai)", "src/about-th.njk"]], ["about-vi", ["About (Vietnamese)", "src/about-vi.njk"]],
  ["not-found", ["Page Not Found", "src/404.njk"]]
]);
const api = "https://api.github.com/repos/ashtonmilton/ashtonmilton.github.io/contents/";
export const editablePages = [...fixed].map(([id, [title]]) => [id, title]);
export const translatedPages = [...generatedProfiles].map(([id, {title}]) => [id,title]).sort((a,b) => a[1].localeCompare(b[1],"en-GB"));
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
  if (generatedProfiles.has(id)) {
    const edition = generatedProfiles.get(id);
    return {title:edition.title,path:edition.path,edition};
  }
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

const shortText = (text) => text.replace(/\s+/g, " ").trim().split(" ").slice(0, 7).join(" ");
const copyNames = {metaTitle: "Search and Social Title", description: "Search and Social Summary", summary: "Archive Summary",
  title: "Title", question: "Opening Question", readingTime: "Reading Time", eyebrow: "Eyebrow", jump: "Profile Link Text", lede: "Introduction",
  exitTitle: "English Site Heading", exitDescription: "English Site Description", exitLink: "English Site Link Text"};
const sectionClasses = [["publication-hero", "Homepage Header"], ["featured-section", "Featured Work"], ["research-section", "Current Research"],
  ["interests-section", "Research Interests"], ["page-masthead", "Page Header"], ["archive-layout", "Work Archive"]];
const detailClasses = [["publication-description", "Introduction"], ["home-bio", "Short Biography"], ["eyebrow", "Eyebrow"],
  ["research-subtitle", "Research Subtitle"], ["academic-disclosure", "Academic Work Disclosure"], ["label", "Status Label"]];

function copyContext(body) {
  const masked = body.replace(/\{(?:\{[\s\S]*?\}\}|%[\s\S]*?%\}|#[\s\S]*?#\})/g, (value) => value.replace(/[^\r\n]/g, " "));
  const tree = parseFragment(masked, {sourceCodeLocationInfo: true});
  const elements = [];
  const value = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(value).join("");
  function walk(node, parent = []) {
    const stack = node.tagName ? [...parent, node] : parent;
    if (node.tagName && node.sourceCodeLocation) elements.push({start:node.sourceCodeLocation.startOffset, end:node.sourceCodeLocation.endOffset, stack});
    for (const child of node.childNodes || []) walk(child, stack);
  }
  walk(tree);
  const headings = elements.filter(({stack}) => stack.at(-1)?.tagName === "h2");
  return (offset, type, text) => {
    const stack = elements.findLast(({start,end}) => start <= offset && offset < end)?.stack || [];
    const has = (node, attr) => node.attrs?.some(({name}) => name === attr);
    const classes = (node) => node.attrs?.find(({name}) => name === "class")?.value.split(/\s+/) || [];
    const all = stack.flatMap(classes);
    const previous = headings.findLast(({start}) => start <= offset)?.stack.at(-1);
    const group = sectionClasses.find(([key]) => all.includes(key))?.[1] || (previous && value(previous).trim()) || "Page Content";
    const hasTag = (test) => stack.findLast(({tagName}) => test(tagName));
    const heading = hasTag((tag) => /^h[1-6]$/.test(tag));
    if (stack.some((node) => has(node, "data-filter") || has(node, "data-empty-state") || has(node, "data-search-status")) ||
        (heading && all.includes("archive-group-header"))) return null;
    const link = hasTag((tag) => tag === "a");
    const detail = detailClasses.find(([key]) => all.includes(key))?.[1];
    const label = type === "url" ? `${shortText(value(link || {})) || "Link"} Destination` :
      type === "alt" ? "Image Description" : detail || (
        heading ? (all.includes("publication-hero") && heading.tagName === "h1" ? (heading.childNodes?.find((node) => node.tagName === "span") === stack.at(-1) ? "Given Name" : "Family Name") : heading.tagName === "h1" ? "Page Heading" : "Heading") :
        link ? `Link Label: ${shortText(value(link) || text)}` : stack.some((node) => node.tagName === "p") ? "Paragraph" : "Text");
    return {label, group, compact: !!heading || !!link || !!detail || type !== "html"};
  };
}

function documentCopy(body, offset, fields, kind) {
  const tree = parseFragment(body, {sourceCodeLocationInfo:true});
  const find = (node, cls) => node.attrs?.some(({name,value}) => name === "class" && value.split(/\s+/).includes(cls)) ? node :
    (node.childNodes || []).map((child) => find(child, cls)).find(Boolean);
  const blocks = find(tree, "editorial-copy")?.childNodes.filter((node) => node.tagName) || [];
  if (!blocks.length) return fields;
  const start = (node) => node.sourceCodeLocation.startOffset;
  const end = (node) => node.sourceCodeLocation.endOffset;
  const inner = (node) => body.slice(node.sourceCodeLocation.startTag.endOffset, node.sourceCodeLocation.endTag.startOffset);
  const text = (node) => decodeEntities(inner(node).replace(/<br\s*\/?>/gi, "\n"));
  const plain = (node) => (node.childNodes || []).every((child) => child.nodeName === "#text" || child.tagName === "br");
  let group = "Document Opening";
  let refs = false;
  let paragraphs = [];
  const level = kind === "policy" ? 3 : 2;
  const last = blocks.at(-1);
  const add = (from, to, label, type, value, compact = false) =>
    fields.push({offset:offset+from, raw:body.slice(from,to), label, type, value, group, compact});
  const remove = (from, to) => {
    for (let i = fields.length - 1; i >= 0; i--) if (fields[i].offset >= offset+from && fields[i].offset < offset+to) fields.splice(i,1);
  };
  function flush() {
    if (!paragraphs.length) return;
    const from = start(paragraphs[0]), to = end(paragraphs.at(-1));
    remove(from,to);
    add(from,to,refs ? "Reference Entries" : "Body Text", refs ? "references-p" : `document-${level}`, paragraphs.map(text).join("\n\n"));
    paragraphs = [];
  }
  for (const node of blocks) {
    const tag = node.tagName;
    const disclosure = refs && kind === "policy" && node === last;
    if (tag === "p" && plain(node) && !node.attrs.length && !disclosure) {
      if (paragraphs.length && body.slice(end(paragraphs.at(-1)),start(node)).trim()) flush();
      paragraphs.push(node);
      continue;
    }
    flush();
    if (/^h[23]$/.test(tag) && plain(node)) {
      const anchor = node.attrs.find(({name}) => name === "id")?.value;
      refs = ["references","literature"].includes(anchor);
      group = refs ? "References" : text(node);
      const {startTag,endTag} = node.sourceCodeLocation;
      remove(start(node),end(node));
      add(startTag.endOffset,endTag.startOffset,refs ? "References Heading" : tag === `h${level}` ? "Section Heading" : "Subheading","html",text(node),true);
    } else if (tag === "ul" && refs && node.attrs.length === 1 && node.attrs[0].value === "reference-list") {
      const entries = node.childNodes.filter((child) => child.tagName);
      if (!entries.every((entry) => entry.tagName === "li" && !entry.attrs.length && plain(entry))) continue;
      const {startTag,endTag} = node.sourceCodeLocation;
      remove(start(node),end(node));
      add(startTag.endOffset,endTag.startOffset,"Reference Entries","references-li",entries.map(text).join("\n\n"));
    } else if (disclosure && tag === "p" && plain(node)) {
      const {startTag,endTag} = node.sourceCodeLocation;
      remove(start(node),end(node));
      add(startTag.endOffset,endTag.startOffset,"Publication Note","html",text(node));
    }
  }
  flush();
  const lead = blocks.find((node) => node.attrs.some(({value}) => value === "document-lead"));
  for (const field of fields) {
    const position = field.offset - offset;
    if (lead && position >= start(lead) && position < end(lead)) {
      field.group = "Document Title and Details";
      if (field.label === "Heading") field.label = "Document Title";
      else if (/^Period:/.test(field.value)) field.label = "Period";
      else if (/^Cases:/.test(field.value)) field.label = "Cases";
      else if (/^Outcome:/.test(field.value)) field.label = "Outcome";
      else if (field.label === "Paragraph") field.label = "Document Subtitle";
    }
  }
  const rail = find(tree, "document-rail");
  return fields.filter((field) => {
    const position = field.offset - offset;
    if (!rail || position < start(rail) || position >= end(rail)) return true;
    field.group = "Contents Links";
    return field.type !== "url";
  });
}

export function copyFields(source, markdown, id) {
  const fields = [];
  const add = (offset, raw, label, type, value, group = "Page Content", compact = false) => fields.push({offset, raw, label, type, value, group, compact});
  const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  const bodyOffset = front?.[0].length || 0;
  if (front) {
    for (const line of front[1].matchAll(/^( *)([A-Za-z]+): ("(?:[^"\\]|\\.)*")[ \t]*$/gm)) {
      const parent = [...front[1].slice(0, line.index).matchAll(/^([A-Za-z]+):/gm)].at(-1)?.[1];
      if (!(line[1] ? (parent === "welcome" && welcomeKeys.has(line[2])) || (parent === "homeFeature" && metadataKeys.has(line[2])) : metadataKeys.has(line[2]))) continue;
      try { add(front[0].indexOf(front[1]) + line.index + line[1].length + line[2].length + 2, line[3], copyNames[line[2]], "json", JSON.parse(line[3]), line[1] ? (parent === "welcome" ? "Welcome Screen" : "Homepage Feature") : "Search and Sharing", line[2] !== "description"); }
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
  const context = copyContext(body);
  function bodyField(offset, raw, type) {
    const decoded = decodeEntities(raw);
    const field = context(offset, type, decoded);
    if (field) add(bodyOffset + offset, raw, field.label, type === "alt" ? "html" : type, decoded, field.group, field.compact);
  }
  const protectedToken = /<!--[\s\S]*?-->|<(script|style|pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>|\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}|<(?:\/?[A-Za-z][\w:-]*)(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
  let end = 0;
  function text(start, finish) {
    const fragment = body.slice(start, finish);
    const paragraphs = markdown ? fragment.split(/(\r?\n[\t ]*\r?\n)/) : [fragment];
    let cursor = start;
    for (const raw of paragraphs) {
      const content = raw.trim();
      if (content && /[\p{L}\p{N}]/u.test(content) && !/^(?:```|~~~)/.test(content)) {
        bodyField(cursor + raw.indexOf(content), content, markdown ? "markdown" : "html");
      }
      cursor += raw.length;
    }
  }
  for (const token of body.matchAll(protectedToken)) {
    text(end, token.index);
    const attr = /^<img\b/i.test(token[0]) && /\salt="([^"{}]*)"/i.exec(token[0]);
    if (attr) bodyField(token.index + attr.index + 6, attr[1], "alt");
    const link = !markdown && /^<a\b/i.test(token[0]) && /\shref="([^"{}]+)"/i.exec(token[0]);
    if (link && /^(?:https:\/\/|mailto:|\/(?!\/)|#)/i.test(link[1])) bodyField(token.index + link.index + 7, link[1], "url");
    end = token.index + token[0].length;
  }
  text(end, body.length);
  const result = id === "research" || id === "policy" ? documentCopy(body, bodyOffset, fields, id) : fields;
  return result.sort((a, b) => a.offset - b.offset);
}

function renderDocument(input, type) {
  const entries = input.trim().split(/\n[\t ]*\n+/).map((entry) => entry.trim());
  const isList = type === "references-li";
  const level = Number(type.at(-1));
  const line = (value) => safeHtml(value).replace(/\n/g, "<br>");
  const html = entries.map((entry) => {
    if (!level) return isList ? `<li>${line(entry)}</li>` : `<p>${line(entry)}</p>`;
    if (entry.split("\n").some((part) => /^#{1,6}\s/.test(part))) {
      return entry.split("\n").map((part) => {
        const heading = /^(#{2,3})\s+(\S.*)$/.exec(part);
        if (!heading) return part ? `<p>${line(part)}</p>` : "";
        const tag = Math.max(heading[1].length,level);
        return `<h${tag}>${safeHtml(heading[2])}</h${tag}>`;
      }).join("\n");
    }
    return `<p>${line(entry)}</p>`;
  }).join("\n");
  return isList ? `\n${html}\n` : html;
}

export function applyCopy(source, fields, submitted) {
  let changed = 0;
  for (const [index, field] of [...fields.entries()].reverse()) {
    const value = submitted.get(`copy-${index}`);
    if (typeof value !== "string") throw new PublishError("The form is incomplete. Open it again before saving.");
    const input = value.replace(/\r\n/g, "\n");
    if (input === field.value.replace(/\r\n/g, "\n")) continue;
    const block = /^(?:document-|references-)/.test(field.type);
    if ((!input.trim() && field.type !== "tags") || input.length > Math.max(block ? 16000 : 4000, field.value.length + 2000) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input)) {
      throw new PublishError("Keep each field non-empty and use text only.");
    }
    let replacement = safeHtml(input);
    if (block) {
      replacement = renderDocument(input,field.type);
    } else if (field.type === "json") {
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

export async function openCopy(id, token, ref="main") {
  const page = resolvePage(id);
  const response = await fetch(`${api}${page.path}?ref=${ref}`, {headers: headers(token), redirect: "manual", signal: AbortSignal.timeout(5500)});
  if (!response.ok) throw new PublishError("The source file could not be opened.", response.status === 404 ? 404 : 502);
  const file = await response.json();
  if (file.type !== "file" || file.encoding !== "base64" || file.size > byteLimit || !/^[a-f0-9]{40}$/.test(file.sha || "")) throw new PublishError("This file cannot be opened here.", 409);
  const source = new TextDecoder("utf-8", {fatal: true}).decode(Uint8Array.from(atob(file.content.replace(/\s/g, "")), (byte) => byte.charCodeAt(0)));
  if (page.edition) {
    const {raw,fields} = editionFields(source,page.edition);
    const previous = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(raw))), (byte) => byte.toString(16).padStart(2,"0")).join("");
    return {...page,previous,fileSha:file.sha,source,fields};
  }
  if (page.markdown && /^dashboardEditable: true$/m.test(source.split(/^---$/m)[1] || "")) throw new PublishError("Use Edit Work for pieces created in this dashboard.", 409);
  return {...page, previous: file.sha, source, fields: copyFields(source, page.markdown, id)};
}

export function applyPageCopy(page,form,source=page.source) {
  if (form.get("previous") !== page.previous) throw new PublishError("This page changed after you opened it. Reopen it before trying again.",409);
  const updated = page.edition ? applyEdition(source,page.edition,form) : applyCopy(source,page.fields,form);
  if (encoder.encode(updated).length > byteLimit) throw new PublishError("The updated page is too large.",413);
  return updated;
}

export async function saveCopy(id, token, form) {
  if (form.get("confirm") !== "yes") throw new PublishError("Confirm that these changes may be published.");
  const page = await openCopy(id, token);
  const bytes = encoder.encode(applyPageCopy(page,form));
  const response = await fetch(api + page.path, {method: "PUT", headers: headers(token), redirect: "manual", signal: AbortSignal.timeout(9000),
    body: JSON.stringify({branch: "main", message: `Edit website copy: ${page.title}`, sha: page.fileSha || page.previous, content: base64(bytes)})});
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
