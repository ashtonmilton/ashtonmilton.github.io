import locales from "./escap-locales.json" with { type: "json" };

const destinations = new Map([
  ["CN", "/zh/about/"],
  ["TH", "/th/about/"],
  ["JP", "/ja/about/"],
  ["VN", "/vi/about/"],
  ...locales.flatMap(({ id, countries }) => countries.map((country) => [country, `/${id}/about/`]))
]);

function afghanDestination(request) {
  const preferences = (request.headers.get("Accept-Language") || "").split(",").map((item) => {
    const [raw, quality] = item.trim().toLowerCase().split(";q=");
    return { lang: raw, q: quality === undefined ? 1 : Number(quality) };
  }).filter(({ q }) => q > 0 && q <= 1).sort((a, b) => b.q - a.q);
  for (const { lang } of preferences) {
    if (lang === "fa-af" || /^prs(?:-|$)/.test(lang)) return "/prs/about/";
    if (/^ps(?:-|$)/.test(lang)) return "/ps/about/";
    if (/^en(?:-|$)/.test(lang)) return null;
  }
  return null;
}

function isHomepageRequest(request, url) {
  return url.hostname === "ashtonmilton.net" && url.pathname === "/" &&
    ["GET", "HEAD"].includes(request.method);
}

export function routeAbout(request) {
  const url = new URL(request.url);
  if (!isHomepageRequest(request, url) || url.searchParams.get("lang") === "en") {
    return null;
  }
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  const cookies = (request.headers.get("Cookie") || "").split(";").map((cookie) => cookie.trim());
  if (cookies.includes("ashton_site_language=en")) return null;
  const country = request.cf?.country;
  const path = country === "AF" ? afghanDestination(request) : destinations.get(country);
  if (!path) return null;
  url.pathname = path;
  headers.set("Location", url.href);
  return new Response(null, { status: 302, headers });
}

export default {
  async fetch(request, env) {
    if (env.ABOUT_LOCALISATION !== "on") return fetch(request);
    const redirect = routeAbout(request);
    if (redirect) return redirect;
    const origin = await fetch(request);
    const url = new URL(request.url);
    if (!isHomepageRequest(request, url) || url.searchParams.get("lang") !== "en" || !origin.ok) {
      return origin;
    }
    const response = new Response(origin.body, origin);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.append("Set-Cookie", "ashton_site_language=en; Path=/; Secure; HttpOnly; SameSite=Lax");
    return response;
  }
};
