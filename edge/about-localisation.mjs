import locales from "./escap-locales.json" with { type: "json" };
import { secureResponse } from "./security.mjs";
import { recordReadership } from "./readership.mjs";

const destinations = new Map([
  ["CN", "/zh/about/"],
  ["TH", "/th/about/"],
  ["JP", "/ja/about/"],
  ["VN", "/vi/about/"],
  ...locales.flatMap(({ id, countries }) => countries.map((country) => [country, `/${id}/about/`]))
]);
const editions = new Map([["en", "/"], ...[...new Set([...destinations.values(), "/prs/about/", "/ps/about/"])]
  .map((path) => [path.split("/")[1], path])]);
const preferenceCookie = "ashton_site_language";

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
  if (!isHomepageRequest(request, url) || url.search || url.hash) {
    return null;
  }
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  const preference = (request.headers.get("Cookie") || "").split(";").map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(preferenceCookie + "="))?.split("=")[1];
  if (preference === "en") return null;
  const country = request.cf?.country;
  const path = editions.get(preference) || (country === "AF" ? afghanDestination(request) : destinations.get(country));
  if (!path) return null;
  url.pathname = path;
  headers.set("Location", url.href);
  return new Response(null, { status: 302, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/_readership") return recordReadership(request, env);
    const redirect = env.ABOUT_LOCALISATION === "on" && routeAbout(request);
    if (redirect) return redirect;
    let origin = await fetch(request);
    if (env.SECURITY_HEADERS === "on") origin = secureResponse(origin);
    const preference = url.searchParams.get("lang");
    if (env.ABOUT_LOCALISATION !== "on" || url.protocol !== "https:" || url.hostname !== "ashtonmilton.net" ||
        request.method !== "GET" || editions.get(preference) !== url.pathname || !origin.ok) {
      return origin;
    }
    const response = new Response(origin.body, origin);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.append("Set-Cookie", `${preferenceCookie}=${preference}; Max-Age=15552000; Path=/; Secure; HttpOnly; SameSite=Lax`);
    return response;
  }
};
