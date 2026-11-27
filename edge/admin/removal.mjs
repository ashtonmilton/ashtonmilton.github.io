import {editableWriting, publicationSource, PublishError, submitPublication} from "./publishing.mjs";

const api = "https://api.github.com/repos/ashtonmilton/ashtonmilton.github.io/";
const publicOrigin = "https://ashtonmilton.net";
const assetPath = /^\/assets\/uploads\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:pdf|jpe?g|png|webp)$/;
const hash = /^[a-f0-9]{40}$/;
const inputPath = /^(?:src\/|localisation\/|publications\/|lib\/|assets\/(?:css|js)\/)[a-zA-Z0-9_./-]+\.(?:md|njk|html|js|mjs|cjs|json|ya?ml|css)$/;

function sourceReferenceMatcher(path) {
  const target = path.replace(/\/$/, "");
  const leaf = target.split("/").at(-1);
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = String.raw`(?:^|[\s"'(<:=/])`;
  const end = String.raw`(?=$|[\s"')>#?,/\]])`;
  const full = new RegExp(prefix + escape(target.slice(1)) + end, "m");
  const relative = target.startsWith("/assets/") ? new RegExp(prefix + escape(leaf) + end, "m") :
    new RegExp(String.raw`(?:href\s*=\s*["']|\]\(\s*<?|\:\s+)\.{1,2}/` + escape(leaf) + end, "im");
  return (source) => {
    const text = source.replace(/\\\//g, "/").replace(/%2f|&#x2f;|&#47;/gi, "/");
    return full.test(text) || relative.test(text);
  };
}

async function github(path, token, method = "GET", value) {
  const response = await fetch(api + path, {method, headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
    "User-Agent": "AshtonMilton-Admin", "Content-Type": "application/json"}, redirect: "manual", signal: AbortSignal.timeout(9500),
    ...(value ? {body: JSON.stringify(value)} : {})});
  if (!response.ok) throw new PublishError(`GitHub did not confirm this operation (${response.status}). Check the repository before retrying.`, response.status === 409 || response.status === 422 ? 409 : 502);
  return response.json();
}

async function repositoryReferences(path, token, revision) {
  const branch = await github(`git/commits/${revision}`, token);
  if (!hash.test(branch.tree?.sha || "")) throw new PublishError("GitHub could not identify the source tree to check.", 502);
  const tree = await github(`git/trees/${branch.tree.sha}?recursive=1`, token);
  if (tree.truncated || !Array.isArray(tree.tree)) throw new PublishError("The repository source list was incomplete. Removal was stopped.", 409);
  const currentSource = path.startsWith("/writing/") ? `src/writing/essays/${path.split("/")[2]}.md` : "";
  const sources = tree.tree.filter((entry) => entry.path !== currentSource && (inputPath.test(entry.path) || entry.path === ".eleventy.js"));
  if (sources.length > 240 || sources.some(({type, mode, sha, size}) => type !== "blob" || mode === "120000" || !hash.test(sha || "") || size > 240_000) ||
      sources.reduce((sum, {size}) => sum + size, 0) > 1_500_000) {
    throw new PublishError("The source is too large for a complete check. Deploy the current Pages build before removing this item.", 409);
  }
  const matches = [];
  const refersToTarget = sourceReferenceMatcher(path);
  for (let i = 0; i < sources.length; i += 24) {
    const batch = sources.slice(i, i + 24);
    const fields = batch.map(({sha}, n) => `f${n}:object(oid:"${sha}"){... on Blob{oid text isTruncated}}`).join("\n");
    const response = await fetch("https://api.github.com/graphql", {method: "POST", redirect: "manual", signal: AbortSignal.timeout(8500),
      headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "AshtonMilton-Admin"},
      body: JSON.stringify({query: `{repository(owner:"ashtonmilton",name:"ashtonmilton.github.io"){${fields}}}`})});
    const result = response.ok ? await response.json() : null;
    if (!result?.data?.repository || result.errors?.length) throw new PublishError("GitHub did not complete the source reference check. No removal was made.", 502);
    for (const [n, entry] of batch.entries()) {
      const blob = result.data.repository[`f${n}`];
      if (blob?.oid !== entry.sha || blob.isTruncated || typeof blob.text !== "string") throw new PublishError("A source file could not be checked completely. No removal was made.", 409);
      if (refersToTarget(blob.text)) matches.push(entry.path);
    }
  }
  return matches;
}

async function safelyReferenced(path, token, ignored = []) {
  const branch = await github("git/ref/heads/main", token);
  const sha = branch.object?.sha;
  if (!hash.test(sha || "")) throw new PublishError("The current repository revision could not be read.", 502);
  const data = await fetch(`${publicOrigin}/assets/editorial-references.json?revision=${sha}`, {redirect: "manual", signal: AbortSignal.timeout(5500)})
    .then((snapshot) => snapshot.ok ? snapshot.json() : null).catch(() => null);
  const indexed = data?.revision === sha && data.references && typeof data.references === "object";
  const linked = indexed ? [...new Set([...(data.references[path] || []), ...(path.endsWith("/") ? data.references[path.slice(0, -1)] || [] : [])])]
    .filter((source) => !ignored.includes(source)) : await repositoryReferences(path, token, sha);
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
