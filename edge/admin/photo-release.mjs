import {PublishError} from "./publishing.mjs";
import {draftImage, removeDraftImage, stagedId} from "./draft-media.mjs";

const api = "https://api.github.com/repos/ashtonmilton/ashtonmilton.github.io/";
const shaPattern = /^[a-f0-9]{40}$/;
function base64Image(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let binary = "";
  for (let start=0; start<bytes.length; start+=8192) binary += String.fromCharCode(...bytes.subarray(start,start+8192));
  return btoa(binary);
}

export function releaseRepository(token) {
  const headers = {Authorization:`Bearer ${token}`, Accept:"application/vnd.github+json", "User-Agent":"AshtonMilton-Publisher","Content-Type":"application/json"};
  async function github(path, method="GET", body, missing=false) {
    const response = await fetch(api+path,{method,headers,redirect:"manual",signal:AbortSignal.timeout(10000),body:body ? JSON.stringify(body) : undefined});
    if (missing && response.status === 404) return null;
    if ([409,422].includes(response.status)) throw new PublishError("GitHub changed before this release was recorded. Reopen the editor and try again.",409);
    if (!response.ok) throw new PublishError("Could not confirm the release. Check GitHub before trying again.",502);
    return response.json();
  }
  return {github,async head() {
    const head = (await github("git/ref/heads/main")).object?.sha;
    if (!shaPattern.test(head || "")) throw new PublishError("GitHub did not return a valid main revision.",502);
    return head;
  },async commit(head,changes,message) {
    const parent = await github(`git/commits/${head}`);
    const tree = await github("git/trees","POST",{base_tree:parent.tree.sha,tree:changes});
    const commit = await github("git/commits","POST",{message,tree:tree.sha,parents:[head]});
    if (!shaPattern.test(commit.sha || "")) throw new PublishError("GitHub returned no usable commit ID.",502);
    await github("git/refs/heads/main","PATCH",{sha:commit.sha,force:false});
    return commit.sha;
  }};
}

export async function releasePhotoWithImages(publication, paths, token, db) {
  const {slug,title,markdown,previous} = publication;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new PublishError("Invalid URL slug.");
  const repo = releaseRepository(token);
  const {github} = repo;
  const head = await repo.head();
  const path = `src/writing/essays/${slug}.md`;
  const current = await github(`contents/${path}?ref=${head}`,"GET",null,true);
  if (previous ? current?.sha !== previous : current) throw new PublishError("This piece has changed or the URL is already in use.",409);
  const changes = [{path,mode:"100644",type:"blob",content:markdown}];
  for (const imagePath of paths) {
    const id = stagedId(imagePath);
    const staged = id && await draftImage(db,id);
    if (!staged) throw new PublishError("A private photograph could not be read. Reopen the photo editor.",409);
    const target = imagePath.slice(1);
    if (await github(`contents/${target}?ref=${head}`,"GET",null,true)) throw new PublishError("A photograph already exists at this address. Reopen the editor.",409);
    const content = base64Image(staged.bytes);
    const media = await github("git/blobs","POST",{content,encoding:"base64"});
    if (!shaPattern.test(media.sha || "")) throw new PublishError("GitHub did not accept a photograph.",502);
    changes.push({path:target,mode:"100644",type:"blob",sha:media.sha});
  }
  const commit = await repo.commit(head,changes,`${previous ? "Revise" : "Publish"} photo essay: ${title}`);
  await Promise.allSettled(paths.map((path) => removeDraftImage(db,stagedId(path))));
  return commit;
}
