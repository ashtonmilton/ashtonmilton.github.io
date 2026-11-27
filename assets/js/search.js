(() => {
  const form = document.querySelector("#site-search");
  if (!form) return;
  const status = document.querySelector("#search-status");
  const list = document.querySelector("#search-results");
  const params = new URLSearchParams(location.search);
  const fields = form.elements;
  fields.q.value = params.get("q") || "";
  let index;
  const names = new Intl.DisplayNames(["en"], { type: "language" });
  const languageName = (tag) => ({ dz: "Dzongkha", tet: "Tetum" })[tag] || names.of(tag);

  const fold = (s) => s.toLowerCase().normalize("NFKC")
    .replace(/\p{Script=Latin}\p{Mark}*/gu, (c) => c.normalize("NFD").replace(/\p{Mark}/gu, ""));

  function tokens(query) {
    const terms = fold(query).trim();
    const locale = /\p{Script=Thai}/u.test(terms) ? "th"
      : /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(terms) ? "ja"
      : /\p{Script=Han}/u.test(terms) ? "zh" : "en";
    return typeof Intl.Segmenter === "function"
      ? [...new Intl.Segmenter(locale, { granularity: "word" }).segment(terms)]
        .filter((term) => term.isWordLike).map((term) => term.segment)
      : terms.split(/\s+/).filter(Boolean);
  }

  function options(select, values, label = (value) => value) {
    [...new Set(values)].filter(Boolean).sort().forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label(value);
      select.append(option);
    });
    select.value = params.get(select.name) || "";
    if (select.selectedIndex < 0) select.selectedIndex = 0;
  }

  function load() {
    index ||= fetch("/assets/search-index.json").then((response) => {
      if (!response.ok) throw new Error("Search index unavailable");
      return response.json();
    }).then((pages) => {
      options(fields.type, pages.map((p) => p.kind));
      options(fields.topic, pages.flatMap((p) => p.tags));
      options(fields.year, pages.map((p) => p.date.slice(0, 4)));
      options(fields.language, pages.map((p) => p.lang), languageName);
      const suggestions = document.querySelector("#search-suggestions");
      for (const title of new Set(pages.filter((page) => page.kind !== "Page").map((page) => page.title))) {
        const option = document.createElement("option");
        option.value = title;
        suggestions.append(option);
      }
      return pages.map((p) => ({...p, search: [p.title, p.tags.join(" "), p.description, p.text].map(fold) }));
    }).catch((error) => { index = undefined; throw error; });
    return index;
  }

  function highlight(element, text, query) {
    const match = query && text.toLowerCase().indexOf(query.toLowerCase());
    if (!query || match < 0) { element.textContent = text; return; }
    element.append(text.slice(0, match));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(match, match + query.length);
    element.append(mark, text.slice(match + query.length));
  }

  function rank(page, terms, phrase) {
    if (!terms.length) return 1;
    let score = 0;
    for (const term of terms) {
      const field = page.search.findIndex((part) => part.includes(term));
      if (field < 0) return 0;
      score += [12, 7, 5, 1][field];
    }
    return score + (page.search[0].includes(phrase) ? 20 : page.search[2].includes(phrase) ? 8 : 0);
  }

  let sequence = 0;
  async function search() {
    const id = ++sequence;
    list.replaceChildren();
    status.textContent = "Searching…";
    try {
      const pages = await load();
      if (id !== sequence) return;
      const query = fields.q.value.trim();
      const filters = [fields.type, fields.topic, fields.year, fields.language];
      const next = new URLSearchParams();
      if (query) next.set("q", query);
      filters.forEach((filter) => { if (filter.value) next.set(filter.name, filter.value); });
      history.replaceState(null, "", "/search/" + (next.size ? "?" + next : ""));
      if (!next.size) { status.textContent = ""; return; }
      const terms = [...new Set(tokens(query))].slice(0, 20);
      const hits = pages.filter((p) => (!fields.type.value || p.kind === fields.type.value) &&
        (!fields.topic.value || p.tags.includes(fields.topic.value)) &&
        (!fields.year.value || p.date.startsWith(fields.year.value)) &&
        (!fields.language.value || p.lang === fields.language.value))
        .map((p) => [p, rank(p, terms, fold(query))]).filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1] || a[0].title.localeCompare(b[0].title));
      status.textContent = hits.length ? `${hits.length} result${hits.length === 1 ? "" : "s"}.` : "No results found.";
      for (const [page] of hits) {
        const item = document.createElement("li");
        item.lang = page.lang;
        item.dir = "auto";
        const label = document.createElement("small");
        label.lang = "en-GB";
        label.textContent = `${page.kind} · ${languageName(page.lang)}`;
        const heading = document.createElement("h2");
        const link = document.createElement("a");
        link.href = page.url;
        highlight(link, page.title, query);
        heading.append(link);
        const description = document.createElement("p");
        highlight(description, page.description, query);
        item.append(label, heading, description);
        list.append(item);
      }
    } catch {
      if (id === sequence) status.textContent = "Search is unavailable. You can still browse Work.";
    }
  }

  form.addEventListener("submit", (event) => { event.preventDefault(); search(); });
  form.addEventListener("change", (event) => { if (event.target.tagName === "SELECT") search(); });
  if (params.size) search();
  else load().catch(() => { status.textContent = "Search is unavailable. You can still browse Work."; });
})();
