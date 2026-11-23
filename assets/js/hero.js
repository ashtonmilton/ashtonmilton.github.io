const hero = document.querySelector(".publication-hero");
const siteHeader = document.querySelector(".site-header");

if (hero && siteHeader) {
  const fitOpening = () => {
    hero.style.setProperty("--header-height", `${siteHeader.getBoundingClientRect().height}px`);
  };
  fitOpening();
  if ("ResizeObserver" in window) new ResizeObserver(fitOpening).observe(siteHeader);
}
