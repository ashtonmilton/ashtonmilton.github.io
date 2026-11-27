document.addEventListener("DOMContentLoaded", async () => {
  const tools = document.querySelector(".archive-tools");
  const input = document.querySelector("#work-search");
  if (!tools || !input) return;

  const {queryWork, rankWork, workDocument, searchTopic} = await import("./work-relevance.js?v=1");
  const filters = [...document.querySelectorAll("[data-filter]")];
  const status = document.querySelector("[data-search-status]");
  const empty = document.querySelector("[data-empty-state]");
  const groups = [...document.querySelectorAll("[data-archive-group]")];
  const results = document.querySelector("[data-ranked-results]");
  const cards = [...document.querySelectorAll(".writing-card[data-category]")].map((card) => ({
    card, parent: card.parentElement, url: new URL(card.href).pathname,
    doc: workDocument({title: card.querySelector("h3")?.textContent, description: card.querySelector("p")?.textContent,
      tags: [...card.querySelectorAll(".tag-row li")].map((tag) => tag.textContent), kind: card.dataset.category})
  }));
  const categories = ["all", "independent", "notes", "photo-essays", "reflections", "academic"];
  const url = new URL(location.href);
  let active = filters[categories.indexOf(url.searchParams.get("category"))]?.dataset.filter || "all";
  let pending = false, limited = false, searching = false, index;
  let bodies = new Map();
  tools.hidden = false;

  function render() {
    const query = queryWork(input.value);
    const filtered = (card) => active === "all" || card.dataset.category === active;
    if (!query.terms.length) {
      for (const {card, parent} of cards) {
        if (searching) parent.append(card);
        card.classList.toggle("is-hidden", !filtered(card));
      }
      groups.forEach((group) => { group.hidden = !group.querySelector(".writing-card:not(.is-hidden)"); });
      results.hidden = true;
      empty.hidden = cards.some(({card}) => filtered(card));
      status.textContent = "";
      searching = false;
      return;
    }
    searching = true;
    const ranked = cards.flatMap(({card, url, doc}) => {
      const score = filtered(card) ? rankWork(bodies.get(url) || doc, query) : 0;
      return score ? [{card, score}] : [];
    }).sort((a, b) => b.score - a.score);
    groups.forEach((group) => { group.hidden = true; });
    for (const {card} of ranked) card.classList.remove("is-hidden");
    results.replaceChildren(...ranked.map(({card}) => card));
    results.hidden = !ranked.length;
    empty.hidden = pending || !!ranked.length;
    status.textContent = pending ? "Searching work…" : `${ranked.length} matching ${ranked.length === 1 ? "piece" : "pieces"}.` +
      (limited ? " Searching titles, descriptions and topics only." : "");
  }

  function updateFilters() {
    filters.forEach((item) => {
      const selected = item.dataset.filter === active;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
  }

  function choose(index) {
    active = filters[index].dataset.filter;
    const next = new URL(location.href);
    if (index === 0) next.searchParams.delete("category");
    else next.searchParams.set("category", categories[index]);
    history.replaceState(history.state, "", next);
    updateFilters();
    render();
  }

  filters.forEach((button,index) => button.addEventListener("click", () => choose(index)));
  document.querySelector("[data-reset-work]")?.addEventListener("click", () => {
    input.value = "";
    choose(0);
    input.focus();
  });
  updateFilters();
  render();

  input.addEventListener("input", () => {
    if (queryWork(input.value).terms.length && !index) {
      pending = true;
      index = fetch("/assets/search-index.json").then((response) => {
        if (!response.ok) throw new Error("Search index unavailable");
        return response.json();
      }).then((rows) => { bodies = new Map(rows.map((row) => [row.url, workDocument(row)])); })
        .catch(() => { limited = true; })
        .finally(() => { pending = false; render(); });
    }
    render();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !queryWork(input.value).terms.length) return;
    document.dispatchEvent(new CustomEvent("work-search-topic", {detail: searchTopic(input.value)}));
  });
  results.addEventListener("click", (event) => {
    if (event.target.closest(".writing-card") && queryWork(input.value).terms.length) {
      document.dispatchEvent(new CustomEvent("work-search-topic", {detail: searchTopic(input.value)}));
    }
  });
});
