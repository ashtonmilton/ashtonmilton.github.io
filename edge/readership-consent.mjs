import {startReadership} from "../assets/js/readership-browser.js";

const client = "/_readership-client.js";
const style = "/_readership-switch.css";
const controls = `<div id="analytics-preference" hidden><button type="button" role="switch" aria-checked="false" aria-describedby="analytics-notice">Analytics <span class="analytics-track" aria-hidden="true"></span></button></div>`;
export const switchCss = `#analytics-preference button{display:inline-flex;gap:.55rem;align-items:center;min-height:44px;padding:0 .2rem;border:0;background:none;color:inherit;font:inherit;cursor:pointer}
.footer-preferences{display:flex;align-items:center;gap:0 1rem;flex-wrap:wrap}
.footer-preferences details[open]{flex-basis:100%}
#analytics-preference button:focus-visible{outline:2px solid var(--gold,#d4af37);outline-offset:3px}
#analytics-preference button[aria-disabled=true]{cursor:default;opacity:.7}
.analytics-track{box-sizing:border-box;display:inline-flex;align-items:center;width:2.25rem;height:1.25rem;padding:.125rem;border:1px solid currentColor;border-radius:1rem}
.analytics-track::after{content:"";width:.875rem;height:.875rem;border-radius:50%;background:currentColor}
[role=switch][aria-checked=true] .analytics-track{justify-content:flex-end;background:var(--gold,#d4af37);color:var(--surface-deep,#10271f);border-color:var(--gold,#d4af37)}`;
const notice = `<p id="analytics-notice">Readership statistics help improve this site by measuring page views, publication clicks and downloads by page, country, device, browser and referral source. They are on by default in the UK and off elsewhere. Optional analytics previously allowed on this browser may also measure broad search topics, not the words you type, and site performance. The Analytics switch beside Privacy turns all collection off or enables basic statistics. The site remembers your choice on this browser without using an analytics identifier.</p>`;

export function readershipConsentClient(request, url, enabled, ukDefault = false) {
  if (![client, style].includes(url.pathname)) return null;
  if (!enabled || url.hostname !== "ashtonmilton.net" || !["GET", "HEAD"].includes(request.method)) return new Response(null, {status:404});
  if (url.pathname === style) return new Response(request.method === "GET" ? switchCss : null, {headers:{"Content-Type":"text/css; charset=utf-8","X-Content-Type-Options":"nosniff","Cache-Control":"public, max-age=300"}});
  const defaultBasic = ukDefault && request.cf?.country === "GB" && ["3", "4"].includes(url.searchParams.get("v"));
  return new Response(request.method === "GET" ? `(${startReadership.toString()})(${defaultBasic});` : null, {headers:{"Content-Type":"application/javascript; charset=utf-8", "X-Content-Type-Options":"nosniff", "Cache-Control":"private, no-store"}});
}

export function addReadershipConsent(request, url, response, enabled) {
  if (!enabled || url.hostname !== "ashtonmilton.net" || request.method !== "GET" || !response.ok || /\bnoindex\b/i.test(response.headers.get("X-Robots-Tag") || "") || !/\btext\/html\b/i.test(response.headers.get("Content-Type") || "")) return response;
  let existing = false, excluded = false, hasFooterRow = false;
  return new HTMLRewriter()
    .on("head meta[name]", {element(element) {
      const kind = element.getAttribute("name"), content = element.getAttribute("content") || "";
      if (kind === "readership-events" && content === "on") existing = true;
      if ((kind === "readership-edge-fallback" && content === "off") || (kind === "robots" && /\bnoindex\b/i.test(content))) excluded = true;
    }})
    .on("head", {element(element) {
      element.onEndTag((end) => {
        if (!excluded) end.before(`${existing ? "" : '<meta name="readership-events" content="on">'}<link rel="stylesheet" href="${style}"><script defer src="${client}?v=4"></script>`, {html:true});
      });
    }})
    .on('script[src^="/assets/js/analytics.js"], #analytics-preference, details.footer-privacy > p:nth-of-type(2)', {element(element) { if (!excluded) element.remove(); }})
    .on('link[href="/_readership-switch.css"]', {element(element) { if (!excluded) element.remove(); }})
    .on(".footer-preferences", {element() { hasFooterRow = true; }})
    .on("details.footer-privacy", {element(element) {
      if (!excluded) {
        element.before(hasFooterRow ? controls : `<div class="footer-preferences">${controls}`, {html:true});
        element.append(notice, {html:true});
        if (!hasFooterRow) element.after("</div>", {html:true});
      }
    }})
    .transform(response);
}
