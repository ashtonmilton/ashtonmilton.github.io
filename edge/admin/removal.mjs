import {editableWriting, publicationSource, PublishError, submitPublication} from "./publishing.mjs";

const api = "https://api.github.com/repos/ashtonmilton/ashtonmilton.github.io/";
const publicOrigin = "https://ashtonmilton.net";
const assetPath = /^\/assets\/uploads\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:pdf|jpe?g|png|webp)$/;
const hash = /^[a-f0-9]{40}$/;

async function github(path, token, method = "GET", value) {
  const response = await fetch(api + path, {method, headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
    "User-Agent": "AshtonMilton-Admin", "Content-Type": "application/json"}, redirect: "manual", signal: AbortSignal.timeout(9500),
    ...(value ? {body: JSON.stringify(value)} : {})});
  if (!response.ok) throw new PublishError(`GitHub did not confirm this operation (${response.status}). Check the repository before retrying.`, response.status === 409 || response.status === 422 ? 409 : 502);
  return response.json();
}

async function safelyReferenced(path, token, ignored = []) {
  const branch = await github("git/ref/heads/main", token);
  const sha = branch.object?.sha;
  if (!hash.test(sha || "")) throw new PublishError("The current repository revision could not be read.", 502);
  const snapshot = await fetch(`${publicOrigin}/assets/editorial-references.json?revision=${sha}`, {redirect: "manual", signal: AbortSignal.timeout(5500)});
  const data = snapshot.ok ? await snapshot.json() : null;
  if (data?.revision !== sha || !data.references || typeof data.references !== "object") {
    throw new PublishError("Wait for the most recent GitHub Pages deployment before removing anything. Reference checks need the published version.", 409);
  }
  const linked = [...new Set([...(data.references[path] || []), ...(path.endsWith("/") ? data.references[path.slice(0, -1)] || [] : [])])]
    .filter((source) => !ignored.includes(source));
  if (linked.length) throw new PublishError(`Still used on ${linked.join(", ")}. Remove those links or images first, then wait for the site to redeploy.`, 409);
  return sha;
}

async function commitChange(path, token, revision, message, content) {
  const upstream = await github(`git/commits/${revision}`, token);
  if (!hash.test(upstream.tree?.sha || "")) throw new PublishError("The current repository tree could not be read.", 502);
  const entry = {path, mode: "100644", type: "blob", ...(content === undefined ? {sha: null} : {content})};
  const tree = await github("git/trees", token, "POST", {base_tree: upstream.tree.sha, tree: [entry]});
  if (!hash.test(tree.sha || "")) throw new PublishError("GitHub returned no usable tree receipt.", 502);
  const commit = await github("git/commits", token, "POST", {message, parents: [revision], tree: tree.sha});
  if (!hash.test(commit.sha || "")) throw new PublishError("GitHub returned no usable commit receipt.", 502);
  await github("git/refs/heads/main", token, "PATCH", {sha: commit.sha, force: false});
  return commit.sha;
}

export async function listAssets(token) {
  let items;
  try { items = await github("contents/assets/uploads?ref=main", token); }
  catch (error) {
    if (error instanceof PublishError && error.message.includes("(404)")) return [];
    throw error;
  }
  if (!Array.isArray(items)) throw new PublishError("The public files could not be listed.", 502);
  return items.flatMap(({type, path}) => type === "file" && assetPath.test(`/${path}`) ? [`/${path}`] : []);
}

export async function removeAsset(form, token) {
  const path = String(form.get("asset") || "");
  if (form.get("confirm") !== "yes" || !assetPath.test(path)) throw new PublishError("Confirm removal of an uploaded public file.");
  const revision = await safelyReferenced(path, token);
  return commitChange(path.slice(1), token, revision, `Remove unused public file: ${path.split("/").at(-1)}`);
}

export async function changeVisibility(form, token) {
  if (form.get("confirm") !== "yes") throw new PublishError("Confirm the visibility change.");
  const slug = String(form.get("slug") || "");
  const entry = await editableWriting(slug, token);
  if (form.get("previous") !== entry.previous) throw new PublishError("This piece changed after you opened it. Reopen it before continuing.", 409);
  const data = {...entry.data};
  if (form.get("action") === "restore" && data.status === "archived") {
    data.permalink = data.adminArchivedUrl;
    if (data.permalink !== `/writing/${slug}/`) throw new PublishError("This piece cannot be restored to its original URL here.", 409);
    delete data.adminArchivedUrl;
    delete data.eleventyExcludeFromCollections;
    data.status = "published";
    return submitPublication({slug, title: data.title, previous: entry.previous, markdown: publicationSource(data, entry.originalBody)}, token);
  }
  if (form.get("action") !== "archive" || data.status === "archived" || data.permalink !== `/writing/${slug}/`) throw new PublishError("This piece cannot be unpublished here.", 409);
  const revision = await safelyReferenced(data.permalink, token, ["/writing/"]);
  // Write against the exact published branch. Check the file at that revision too.
  const current = await github(`contents/src/writing/essays/${slug}.md?ref=${revision}`, token);
  if (current.sha !== entry.previous) throw new PublishError("This piece changed after you opened it. Reopen it before continuing.", 409);
  data.adminArchivedUrl = data.permalink;
  data.permalink = false;
  data.eleventyExcludeFromCollections = true;
  data.status = "archived";
  return commitChange(`src/writing/essays/${slug}.md`, token, revision, `Unpublish: ${data.title}`, publicationSource(data, entry.originalBody));
}
