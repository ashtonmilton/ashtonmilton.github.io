import {PublishError, readForm} from "./publishing.mjs";

const keyPattern = /^(?:\/:new|\/content:(?:[a-z0-9-]{1,90}|edition:[a-z0-9-]{1,20})|\/(?:edit|photos):[a-z0-9-]{1,90})$/;
const versionPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})?$/;
const fieldPattern = /^(?:[A-Za-z][A-Za-z0-9-]{0,59}|related-label:\/[a-z0-9/#-]{1,150})$/;

export function draftDestination(key) {
  if (!keyPattern.test(key)) throw new PublishError("Invalid draft address.");
  const [path,...parts] = key.split(":");
  const id = parts.join(":");
  if (path === "/") return "/#publish-work";
  if (path === "/photos" && id === "new") return "/photos";
  return `${path}?${path === "/content" ? "page" : "post"}=${encodeURIComponent(id)}`;
}

export async function draftList(db) {
  const {results} = await db.prepare("SELECT draft_key, title, updated, revision FROM editorial_drafts ORDER BY updated DESC").all();
  return results;
}

export async function finishDraft(db,key,savedRevision) {
  const revision = Number(savedRevision);
  if (!db || !keyPattern.test(key) || !Number.isSafeInteger(revision) || revision < 1) return;
  await db.prepare("DELETE FROM editorial_drafts WHERE draft_key = ? AND revision = ?").bind(key,revision).run().catch(() => {});
}

export async function draftAction(req, db, url) {
  const key = url.searchParams.get("key") || "";
  draftDestination(key);
  if (req.method === "GET") {
    const row = await db.prepare("SELECT version, fields, revision, updated FROM editorial_drafts WHERE draft_key = ?").bind(key).first();
    return row ? {...row,fields:JSON.parse(row.fields)} : null;
  }
  if (req.method !== "POST") throw new PublishError("Method not allowed.",405);
  if (req.headers.get("Origin") !== url.origin) throw new PublishError("Same-origin submission required.",403);
  const form = await readForm(req,768*1024);
  const revision = Number(form.get("revision") || 0);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new PublishError("Invalid draft revision.");
  if (form.get("action") === "discard") {
    const result = await db.prepare("DELETE FROM editorial_drafts WHERE draft_key = ? AND revision = ?").bind(key,revision).run();
    if (!result.meta.changes) throw new PublishError("This draft changed on another device. Reopen it before discarding.",409);
    return null;
  }
  const version = form.get("version");
  const title = form.get("title");
  const fields = form.get("fields");
  if (typeof version !== "string" || !versionPattern.test(version) || typeof title !== "string" || !title.trim() || title.length > 160 ||
      typeof fields !== "string" || new TextEncoder().encode(fields).length > 180*1024) throw new PublishError("This draft is too large or malformed.");
  let data;
  try { data = JSON.parse(fields); } catch { throw new PublishError("The draft could not be read."); }
  if (!Array.isArray(data) || data.length > 350 || !data.every((row) => Array.isArray(row) && [2,3].includes(row.length) &&
      typeof row[0] === "string" && fieldPattern.test(row[0]) && typeof row[1] === "string" && (row.length === 2 || typeof row[2] === "boolean"))) {
    throw new PublishError("The draft fields could not be read.");
  }
  const updated = new Date().toISOString();
  const random = crypto.getRandomValues(new Uint32Array(2));
  const next = (random[0] & 0x1fffff) * 4294967296 + random[1] || 1;
  const statement = revision === 0
    ? db.prepare("INSERT INTO editorial_drafts (draft_key, version, fields, title, updated, revision) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING revision").bind(key,version,fields,title,updated,next)
    : db.prepare("UPDATE editorial_drafts SET version = ?, fields = ?, title = ?, updated = ?, revision = ? WHERE draft_key = ? AND revision = ? RETURNING revision").bind(version,fields,title,updated,next,key,revision);
  const change = await statement.first();
  if (!change) throw new PublishError("This draft changed on another device. Reopen it before saving again.",409);
  return {version,fields:data,updated,revision:change.revision};
}
