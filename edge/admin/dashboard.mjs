import { editableWriting, listWriting, preparePublication, publicationStatus, publishingForm, PublishError, readForm, reviseWriting, submitPublication } from "./publishing.mjs";
import { endSession, localLoginReady, loginInput, matchesPassword, startSession, validSession } from "./session.mjs";
import { editablePages, openCopy, saveCopy, uploadFile } from "./content.mjs";
import { readership } from "./readership.mjs";

const origin = "https://ashtonmilton.net";
const adminHost = "admin.ashtonmilton.net";
const workflow = "https://github.com/ashtonmilton/ashtonmilton.github.io/actions";
const isoDate = (date) => date.toISOString().slice(0, 10);
const escape = (value) => String(value).replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const number = (value) => Number.isFinite(value) ? new Intl.NumberFormat("en-GB").format(value) : "Unavailable";
const css = `*{box-sizing:border-box}body{margin:0;background:#16352c;color:#faf6ed;font:1rem/1.55 Avenir,system-ui,sans-serif}header,main{max-width:72rem;margin:auto;padding:1.5rem}header,section{border-bottom:1px solid #faf6ed55}section{padding:1rem 0 1.75rem}h1{font-size:2rem;margin:.25rem 0}h2{font-size:1.4rem}h3{font-size:1rem}a{color:#ead28d}a:focus-visible{outline:2px solid #fff;outline-offset:3px}table{width:100%;border-collapse:collapse;table-layout:fixed}caption{text-align:left;font-weight:600;margin:.5rem 0}th,td{text-align:left;padding:.45rem 0;border-bottom:1px solid #faf6ed33;overflow-wrap:anywhere}th:last-child,td:last-child{text-align:right;width:8rem}.tables{display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))}dt{font-weight:600}dd{margin:0 0 .75rem}small{color:#faf6edda}`;

const publishingCss = `.form-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr));gap:1rem}.form-fields .wide{grid-column:1/-1}label{display:block;font-weight:600}input:not([type=checkbox]),textarea,select{display:block;width:100%;margin-top:.35rem;padding:.55rem;border:1px solid #faf6ed70;background:#102c25;color:#faf6ed;font:inherit}textarea{resize:vertical}.publish-confirm{margin:1.25rem 0}button{font:inherit;font-weight:600;padding:.6rem 1rem;background:#ead28d;color:#182923;border:0;cursor:pointer}button:focus-visible{outline:2px solid white;outline-offset:3px}.publish-status{border-inline-start:2px solid #ead28d;padding-inline-start:1rem}`;

function reply(body, type, status = 200) {
  return new Response(body, { status, headers: {
    "Content-Type": type,
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  }});
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(5500) });
  if (!response.ok) throw new Error("Upstream unavailable");
  return response;
}

function redirect(path, session) {
  const response = reply(null, "text/plain; charset=utf-8", 303);
  response.headers.set("Location", new URL(path, `https://${adminHost}`).href);
  if (session) response.headers.set("Set-Cookie", session);
  return response;
}

function loginPage(message = "", status = 200) {
  return reply(`<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign In | Ashton Milton</title><link rel="stylesheet" href="/style.css">
    <main class="login"><p class="site-name">Ashton Milton</p><h1>Site Administration</h1>
    ${message ? `<p role="alert">${escape(message)}</p>` : ""}
    <form method="post" action="/login"><label>Admin Password<input type="password" name="password" required maxlength="64" autocomplete="current-password"></label><button type="submit">Sign In</button></form></main></html>`, "text/html; charset=utf-8", status);
}

function editPage(body, status = 200, title = "Edit Work") {
  return reply(`<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | Ashton Milton</title><link rel="stylesheet" href="/style.css"><main><p><a href="/">Site Administration</a></p><h1>${escape(title)}</h1>${body}</main></html>`, "text/html; charset=utf-8", status);
}

async function contentEditor(req, env, url) {
  const upload = url.pathname === "/upload";
  const title = upload ? "Upload a Public File" : "Edit Site Copy";
  if (!env.GITHUB_PUBLISH_TOKEN) return editPage("<p>Publishing is not configured.</p>", 503, title);
  if (req.method === "POST" && req.headers.get("Origin") !== url.origin) return reply("Same-origin submission required.", "text/plain; charset=utf-8", 403);
  try {
    if (req.method === "POST") {
      const form = await readForm(req, upload ? 4 * 1024 * 1024 + 8192 : 480 * 1024);
      if (upload) {
        const {sha, path} = await uploadFile(env.GITHUB_PUBLISH_TOKEN, form);
        return redirect(`/upload?asset=${encodeURIComponent(path)}&commit=${sha}`);
      }
      const id = String(form.get("id") || "");
      const sha = await saveCopy(id, env.GITHUB_PUBLISH_TOKEN, form);
      return redirect(`/content?page=${encodeURIComponent(id)}&commit=${sha}`);
    }
    if (req.method !== "GET") return reply("Method not allowed", "text/plain; charset=utf-8", 405);
    const sha = url.searchParams.get("commit") || "";
    const deployment = /^[a-f0-9]{40}$/.test(sha) ? await publicationStatus(sha) : null;
    const notice = /^[a-f0-9]{40}$/.test(sha) ? `<p class="publish-status">${escape(deployment || "Change recorded. Check GitHub Actions for deployment status.")}</p>` : "";
    if (upload) {
      const asset = url.searchParams.get("asset") || "";
      const urlNotice = /^\/assets\/uploads\/[a-z0-9-]+\.(pdf|jpe?g|png|webp)$/.test(asset) ? `<p>Public path after deployment: <a href="${origin}${escape(asset)}">${escape(asset)}</a></p>` : "";
      return editPage(`${notice}${urlNotice}<form method="post" enctype="multipart/form-data"><label>Public File<input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required></label><p>PDF, JPEG, PNG or WebP, up to 4 MiB. Give each file a unique name.</p><label class="publish-confirm"><input type="checkbox" name="confirm" value="yes" required> I approve this file for public release.</label><button type="submit">Upload Public File</button></form>`, 200, title);
    }
    const id = url.searchParams.get("page");
    if (!id) {
      const posts = await listWriting(env.GITHUB_PUBLISH_TOKEN);
      const links = (rows) => rows.map(([key, label]) => `<li><a href="/content?page=${encodeURIComponent(key)}">${escape(label)}</a></li>`).join("");
      return editPage(`<h2>Main Pages</h2><ul>${links(editablePages)}</ul><h2>Existing Work</h2><ul>${links(posts.map((slug) => [`article:${slug}`, slug.replace(/-/g, " ")]))}</ul><p><a href="/edit">Edit a Piece Created in This Dashboard</a></p>`, 200, title);
    }
    const page = await openCopy(id, env.GITHUB_PUBLISH_TOKEN);
    const fields = page.fields.map(({label, value}, i) => `<label class="wide">${escape(({metaTitle:"Search Title", description:"Search Description", summary:"Archive Summary", title:"Title", question:"Opening Question"})[label] || label)} ${label === "Page Copy" ? i + 1 : ""}<textarea name="copy-${i}" rows="${Math.min(7, Math.max(2, Math.ceil(value.length / 95)))}">${escape(value)}</textarea></label>`).join("");
    return editPage(`${notice}<p><a href="/content">Choose Another Page</a></p><form method="post"><input type="hidden" name="id" value="${escape(id)}"><input type="hidden" name="previous" value="${page.previous}"><div class="form-fields">${fields}</div><label class="publish-confirm"><input type="checkbox" name="confirm" value="yes" required> I approve these changes for publication.</label><button type="submit">Publish Changes</button></form>`, 200, `Edit Copy: ${page.title}`);
  } catch (error) {
    return editPage(`<p>${escape(error instanceof PublishError ? error.message : "The change could not be confirmed. Check GitHub before trying again.")}</p><p><a href="${url.pathname}">Return to ${escape(title)}</a></p>`, error instanceof PublishError ? error.status : 502, title);
  }
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

function readershipTable({title, rows}) {
  if (!rows?.length) return `<div><h3>${escape(title)}</h3><p>${rows ? "No reportable activity in this period." : "Data unavailable."}</p></div>`;
  return `<table><caption>${escape(title)}</caption><thead><tr><th scope="col">Item</th><th scope="col">Count</th></tr></thead><tbody>${rows.map(({label, total}) =>
    `<tr><td>${escape(label)}</td><td>${number(Number(total))}</td></tr>`).join("")}</tbody></table>`;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.host !== adminHost || url.protocol !== "https:") return reply("Not found", "text/plain; charset=utf-8", 404);
    const native = localLoginReady(env);
    if (native && req.method === "GET" && url.pathname === "/style.css") {
      return reply(css + publishingCss + ".login{max-width:28rem;margin:10vh auto}.login button{margin-top:1rem}.site-name{color:#ead28d}", "text/css; charset=utf-8");
    }
    if (native && req.method === "POST" && url.pathname === "/login") {
      if (req.headers.get("Origin") !== url.origin) return reply("Same-origin submission required.", "text/plain; charset=utf-8", 403);
      try {
        const limit = await env.ADMIN_LOGIN_LIMIT.limit({key: req.headers.get("CF-Connecting-IP") || "unknown"});
        if (!limit.success) return loginPage("Too many sign-in attempts. Try again in a minute.", 429);
        if (!await matchesPassword(await loginInput(req), env.ADMIN_LOGIN_KEY)) return loginPage("The admin password is incorrect.", 401);
        return redirect("/", await startSession(env.ADMIN_LOGIN_KEY));
      } catch { return loginPage("Sign-in is temporarily unavailable.", 503); }
    }
    if (native && req.method === "POST" && url.pathname === "/logout") {
      if (req.headers.get("Origin") !== url.origin) return reply("Same-origin submission required.", "text/plain; charset=utf-8", 403);
      return redirect("/", endSession());
    }
    if (native) {
      if (!await validSession(req, env.ADMIN_LOGIN_KEY)) {
        if (req.method === "GET" && url.pathname === "/") return loginPage();
        return reply("Sign-in required", "text/plain; charset=utf-8", 401);
      }
    } else if (!ctx?.access || !env.ACCESS_AUDIENCE || ctx.access.aud !== env.ACCESS_AUDIENCE || !env.ADMIN_EMAILS) {
      return reply("Access required", "text/plain; charset=utf-8", 403);
    } else {
      let user;
      try { user = await ctx.access.getIdentity(); } catch { /* Fail closed. */ }
      const allowed = env.ADMIN_EMAILS.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
      if (!user?.email || !allowed.includes(String(user.email).toLowerCase())) {
        return reply("Access required", "text/plain; charset=utf-8", 403);
      }
    }
    if (url.pathname === "/content" || url.pathname === "/upload") return contentEditor(req, env, url);
    if (req.method === "POST" && (url.pathname === "/publish" || url.pathname === "/edit")) {
      if (req.headers.get("Origin") !== url.origin) return reply("Same-origin submission required.", "text/plain; charset=utf-8", 403);
      if (!env.GITHUB_PUBLISH_TOKEN) return reply("Publishing is not configured.", "text/plain; charset=utf-8", 503);
      try {
        const publication = url.pathname === "/edit" ? await reviseWriting(req, env.GITHUB_PUBLISH_TOKEN) : await preparePublication(req);
        const commit = await submitPublication(publication, env.GITHUB_PUBLISH_TOKEN);
        const destination = new URL("/", url.origin);
        destination.searchParams.set("commit", commit);
        destination.searchParams.set("post", publication.slug);
        const response = reply(null, "text/plain; charset=utf-8", 303);
        response.headers.set("Location", destination.href);
        return response;
      } catch (error) {
        const message = error instanceof PublishError ? error.message : "The submission could not be processed.";
        return reply(`<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Publication Not Confirmed</title><link rel="stylesheet" href="/style.css"><main><h1>Publication Not Confirmed</h1><p>${escape(message)}</p><p>Use your browser’s Back button to return to your draft.</p><p><a href="/">Return to Administration</a></p></main></html>`,
          "text/html; charset=utf-8", error instanceof PublishError ? error.status : 500);
      }
    }
    if (req.method !== "GET") return reply("Method not allowed", "text/plain; charset=utf-8", 405);
    if (url.pathname === "/style.css") return reply(css + publishingCss, "text/css; charset=utf-8");
    if (url.pathname === "/edit") {
      if (!env.GITHUB_PUBLISH_TOKEN) return editPage("<p>Publishing is not configured.</p>", 503);
      try {
        const slug = url.searchParams.get("post");
        if (!slug) {
          const names = await listWriting(env.GITHUB_PUBLISH_TOKEN);
          return editPage(`<p>Work created here can be edited. Older pieces retain their original format.</p><ul>${names.map((name) => `<li><a href="/edit?post=${name}">${escape(name.replace(/-/g, " "))}</a></li>`).join("")}</ul>`);
        }
        const item = await editableWriting(slug, env.GITHUB_PUBLISH_TOKEN);
        return editPage(`<form method="post" action="/edit"><input type="hidden" name="slug" value="${escape(item.slug)}"><input type="hidden" name="previous" value="${escape(item.previous)}">
          <div class="form-fields"><label class="wide">Title<input name="title" required maxlength="120" value="${escape(item.data.title)}"></label>
          <label class="wide">Summary<input name="summary" required maxlength="300" value="${escape(item.data.summary)}"></label>
          <label class="wide">Writing<textarea name="writing" rows="18" required maxlength="102400">${escape(item.writing)}</textarea></label></div>
          <label class="publish-confirm"><input name="confirm" type="checkbox" value="yes" required> I approve these changes for publication.</label><button type="submit">Publish Changes</button></form>`);
      } catch (error) {
        const message = error instanceof PublishError ? error.message : "The work could not be opened.";
        return editPage(`<p>${escape(message)}</p><p><a href="/edit">Return to Work</a></p>`, error instanceof PublishError ? error.status : 502);
      }
    }
    if (url.pathname !== "/") return reply("Not found", "text/plain; charset=utf-8", 404);

    const commit = url.searchParams.get("commit") || "";
    const post = url.searchParams.get("post") || "";
    const receipt = /^[a-f0-9]{40}$/.test(commit) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post);
    const [health, catalogue, stats, deployment, readerReport] = await Promise.allSettled([
      request(origin + "/?source=admin-health", {method: "HEAD"}),
      request(origin + "/catalogue.json").then((response) => response.json()),
      traffic(env),
      receipt ? publicationStatus(commit) : null,
      readership(env)
    ]);
    const items = catalogue.status === "fulfilled" && Array.isArray(catalogue.value) ? catalogue.value : null;
    const statsData = stats.status === "fulfilled" ? stats.value : null;
    const checked = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(new Date());
    return reply(`<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Site Administration | Ashton Milton</title><link rel="stylesheet" href="/style.css">
      <header><h1>Site Administration</h1><p>ashtonmilton.net · Private</p>${native ? '<form method="post" action="/logout"><button type="submit">Sign Out</button></form>' : ""}</header><main>
      <section><h2>Publish Work</h2>
      ${receipt ? `<div class="publish-status"><p>${escape(deployment.value || "Submission recorded. Check GitHub Actions for deployment status.")}</p>
      <p><a href="https://github.com/ashtonmilton/ashtonmilton.github.io/commit/${commit}">View Commit</a> · <a href="${origin}/writing/${post}/">Open Public URL</a> · <a href="${workflow}">Deployment Runs</a></p></div>` : ""}
      ${env.GITHUB_PUBLISH_TOKEN ? '<p><a href="/edit">Edit Work</a> · <a href="/content">Edit Site Copy</a> · <a href="/upload">Upload a Public File</a></p>' + publishingForm() : "<p>Publishing is unavailable until the repository connection is configured.</p>"}</section>
      <section><h2>Infrastructure</h2><dl><dt>HTTPS availability</dt><dd>${health.status === "fulfilled" ? "Public site responded successfully." : "Public site check failed."} Checked ${escape(checked)} UTC.</dd>
      <dt>Deployment and monitoring</dt><dd><a href="${workflow}">GitHub Actions</a></dd>
      <dt>DNS and security events</dt><dd><a href="https://dash.cloudflare.com/">Open Cloudflare</a></dd></dl></section>
      <section><h2>Readership</h2><p>Browser activity from consenting readers over the last 30 days. Counts may be sampled; they do not represent unique readers or time spent reading.</p>
      ${Array.isArray(readerReport.value) ? `<div class="tables">${readerReport.value.map(readershipTable).join("")}</div>` : "<p>Browser activity reporting is not connected.</p>"}
      <p><a href="https://search.google.com/search-console/">Google Search Console</a> reports search queries from Google, rather than searches within Work.</p></section>
      <section><h2>Edge Traffic</h2><p>Cloudflare edge requests, last seven days plus today (UTC). Counts can be sampled and include bots. They are not unique people or browser page views.</p>
      ${statsData ? `<div class="tables">${table("Daily Traffic", "Day", statsData.time, "date")}${table("Writing Requests", "Path", statsData.paths, "clientRequestPath")}${table("Countries", "Country", statsData.countries, "clientCountryName")}</div>`
        : "<p>Edge analytics unavailable. Check the zone permissions and dataset in Cloudflare.</p>"}
      <p><a href="https://dash.cloudflare.com/">Open Cloudflare Web Analytics</a> for browser readership and performance, once enabled.</p></section>
      <section><h2>Downloadable Publications</h2>${items ? items.length ? "<ul>" + items.map((item) => `<li>${escape(item.title)} · ${escape(item.type)} · ${escape(item.version)}</li>`).join("") + "</ul>" :
        "<p>No downloadable publications have been released.</p>" : "<p>The public catalogue could not be checked.</p>"}</section>
      <section><h2>Enquiries and Subscribers</h2><p>No inbox or newsletter data source is connected.</p></section></main></html>`, "text/html; charset=utf-8");
  }
};
