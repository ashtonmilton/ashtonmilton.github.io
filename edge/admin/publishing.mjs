const repository = "ashtonmilton/ashtonmilton.github.io";
const api = `https://api.github.com/repos/${repository}`;
const categories = new Map([
  ["article", "Independent work"], ["note", "Notes"],
  ["reflection", "Essays & reflections"], ["academic", "Selected academic work"]
]);
const maxRequestBytes = 160 * 1024;
const maxWritingBytes = 100 * 1024;
const encoder = new TextEncoder();
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
});

export class PublishError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function readForm(request, limit = maxRequestBytes) {
  const media = request.headers.get("Content-Type") || "";
  if (!/^(multipart\/form-data|application\/x-www-form-urlencoded)(?:;|$)/i.test(media)) {
    throw new PublishError("Use the publishing form to submit your work.", 415);
  }
  if (Number(request.headers.get("Content-Length")) > limit || !request.body) {
    throw new PublishError("The submission is too large.", 413);
  }
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new PublishError("The submission is too large.", 413);
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    return await new Response(bytes, {headers: {"Content-Type": media}}).formData();
  } catch {
    throw new PublishError("The upload could not be read.");
  }
}

export function safeWriting(writing) {
  return writing.replace(/</g, "&lt;").replace(/!\[/g, "!&#91;")
    .replace(/!&#91;([^\]\r\n]+)\]\((\/assets\/uploads\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:jpe?g|png|webp))\)/g, "![$1]($2)");
}

function field(form, key, limit, required = true) {
  const value = form.get(key);
  const text = typeof value === "string" ? value.trim() : "";
  if ((required && !text) || text.length > limit || /[<>\u0000-\u001f]/.test(text)) {
    throw new PublishError(`Check the ${key} field and use no more than ${limit} characters.`);
  }
  return text;
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function base64(text) {
  const bytes = encoder.encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export async function preparePublication(request, now = new Date()) {
  return publicationFromForm(await readForm(request), now);
}

export async function publicationFromForm(form, now = new Date(), photoData = null) {
  const title = field(form, "title", 120);
  const summary = field(form, "summary", 300);
  const type = field(form, "type", 20);
  const category = photoData ? "Photo Essays" : categories.get(type);
  if (!category) throw new PublishError("Select a work type.");
  if (form.get("confirm") !== "yes") throw new PublishError("Confirm that this work may be published.");
  const slug = field(form, "slug", 90, false) || title.toLowerCase().normalize("NFKD")
    .replace(/\p{Mark}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90).replace(/-$/, "");
  if (!slugPattern.test(slug)) throw new PublishError("Enter a URL slug with lowercase letters, numbers and hyphens.");
  const tags = [...new Set(field(form, "tags", 300, false).split(",").map((tag) => tag.trim()).filter(Boolean))];
  if (tags.length > 8 || tags.some((tag) => tag.length > 48)) throw new PublishError("Use up to eight short tags.");
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({type, value}) => [type, value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const date = field(form, "date", 10, false) || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date || date > today) {
    throw new PublishError("Enter a valid publication date that is not in the future.");
  }
  let writing = form.get("writing");
  writing = typeof writing === "string" ? writing.trim() : "";
  const file = form.get("file");
  if (file?.size) {
    if (writing) throw new PublishError("Either paste your writing or upload one file, not both.");
    if (!/\.(md|txt)$/i.test(file.name)) throw new PublishError("Upload a Markdown (.md) or plain text (.txt) file.");
    if (file.size > maxWritingBytes) throw new PublishError("The file is larger than 100 KiB.", 413);
    writing = (await file.text()).trim();
  }
  if ((!writing && !photoData) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(writing)) {
    throw new PublishError("Provide UTF-8 text or Markdown for the piece.");
  }
  if (encoder.encode(writing).length > maxWritingBytes) throw new PublishError("The writing is larger than 100 KiB.", 413);
  if (/^---\s*(?:\r?\n|$)/.test(writing)) throw new PublishError("Remove any front matter; the form supplies it.");
  const words = writing.split(/\s+/).length;
  const readingTime = photoData ? `${photoData.photos.length} photographs` : type === "note"
    ? new Intl.DateTimeFormat("en-GB", {dateStyle: "long", timeZone: "UTC"}).format(new Date(date))
    : `${Math.max(1, Math.ceil(words / 220))}-minute read`;
  const metadata = {layout: "layouts/article.njk", templateEngineOverride: "md", dashboardEditable: true,
    permalink: `/writing/${slug}/`, title, description: summary, summary, category, tags,
    date, lastmod: today, status: "published", readingTime, ...(photoData || {})};
  // No raw HTML or externally embedded images. Markdown links and headings still work.
  const safeBody = safeWriting(writing);
  const frontmatter = Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
  return {slug, title, markdown: `---\n${frontmatter}\n---\n\n${safeBody}\n`};
}

export async function submitPublication(publication, token) {
  const {slug, title, markdown, previous} = publication;
  if (!slugPattern.test(slug)) throw new PublishError("Invalid URL slug.");
  let response;
  try {
    response = await fetch(`${api}/contents/src/writing/essays/${slug}.md`, {
      method: "PUT",
      headers: {"Authorization": `Bearer ${token}`, "Accept": "application/vnd.github+json",
        "Content-Type": "application/json", "User-Agent": "AshtonMilton-Publisher"},
      body: JSON.stringify({branch: "main", message: `${previous ? "Revise" : "Publish"}: ${title}`, content: base64(markdown), ...(previous ? {sha: previous} : {})}),
      redirect: "manual", signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new PublishError("Could not confirm submission. Check GitHub Actions or the commit history before retrying.", 502);
  }
  if (response.status === 409 || response.status === 422) {
    throw new PublishError(previous ? "This piece changed after you opened it. Reopen it before trying again." : "GitHub rejected this submission. The URL may already exist. Existing work has not been overwritten.", 409);
  }
  if (response.status !== (previous ? 200 : 201)) {
    throw new PublishError("GitHub did not accept the publication. Check the repository token and branch settings.", 502);
  }
  let sha;
  try { sha = (await response.json()).commit?.sha; } catch { /* Check the repository before retrying. */ }
  if (!/^[a-f0-9]{40}$/.test(sha || "")) throw new PublishError("GitHub returned no usable commit ID. Check the repository before retrying.", 502);
  return sha;
}

async function githubContents(path, token) {
  let response;
  try {
    response = await fetch(`${api}/contents/src/writing/essays${path}?ref=main`, {
      headers: {"Authorization": `Bearer ${token}`, "Accept": "application/vnd.github+json", "User-Agent": "AshtonMilton-Publisher"},
      redirect: "manual", signal: AbortSignal.timeout(5500)
    });
  } catch { throw new PublishError("GitHub did not respond when loading the work archive. Try opening the editor again.", 502); }
  if (response.status === 401 || response.status === 403) throw new PublishError(`GitHub denied access to the work archive (${response.status}). Check the publishing token’s expiry and repository access.`, 502);
  if (response.status === 404) throw new PublishError("Work not found.", 404);
  if (!response.ok) throw new PublishError("The repository could not be read.", 502);
  try { return await response.json(); }
  catch { throw new PublishError("GitHub returned an unreadable archive response.", 502); }
}

export async function listWriting(token) {
  const entries = await githubContents("", token);
  if (!Array.isArray(entries)) throw new PublishError("The repository could not be read.", 502);
  return entries.flatMap(({type, name}) => type === "file" && /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(name) ? [name.slice(0, -3)] : []);
}

export async function editableWriting(slug, token) {
  if (!slugPattern.test(slug) || slug.length > 90) throw new PublishError("Work not found.", 404);
  const file = await githubContents(`/${slug}.md`, token);
  if (file.type !== "file" || file.encoding !== "base64" || file.size > maxRequestBytes || !/^[a-f0-9]{40}$/.test(file.sha || "")) {
    throw new PublishError("This file cannot be edited here.", 409);
  }
  const markdown = new TextDecoder("utf-8", {fatal: true}).decode(Uint8Array.from(atob(file.content.replace(/\s/g, "")), (byte) => byte.charCodeAt(0)));
  const match = /^---\n([^]*?)\n---\n([^]*)$/.exec(markdown);
  if (!match || !/^dashboardEditable: true$/m.test(match[1]) || !/^templateEngineOverride: "md"$/m.test(match[1])) {
    throw new PublishError("This piece uses the original site format and is not editable here.", 409);
  }
  const data = Object.fromEntries(match[1].split("\n").map((line) => {
    const i = line.indexOf(": ");
    return [line.slice(0, i), JSON.parse(line.slice(i + 2))];
  }));
  return {slug, previous: file.sha, data, writing: match[2].trim()};
}

export function revisePhotoMetadata(current, update, intro, now = new Date()) {
  if (current.data.category !== "Photo Essays" || !Array.isArray(current.data.photos)) throw new PublishError("This photo essay uses a different layout.", 409);
  if (encoder.encode(intro).length > maxWritingBytes) throw new PublishError("The introduction is too long.", 413);
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({type, value}) => [type, value]));
  const data = {...current.data, ...update, lastmod: `${parts.year}-${parts.month}-${parts.day}`, readingTime: `${update.photos.length} photographs`};
  const frontmatter = Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
  return {slug: current.slug, title: data.title, previous: current.previous, markdown: `---\n${frontmatter}\n---\n\n${safeWriting(intro)}\n`};
}

export async function reviseWriting(request, token, now = new Date()) {
  const form = await readForm(request);
  const slug = field(form, "slug", 90);
  const title = field(form, "title", 120);
  const summary = field(form, "summary", 300);
  const writing = String(form.get("writing") || "").trim();
  if (form.get("confirm") !== "yes") throw new PublishError("Confirm that these changes may be published.");
  if (!writing || encoder.encode(writing).length > maxWritingBytes || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(writing)) {
    throw new PublishError("Provide UTF-8 text or Markdown no larger than 100 KiB.");
  }
  const current = await editableWriting(slug, token);
  if (Array.isArray(current.data.photos)) throw new PublishError("Use the photo essay editor to revise this piece.", 409);
  if (form.get("previous") !== current.previous) throw new PublishError("This piece changed after you opened it. Reopen it before trying again.", 409);
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({type, value}) => [type, value]));
  const data = {...current.data, title, summary, description: summary, lastmod: `${parts.year}-${parts.month}-${parts.day}`};
  if (data.category !== "Notes") data.readingTime = `${Math.max(1, Math.ceil(writing.split(/\s+/).length / 220))}-minute read`;
  const frontmatter = Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
  return {slug, title, previous: current.previous, markdown: `---\n${frontmatter}\n---\n\n${safeWriting(writing)}\n`};
}

export async function publicationStatus(sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) return null;
  try {
    const response = await fetch(`${api}/actions/workflows/deploy.yml/runs?head_sha=${sha}&per_page=1`,
      { headers: {"Accept": "application/vnd.github+json", "User-Agent": "AshtonMilton-Publisher"},
        redirect: "manual", signal: AbortSignal.timeout(4500) });
    if (!response.ok) return null;
    const run = (await response.json()).workflow_runs?.find((item) => item.head_sha === sha);
    if (!run) return "Waiting for GitHub to start deployment.";
    if (run.status !== "completed") return "GitHub Pages deployment in progress.";
    return run.conclusion === "success" ? "GitHub Pages reports a successful deployment."
      : "GitHub Pages did not deploy this change. Check the workflow run.";
  } catch { return null; }
}

export function publishingForm() {
  return `<form action="/publish" method="post" enctype="multipart/form-data">
    <div class="form-fields">
      <label>Title<input name="title" maxlength="120" required></label>
      <label>Type<select name="type"><option value="article">Article</option><option value="note">Note</option><option value="reflection">Essay or Reflection</option><option value="academic">Selected Academic Work</option></select></label>
      <label class="wide">Summary<input name="summary" maxlength="300" required></label>
      <label>URL Slug<input name="slug" maxlength="90" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="Generated from title"></label>
      <label>Publication Date<input type="date" name="date"><small>Leave blank to use today’s date.</small></label>
      <label class="wide">Tags<input name="tags" maxlength="300" placeholder="Separate tags with commas"></label>
      <label class="wide">Writing<textarea name="writing" rows="12" maxlength="102400" placeholder="Paste plain text or Markdown"></textarea></label>
      <label class="wide">Or Upload a File<input name="file" type="file" accept=".md,.txt,text/plain,text/markdown"><small>Markdown or plain text, up to 100 KiB.</small></label>
    </div>
    <label class="publish-confirm"><input name="confirm" type="checkbox" value="yes" required> I approve this work for public release.</label>
    <button type="submit">Publish to Website</button>
  </form>`;
}
