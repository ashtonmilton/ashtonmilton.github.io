document.addEventListener("DOMContentLoaded", () => {
  const filterButtons = document.querySelectorAll("[data-filter]");
  const cards = document.querySelectorAll("[data-category]");
  const emptyState = document.querySelector("[data-empty-state]");
  const tools = document.querySelector(".archive-tools");

  if (!filterButtons.length || !cards.length) return;
  tools.hidden = false;

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;
      let visibleCount = 0;

      filterButtons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });

      cards.forEach((card) => {
        const isVisible = filter === "all" || card.dataset.category === filter;
        card.classList.toggle("is-hidden", !isVisible);
        if (isVisible) visibleCount += 1;
      });

      document.querySelectorAll("[data-archive-group]").forEach((group) => {
        group.hidden = !group.querySelector(".writing-card:not(.is-hidden)");
      });

      if (emptyState) emptyState.hidden = visibleCount !== 0;
    });
  });
});
