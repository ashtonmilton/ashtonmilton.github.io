import {applyPageCopy, openCopy} from "./content.mjs";
import {finishDraft} from "./drafts.mjs";
import {releaseRepository} from "./photo-release.mjs";
import {PublishError} from "./publishing.mjs";

export async function releasePages(db,token,form) {
  const selections = [...new Set(form.getAll("page-release"))];
  if (form.get("confirm") !== "yes" || !selections.length || selections.length > 10) throw new PublishError("Select up to 10 page drafts and confirm publication.");
  const pairs = selections.map((selection) => {
    const match = typeof selection === "string" && /^(\/content:(?:[a-z0-9-]+|edition:[a-z0-9-]+))\|(\d+)$/.exec(selection);
    if (!match || !Number.isSafeInteger(Number(match[2]))) throw new PublishError("Invalid page draft selection.");
    return [match[1],Number(match[2])];
  });
  if (new Set(pairs.map(([key]) => key)).size !== pairs.length) throw new PublishError("Select each page only once.");
  const repo = releaseRepository(token);
  const head = await repo.head();
  const staged = new Map();
  for (const [key,revision] of pairs) {
    const row = await db.prepare("SELECT version, fields FROM editorial_drafts WHERE draft_key = ? AND revision = ?").bind(key,revision).first();
    if (!row) throw new PublishError("A selected draft was changed or removed. Reopen Private Drafts before trying again.",409);
    const page = await openCopy(key.slice("/content:".length),token,head);
    const fields = new Map(JSON.parse(row.fields));
    fields.set("previous",row.version);
    try { staged.set(page.path,applyPageCopy(page,fields,staged.get(page.path) ?? page.source)); }
    catch(error) {
      if (error instanceof PublishError) throw new PublishError(`${page.title}: ${error.message}`,error.status);
      throw error;
    }
  }
  const changes = [...staged].map(([path,content]) => ({path,content,mode:"100644",type:"blob"}));
  const sha = await repo.commit(head,changes,`Publish ${pairs.length} page draft${pairs.length === 1 ? "" : "s"}`);
  await Promise.allSettled(pairs.map(([key,revision]) => finishDraft(db,key,revision)));
  return sha;
}
