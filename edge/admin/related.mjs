const mainLinks = new Map([["/research/", "Research"], ["/policy-analysis/", "Policy Analysis"],
  ["/policy-analysis/#beyond-growth", "Beyond Growth: What Should Development Policy Measure?"]]);
const publicWork = /^\/writing\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;

export async function availableRelated() {
  const response = await fetch("https://ashtonmilton.net/assets/search-index.json", {redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(5500)});
  if (!response.ok) throw new Error("The public Work archive could not be read.");
  const index = await response.json();
  if (!Array.isArray(index)) throw new Error("The public Work archive could not be read.");
  return new Map([...index.flatMap(({url, title}) => publicWork.test(url) && typeof title === "string" ? [[url, title]] : []), ...mainLinks]);
}

export function relatedChoices(available, ownUrl, existing = []) {
  const previous = new Map(existing.filter(({url, label}) => (publicWork.test(url) || mainLinks.has(url)) && typeof label === "string")
    .map(({url,label}) => [url,label]));
  const merged = new Map([...previous, ...[...available].filter(([url]) => !previous.has(url))]);
  return [...merged].filter(([url]) => url !== ownUrl).map(([url, label]) => ({url, label, title: available.get(url) || label,
    checked: previous.has(url), available: available.has(url)}));
}

export function selectedRelated(form, choices) {
  const values = new Set(form.getAll("related"));
  if ([...values].some((url) => !choices.some((choice) => choice.url === url && choice.available))) {
    throw new Error("Choose only related pieces that are still public.");
  }
  return choices.filter(({url}) => values.has(url)).map(({url, label, title}) => {
    const value = form.get(`related-label:${url}`);
    const edit = typeof value === "string" ? value.trim() : label;
    if (edit.length > 180 || /[<>\u0000-\u001f]/.test(edit)) throw new Error("Keep related link text on one line and under 180 characters.");
    return {url, label: edit || title};
  });
}
