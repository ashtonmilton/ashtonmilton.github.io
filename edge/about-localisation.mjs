const destinations = new Map([
  ["CN", "/zh/about/"],
  ["TH", "/th/about/"],
  ["JP", "/ja/about/"]
]);

export function routeAbout(request) {
  const url = new URL(request.url);
  if (url.hostname !== "ashtonmilton.net" || url.pathname !== "/about/" ||
      !["GET", "HEAD"].includes(request.method) || url.searchParams.has("lang")) {
    return null;
  }
  const path = destinations.get(request.cf?.country);
  if (!path) return null;
  url.pathname = path;
  return new Response(null, {
    status: 302,
    headers: { Location: url.href, "Cache-Control": "private, no-store" }
  });
}

export default {
  fetch(request, env) {
    return (env.ABOUT_LOCALISATION === "on" && routeAbout(request)) || fetch(request);
  }
};
