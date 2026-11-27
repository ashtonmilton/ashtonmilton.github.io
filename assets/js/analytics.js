(() => {
  const token = document.querySelector("meta[name='web-analytics-token']")?.content;
  const controls = document.querySelector("#analytics-preference");
  if (!token) return;
  const key = "ashton_analytics_preference";
  let preference;
  try { preference = localStorage.getItem(key); } catch { return; }

  function start() {
    if (document.querySelector("#web-analytics-beacon")) return;
    const script = document.createElement("script");
    script.id = "web-analytics-beacon";
    script.src = "https://static.cloudflareinsights.com/beacon.min.js";
    script.dataset.cfBeacon = JSON.stringify({ token });
    script.async = true;
    document.head.append(script);
  }

  if (preference === "allow") start();
  if (!controls) return;
  controls.hidden = false;
  const status = controls.querySelector("[role=status]");
  status.textContent = preference === "allow" ? "Analytics allowed on this browser." : "Analytics off on this browser.";
  controls.addEventListener("click", (event) => {
    const choice = event.target.closest("button[data-choice]")?.dataset.choice;
    if (!choice) return;
    try { localStorage.setItem(key, choice); } catch { return; }
    if (choice === "off") {
      // Reload so an already-running beacon is no longer present.
      location.reload();
    } else {
      status.textContent = "Analytics allowed on this browser.";
      start();
    }
  });
})();
