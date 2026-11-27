import {startReadership} from "../assets/js/readership-browser.js";

const client = "/_readership-client.js";
const controls = `<p>Optional analytics measures page views, referral sources, country, device and browser groups, clicks and broad search topics, not the words you type. It is off unless you allow it; change your choice here at any time.</p>
<div id="analytics-preference" hidden><button type="button" data-choice="allow">Allow analytics</button> <button type="button" data-choice="off">Turn off analytics</button><p role="status"></p></div>`;

export function readershipConsentClient(request, url, enabled) {
  if (url.pathname !== client) return null;
  if (!enabled || url.hostname !== "ashtonmilton.net" || !["GET", "HEAD"].includes(request.method)) return new Response(null, {status:404});
  return new Response(request.method === "GET" ? `(${startReadership.toString()})();` : null, {headers:{"Content-Type":"application/javascript; charset=utf-8", "X-Content-Type-Options":"nosniff", "Cache-Control":"public, max-age=300"}});
}

export function addReadershipConsent(request, url, response, enabled) {
  if (!enabled || url.hostname !== "ashtonmilton.net" || request.method !== "GET" || !response.ok || /\bnoindex\b/i.test(response.headers.get("X-Robots-Tag") || "") || !/\btext\/html\b/i.test(response.headers.get("Content-Type") || "")) return response;
  let existing = false, excluded = false;
  const removeOld = {element(element) { if (!existing && !excluded) element.remove(); }};
  return new HTMLRewriter()
    .on("head meta[name]", {element(element) {
      const kind = element.getAttribute("name"), content = element.getAttribute("content") || "";
      if (kind === "readership-events" && content === "on") existing = true;
      if ((kind === "readership-edge-fallback" && content === "off") || (kind === "robots" && /\bnoindex\b/i.test(content))) excluded = true;
    }})
    .on("head", {element(element) {
      element.onEndTag((end) => {
        if (!existing && !excluded) end.before(`<meta name="readership-events" content="on"><script defer src="${client}?v=2"></script>`, {html:true});
      });
    }})
    .on('script[src^="/assets/js/analytics.js"]', removeOld)
    .on("#analytics-preference", removeOld)
    .on("details.footer-privacy", {element(element) {
      if (!existing && !excluded) element.append(controls, {html:true});
    }})
    .transform(response);
}
