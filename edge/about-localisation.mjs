const destinations = new Map([
  ["CN", "/zh/about/"],
  ["TH", "/th/about/"],
  ["JP", "/ja/about/"]
]);

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
  const path = destinations.get(request.cf?.country);
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
