export function secureResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("X-Frame-Options", "DENY");
  if (headers.get("content-type")?.startsWith("text/html")) {
    headers.set("Content-Security-Policy", [
      "default-src 'self'", "object-src 'none'", "base-uri 'none'",
      "frame-ancestors 'none'", "form-action 'self'",
      "script-src 'self' https://static.cloudflareinsights.com/beacon.min.js",
      "connect-src 'self' https://cloudflareinsights.com https://ashtonmilton.net",
      "style-src 'self'", "img-src 'self' data:", "font-src 'self'"
    ].join("; "));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
