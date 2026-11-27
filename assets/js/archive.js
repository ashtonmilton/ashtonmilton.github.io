document.addEventListener("DOMContentLoaded", () => {
  const filters = [...document.querySelectorAll("[data-filter]")];
  const tools = document.querySelector(".archive-tools");
  const input = document.querySelector("#work-search");
  const status = document.querySelector("[data-search-status]");
  const empty = document.querySelector("[data-empty-state]");
  if (!tools || !input) return;
  const fold = (text) => text.normalize("NFKC").toLocaleLowerCase("en-GB");
  const cards = [...document.querySelectorAll(".writing-card[data-category]")].map((card) => ({
    card, url: new URL(card.href).pathname, text: fold(card.textContent)
  }));
  const groups = document.querySelectorAll("[data-archive-group]");
  let active = "all";
  let index, limited = false;
  let bodies = new Map();
  tools.hidden = false;

  function render() {
    const terms = fold(input.value.trim()).split(/\s+/).filter(Boolean);
    let count = 0;
    for (const {card, url, text} of cards) {
      const corpus = text + " " + (bodies.get(url) || "");
      const visible = (active === "all" || card.dataset.category === active) &&
        terms.every((term) => corpus.includes(term));
      card.classList.toggle("is-hidden", !visible);
      if (visible) count += 1;
    }
    groups.forEach((group) => { group.hidden = !group.querySelector(".writing-card:not(.is-hidden)"); });
    empty.hidden = count !== 0;
    status.textContent = terms.length
      ? count + (count === 1 ? " matching piece." : " matching pieces.") +
        (limited ? " Searching titles, descriptions and topics only." : "")
      : "";
  }

  filters.forEach((button) => button.addEventListener("click", () => {
    active = button.dataset.filter;
    filters.forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    render();
  }));

  input.addEventListener("input", () => {
    if (input.value.trim() && !index) {
      index = fetch("/assets/search-index.json").then((response) => {
        if (!response.ok) throw new Error("Search index unavailable");
        return response.json();
      }).then((rows) => { bodies = new Map(rows.map(({url, text}) => [url, fold(text)])); })
        .catch(() => { limited = true; })
        .finally(render);
    }
    render();
  });
});
