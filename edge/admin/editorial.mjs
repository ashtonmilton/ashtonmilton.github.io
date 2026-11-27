import {editableWriting, listWriting, publicationFromForm, PublishError, revisePhotoMetadata, submitPublication} from "./publishing.mjs";

const api = "https://api.github.com/repos/ashtonmilton/ashtonmilton.github.io/contents/";
const featuredFile = "src/_data/homeFeatured.json";
export const defaultFeatured = ["/policy-analysis/", "/writing/what-is-hukou/", "/writing/on-display/"];
const photoPath = /^\/assets\/uploads\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:jpe?g|png|webp)$/;
const imageLimit = 12;
export {imageLimit};

function options(token) {
  return {redirect: "manual", signal: AbortSignal.timeout(9000), headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "AshtonMilton-Editor", "Content-Type": "application/json"}};
}

async function read(path, token) {
  return fetch(`${api}${path}?ref=main`, options(token));
}

function decoded({content, encoding}) {
  if (encoding !== "base64" || typeof content !== "string") throw new PublishError("GitHub returned a file in an unsupported format.", 502);
  return new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, "")), (byte) => byte.charCodeAt(0)));
}

async function requireLayout(path, marker, token) {
  const response = await read(path, token);
  if (!response.ok) throw new PublishError("The public site template could not be checked.", 502);
  if (!decoded(await response.json()).includes(marker)) throw new PublishError("Publish the latest site update from GitHub Desktop before using this control.", 409);
}

export async function featuredSettings(token) {
  const response = await read(featuredFile, token);
  if (response.status === 404) return {values: defaultFeatured, sha: ""};
  if (!response.ok) throw new PublishError("GitHub could not open your homepage selections.", 502);
  const file = await response.json();
  const values = JSON.parse(decoded(file));
  if (!Array.isArray(values) || values.length !== 3 || !/^[a-f0-9]{40}$/.test(file.sha || "")) throw new PublishError("The homepage selections could not be read.", 409);
  return {values, sha: file.sha};
}

export async function eligibleFeatured(token) {
  return ["/policy-analysis/", ...(await listWriting(token)).map((slug) => `/writing/${slug}/`)];
}

export async function saveFeatured(form, token) {
  const values = [1, 2, 3].map((i) => form.get(`slot-${i}`));
  if (form.get("confirm") !== "yes" || new Set(values).size !== 3) throw new PublishError("Select three different pieces and confirm publication.");
  const [current, allowed] = await Promise.all([featuredSettings(token), eligibleFeatured(token), requireLayout("src/index.njk", "selected in homeFeatured or", token)]);
  if (!values.every((value) => allowed.includes(value))) throw new PublishError("Select three pieces from the archive or Policy Analysis.");
  if (form.get("previous") !== current.sha) throw new PublishError("The featured selections changed. Reopen this page before saving.", 409);
  const response = await fetch(api + featuredFile, {...options(token), method: "PUT", body: JSON.stringify({branch: "main", message: "Update homepage featured work",
    content: btoa(JSON.stringify(values, null, 2) + "\n"), ...(current.sha ? {sha: current.sha} : {})})});
  if (response.status === 409 || response.status === 422) throw new PublishError("GitHub declined the update. Reopen Featured Work before trying again.", 409);
  if (!response.ok) throw new PublishError(`GitHub did not accept the update (${response.status}).`, 502);
  const sha = (await response.json()).commit?.sha;
  if (!/^[a-f0-9]{40}$/.test(sha || "")) throw new PublishError("No commit receipt was returned. Check GitHub before retrying.", 502);
  return sha;
}

export async function uploadedImages(token) {
  const response = await read("assets/uploads", token);
  if (response.status === 404) return [];
  if (!response.ok) throw new PublishError("The public image list could not be opened.", 502);
  const items = await response.json();
  return items.flatMap(({type, path}) => type === "file" && photoPath.test(`/${path}`) ? [`/${path}`] : []);
}

function field(form, name, max, required = true) {
  const val = form.get(name);
  const value = typeof val === "string" ? val.trim() : "";
  if (value.length > max || (required && !value) || /[<>\p{Cc}]/u.test(value)) throw new PublishError(`Check the ${name.replace(/-/g, " ")} field.`);
  return value;
}

export function photoSelection(form, available) {
  const photos = [];
  for (let i = 1; i <= imageLimit; i++) {
    const src = field(form, `photo-${i}`, 150, false);
    if (!src) continue;
    if (!photoPath.test(src) || !available.includes(src) || photos.some((photo) => photo.src === src)) throw new PublishError(`Photo ${i} must be a different image from your uploads.`);
    const width = Number(field(form, `width-${i}`, 5));
    const height = Number(field(form, `height-${i}`, 5));
    if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 20000)) throw new PublishError(`Enter the pixel dimensions for photo ${i}.`);
    photos.push({src, width, height, alt: field(form, `alt-${i}`, 350), caption: field(form, `caption-${i}`, 1000), place: field(form, `place-${i}`, 100, false)});
  }
  if (photos.length < 2) throw new PublishError("Select at least two uploaded images.");
  return photos;
}

export async function savePhotoEssay(form, token) {
  const [images] = await Promise.all([uploadedImages(token), requireLayout("src/_includes/layouts/article.njk", "data-gallery-photo", token)]);
  const photos = photoSelection(form, images);
  const photoData = {question: field(form, "question", 300), photos, shareImage: photos[0].src, scripts: ["/assets/js/photo-essay.js"]};
  let publication;
  if (form.get("previous")) {
    if (form.get("confirm") !== "yes") throw new PublishError("Confirm these changes for publication.");
    const current = await editableWriting(field(form, "slug", 90), token);
    if (form.get("previous") !== current.previous) throw new PublishError("This photo essay changed. Reopen it before publishing.", 409);
    const title = field(form, "title", 120);
    const summary = field(form, "summary", 300);
    const intro = String(form.get("writing") || "").trim();
    publication = revisePhotoMetadata(current, {...photoData, title, summary, description: summary}, intro);
  } else {
    form.set("type", "photo");
    publication = await publicationFromForm(form, new Date(), photoData);
  }
  return {slug: publication.slug, sha: await submitPublication(publication, token)};
}
