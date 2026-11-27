import {PublishError, readForm} from "./publishing.mjs";

const imageId = /^[a-f0-9-]{36}\.(?:jpg|png|webp)$/;
const prefix = "/assets/uploads/";
const mediaTypes = {jpg:"image/jpeg",png:"image/png",webp:"image/webp"};

export function stagedId(path) {
  const id = path.startsWith(prefix) ? path.slice(prefix.length) : "";
  return imageId.test(id) ? id : null;
}

export async function draftImages(db) {
  if (!db) return [];
  const {results} = await db.prepare("SELECT id, filename FROM editorial_images ORDER BY created DESC").all();
  return results.map(({id,filename}) => ({path:prefix+id, preview:`/draft-image/${id}`, label:filename}));
}

export async function stageImage(req, db, url) {
  if (req.method !== "POST") throw new PublishError("Method not allowed.",405);
  if (req.headers.get("Origin") !== url.origin) throw new PublishError("Same-origin submission required.",403);
  const limit = 4*1024*1024;
  const form = await readForm(req,limit+8192);
  const file = form.get("file");
  if (typeof file?.name !== "string" || !file.size || file.size > limit) throw new PublishError("Choose a JPEG, PNG or WebP under 4 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = String.fromCharCode(...bytes.subarray(0,12));
  const type = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "jpg" :
    head.startsWith("\x89PNG\r\n\x1a\n") ? "png" : head.startsWith("RIFF") && head.slice(8) === "WEBP" ? "webp" : null;
  if (!type) throw new PublishError("The file is not a supported image.");
  const id = `${crypto.randomUUID()}.${type}`;
  const filename = file.name.split(/[/\\]/).at(-1).replace(/[\p{Cc}]/gu,"").slice(0,120) || `Photograph.${type}`;
  const create = db.prepare("INSERT INTO editorial_images (id,filename,media_type,size) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM editorial_images) < 48").bind(id,filename,mediaTypes[type],bytes.length);
  const parts = [];
  for (let offset=0; offset<bytes.length; offset+=1024*1024) {
    const chunk = bytes.slice(offset,offset+1024*1024);
    parts.push(db.prepare("INSERT INTO editorial_image_parts (id,ordinal,bytes) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM editorial_images WHERE id = ?)")
      .bind(id,parts.length,chunk.buffer,id));
  }
  const [result] = await db.batch([create,...parts]);
  if (!result.meta.changes) throw new PublishError("The private image library is full. Publish or remove unused images first.",409);
  return {path:prefix+id,preview:`/draft-image/${id}`,label:filename};
}

export async function draftImage(db,id) {
  if (!db || !imageId.test(id)) return null;
  const info = await db.prepare("SELECT media_type, size FROM editorial_images WHERE id = ?").bind(id).first();
  if (!info) return null;
  const {results} = await db.prepare("SELECT bytes FROM editorial_image_parts WHERE id = ? ORDER BY ordinal").bind(id).all();
  const bytes = new Uint8Array(info.size);
  let offset = 0;
  for (const part of results) {
    const chunk = new Uint8Array(part.bytes);
    bytes.set(chunk,offset);
    offset += chunk.length;
  }
  if (offset !== bytes.length) throw new PublishError("The private image could not be read.",503);
  return {bytes, type:info.media_type};
}

export async function removeDraftImage(db,id) {
  if (db && imageId.test(id)) await db.prepare("DELETE FROM editorial_images WHERE id = ?").bind(id).run();
}

export async function discardUnusedImage(db,path) {
  const id = stagedId(path);
  if (!id) throw new PublishError("Invalid private image.");
  const result = await db.prepare("DELETE FROM editorial_images WHERE id = ? AND NOT EXISTS (SELECT 1 FROM editorial_drafts WHERE instr(fields, ?) > 0)").bind(id,path).run();
  if (!result.meta.changes) throw new PublishError("The image is in use by a saved draft or is no longer available.",409);
}
