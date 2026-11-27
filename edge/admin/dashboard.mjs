const origin = "https://ashtonmilton.net";
const adminHost = "admin.ashtonmilton.net";
const workflow = "https://github.com/ashtonmilton/ashtonmilton.github.io/actions";
const isoDate = (date) => date.toISOString().slice(0, 10);
const escape = (value) => String(value).replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const number = (value) => Number.isFinite(value) ? new Intl.NumberFormat("en-GB").format(value) : "Unavailable";
const css = `*{box-sizing:border-box}body{margin:0;background:#16352c;color:#faf6ed;font:1rem/1.55 Avenir,system-ui,sans-serif}header,main{max-width:72rem;margin:auto;padding:1.5rem}header,section{border-bottom:1px solid #faf6ed55}section{padding:1rem 0 1.75rem}h1{font-size:2rem;margin:.25rem 0}h2{font-size:1.4rem}h3{font-size:1rem}a{color:#ead28d}a:focus-visible{outline:2px solid #fff;outline-offset:3px}table{width:100%;border-collapse:collapse;table-layout:fixed}caption{text-align:left;font-weight:600;margin:.5rem 0}th,td{text-align:left;padding:.45rem 0;border-bottom:1px solid #faf6ed33;overflow-wrap:anywhere}th:last-child,td:last-child{text-align:right;width:8rem}.tables{display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))}dt{font-weight:600}dd{margin:0 0 .75rem}small{color:#faf6edda}`;

function reply(body, type, status = 200) {
  return new Response(body, { status, headers: {
    "Content-Type": type,
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  }});
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(5500) });
  if (!response.ok) throw new Error("Upstream unavailable");
  return response;
}

const trafficQuery = `query Readership($zone: string, $from: Date, $to: Date) {
  viewer { zones(filter: {zoneTag: $zone}) {
    time: httpRequestsAdaptiveGroups(limit: 31, orderBy: [date_ASC], filter: {
      date_geq: $from, date_leq: $to, requestSource: "eyeball", clientRequestHTTPHost: "ashtonmilton.net"
    }) { count dimensions { date } }
    paths: httpRequestsAdaptiveGroups(limit: 15, orderBy: [count_DESC], filter: {
      date_geq: $from, date_leq: $to, requestSource: "eyeball", clientRequestHTTPHost: "ashtonmilton.net",
      clientRequestPath_like: "/writing/%", edgeResponseStatus: 200, edgeResponseContentTypeName: "html"
    }) { count dimensions { clientRequestPath } }
    countries: httpRequestsAdaptiveGroups(limit: 10, orderBy: [count_DESC], filter: {
      date_geq: $from, date_leq: $to, requestSource: "eyeball", clientRequestHTTPHost: "ashtonmilton.net"
    }) { count dimensions { clientCountryName } }
  } }
}`;

async function traffic(env) {
  if (!env.CF_ZONE_ID || !env.CF_ANALYTICS_TOKEN) return null;
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 86400000);
  const response = await request("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({query: trafficQuery, variables: { zone: env.CF_ZONE_ID, from: isoDate(from), to: isoDate(now) }})
  });
  const data = await response.json();
  if (data.errors?.length) throw new Error("Edge analytics unavailable");
  return data.data?.viewer?.zones?.[0] ?? null;
}

function table(title, key, rows, dimension) {
  if (!rows?.length) return `<p>${escape(title)}: no rows returned.</p>`;
  return `<table><caption>${escape(title)}</caption><thead><tr><th scope="col">${escape(key)}</th><th scope="col">Requests</th></tr></thead><tbody>${
    rows.map((row) => `<tr><td>${escape(row.dimensions?.[dimension] ?? "Unknown")}</td><td>${number(row.count)}</td></tr>`).join("")
  }</tbody></table>`;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.hostname !== adminHost || url.protocol !== "https:" || !ctx?.access ||
        !env.ACCESS_AUDIENCE || ctx.access.aud !== env.ACCESS_AUDIENCE || !env.ADMIN_EMAILS) {
      return reply("Access required", "text/plain; charset=utf-8", 403);
    }
    let user;
    try { user = await ctx.access.getIdentity(); } catch { /* Fail closed. */ }
    const allowed = env.ADMIN_EMAILS.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (!user?.email || !allowed.includes(String(user.email).toLowerCase())) {
      return reply("Access required", "text/plain; charset=utf-8", 403);
    }
    if (req.method !== "GET") return reply("Method not allowed", "text/plain; charset=utf-8", 405);
    if (url.pathname === "/style.css") return reply(css, "text/css; charset=utf-8");
    if (url.pathname !== "/") return reply("Not found", "text/plain; charset=utf-8", 404);

    const [health, catalogue, stats] = await Promise.allSettled([
      request(origin + "/?source=admin-health", {method: "HEAD"}),
      request(origin + "/catalogue.json").then((response) => response.json()),
      traffic(env)
    ]);
    const items = catalogue.status === "fulfilled" && Array.isArray(catalogue.value) ? catalogue.value : null;
    const statsData = stats.status === "fulfilled" ? stats.value : null;
    const checked = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(new Date());
    return reply(`<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Site Administration | Ashton Milton</title><link rel="stylesheet" href="/style.css">
      <header><h1>Site Administration</h1><p>ashtonmilton.net · Private</p></header><main>
      <section><h2>Infrastructure</h2><dl><dt>HTTPS availability</dt><dd>${health.status === "fulfilled" ? "Public site responded successfully." : "Public site check failed."} Checked ${escape(checked)} UTC.</dd>
      <dt>Deployment and monitoring</dt><dd><a href="${workflow}">GitHub Actions</a></dd>
      <dt>DNS and security events</dt><dd><a href="https://dash.cloudflare.com/">Open Cloudflare</a></dd></dl></section>
      <section><h2>Readership</h2><p>Cloudflare edge requests, last seven days plus today (UTC). Counts can be sampled and include bots. They are not unique people or browser page views.</p>
      ${statsData ? `<div class="tables">${table("Daily Traffic", "Day", statsData.time, "date")}${table("Writing Requests", "Path", statsData.paths, "clientRequestPath")}${table("Countries", "Country", statsData.countries, "clientCountryName")}</div>`
        : "<p>Edge analytics unavailable. Check the zone permissions and dataset in Cloudflare.</p>"}
      <p><a href="https://dash.cloudflare.com/">Open Cloudflare Web Analytics</a> for browser readership and performance, once enabled.</p></section>
      <section><h2>Downloadable Publications</h2>${items ? items.length ? "<ul>" + items.map((item) => `<li>${escape(item.title)} · ${escape(item.type)} · ${escape(item.version)}</li>`).join("") + "</ul>" :
        "<p>No downloadable publications have been released.</p>" : "<p>The public catalogue could not be checked.</p>"}</section>
      <section><h2>Enquiries and Subscribers</h2><p>No inbox or newsletter data source is connected.</p></section></main></html>`, "text/html; charset=utf-8");
  }
};
