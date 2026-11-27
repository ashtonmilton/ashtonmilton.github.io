const sources = new Set(["Direct or unknown", "Internal navigation", "Google", "Bing", "Baidu", "DuckDuckGo", "LinkedIn", "Instagram", "Facebook", "Reddit", "Wikipedia", "Other website"]);
const topics = new Set(["Asia", "Cities and Infrastructure", "Education", "Migration and Residency", "Welfare and Social Protection", "Work and Labour", "Gender and Care", "Inequality", "Public Policy and Governance", "Photography", "Public Health", "Other"]);
const pagePath = /^\/(?:[a-z0-9-]+\/){0,4}$/;
const filePath = /^\/(?:assets\/uploads|publications\/files)\/[a-z0-9._-]+$/i;

export async function recordReadership(req, env) {
  const response = (status) => new Response(null, {status, headers: {"Cache-Control": "no-store"}});
  if (new URL(req.url).host !== "ashtonmilton.net" || req.method !== "POST" || req.headers.get("Origin") !== "https://ashtonmilton.net") return response(403);
  if (env.READERSHIP_ENABLED !== "on" || !env.READERSHIP_EVENTS || !env.READERSHIP_LIMIT) return response(404);
  if (!req.body || Number(req.headers.get("Content-Length")) > 768) return response(413);
  try {
    const limit = await env.READERSHIP_LIMIT.limit({key: req.headers.get("CF-Connecting-IP") || "unknown"});
    if (!limit.success) return response(429);
    const reader = req.body.getReader();
    const decoder = new TextDecoder();
    let raw = "", size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 768) { await reader.cancel(); return response(413); }
      raw += decoder.decode(value, {stream: true});
    }
    const {kind, path, detail} = JSON.parse(raw + decoder.decode());
    if (typeof path !== "string" || path.length > 150 || typeof detail !== "string") return response(400);
    const valid = (kind === "page" && pagePath.test(path) && sources.has(detail)) ||
      (kind === "work-click" && /^\/writing\/[a-z0-9-]+\/$/.test(path) && detail === "Work") ||
      (kind === "download" && filePath.test(path) && !path.includes("..") && detail === "Download") ||
      (kind === "search" && path === "/writing/" && topics.has(detail));
    if (!valid) return response(400);
    const country = /^[A-Z]{2}$/.test(req.cf?.country || "") ? req.cf.country : "Unknown";
    env.READERSHIP_EVENTS.writeDataPoint({indexes: [kind], blobs: [kind, path, detail, country], doubles: [1]});
    return response(204);
  } catch { return response(400); }
}
