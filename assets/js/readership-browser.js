export function startReadership(defaultBasic = false) {
  const token = document.querySelector("meta[name='web-analytics-token']")?.content;
  const readership = document.querySelector("meta[name='readership-events']")?.content === "on";
  const controls = document.querySelector("#analytics-preference");
  if (!token && !readership) return;
  const privateSignal = navigator.globalPrivacyControl || navigator.doNotTrack === "1";
  if (document.documentElement.dataset.readershipBound) return;
  document.documentElement.dataset.readershipBound = "true";
  const key = readership ? "ashton_readership_preference_v1" : "ashton_analytics_preference";
  let preference;
  try { preference = localStorage.getItem(key); } catch { return; }
  const basic = () => readership && !privateSignal && (preference === "allow" || preference === "basic" || (defaultBasic && preference !== "off"));
  const active = () => !privateSignal && (basic() || preference === "allow");

  function send(kind, path, detail) {
    if (!basic() || (kind === "search" && preference !== "allow")) return;
    return fetch("/_readership", {method: "POST", credentials: "omit", keepalive: true,
      headers: {"Content-Type": "application/json"}, body: JSON.stringify({kind, path, detail})}).then((response) => response.ok).catch(() => false);
  }

  function source() {
    let host;
    try { host = new URL(document.referrer).hostname; } catch { return "Direct or unknown"; }
    if (host === location.hostname) return "Internal navigation";
    if (/(^|\.)google\.(?:com|co\.[a-z]{2}|[a-z]{2}|com\.[a-z]{2})$/.test(host)) return "Google";
    const known = {"bing.com":"Bing", "baidu.com":"Baidu", "duckduckgo.com":"DuckDuckGo", "linkedin.com":"LinkedIn",
      "instagram.com":"Instagram", "facebook.com":"Facebook", "reddit.com":"Reddit", "wikipedia.org":"Wikipedia"};
    return Object.entries(known).find(([domain]) => host === domain || host.endsWith("." + domain))?.[1] || "Other website";
  }

  let recorded = false;
  let lastTopic;
  document.addEventListener("work-search-topic", ({detail}) => {
    if (lastTopic === detail || preference !== "allow") return;
    lastTopic = detail;
    send("search", "/writing/", detail);
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link || link.origin !== location.origin) return;
    if (link.matches(".writing-card")) send("work-click", link.pathname, "Work");
    if (/^\/(?:assets\/uploads|publications\/files)\//.test(link.pathname) && /\.(pdf|csv|docx|xlsx|pptx)$/i.test(link.pathname)) {
      send("download", link.pathname, "Download");
    }
  });

  function start() {
    if (!recorded) {
      recorded = true;
      send("page", location.pathname, source())?.then((accepted) => {
        if (controls) controls.dataset.readershipStatus = accepted ? "accepted" : "unavailable";
      });
    }
    if (privateSignal || preference !== "allow" || !token || document.querySelector("#web-analytics-beacon")) return;
    const script = document.createElement("script");
    script.id = "web-analytics-beacon";
    script.src = "https://static.cloudflareinsights.com/beacon.min.js";
    script.dataset.cfBeacon = JSON.stringify({ token });
    script.async = true;
    document.head.append(script);
  }

  if (!controls) return;
  controls.hidden = false;
  const status = controls.querySelector("[role=status]");
  const toggle = controls.querySelector('[role="switch"]');
  function updateControls() {
    if (toggle) {
      toggle.setAttribute("aria-checked", String(active()));
      if (privateSignal) {
        toggle.setAttribute("aria-disabled", "true");
        toggle.title = "Analytics is off because of your browser privacy settings.";
      }
    } else {
      controls.querySelector('[data-choice="off"]').hidden = !active();
      controls.querySelector('[data-choice="allow"]').hidden = privateSignal || preference === "allow";
      if (status) status.textContent = active() ? "Analytics is on for this browser." : "Analytics is off for this browser.";
    }
  }
  updateControls();
  if (basic() || (!privateSignal && preference === "allow")) start();
  controls.addEventListener("click", (event) => {
    if (event.target.closest("[data-analytics-details]")) {
      const details = document.querySelector("details#privacy");
      if (details) details.open = true;
    }
    const choice = toggle && event.target.closest('[role="switch"]') === toggle ?
      active() ? "off" : readership ? "basic" : "allow" : event.target.closest("button[data-choice]")?.dataset.choice;
    if (!choice || privateSignal) return;
    try { localStorage.setItem(key, choice); } catch { return; }
    preference = choice;
    updateControls();
    if (choice === "off" && document.querySelector("#web-analytics-beacon")) location.reload();
    if (choice !== "off") start();
  });
}
