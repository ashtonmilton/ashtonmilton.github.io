import {startReadership} from "../assets/js/readership-browser.js";

const client = "/_readership-client.js";
const controls = `<aside class="wrap analytics-preference" id="analytics-preference" aria-label="Readership analytics" hidden>
<small role="status"></small> <button type="button" data-choice="off">Turn Off Analytics</button> <button type="button" data-choice="allow">Allow Optional Analytics</button> <a href="#privacy" data-analytics-details>Analytics Details</a></aside>`;
const notice = `<p data-analytics-notice>Basic readership statistics measure page views, publication clicks and downloads, grouped by page, country, device, browser and referral source to improve the site. They are on by default in the UK and off elsewhere. Optional analytics also measures broad search topics, not the words you type, and may measure site performance. Choose <a href="#analytics-preference">Analytics Preferences</a> to turn collection off or allow optional analytics. The site remembers your choice on this browser; it does not use an analytics identifier.</p>`;

export function readershipConsentClient(request, url, enabled, ukDefault = false) {
  if (url.pathname !== client) return null;
  if (!enabled || url.hostname !== "ashtonmilton.net" || !["GET", "HEAD"].includes(request.method)) return new Response(null, {status:404});
  const defaultBasic = ukDefault && request.cf?.country === "GB" && url.searchParams.get("v") === "3";
  return new Response(request.method === "GET" ? `(${startReadership.toString()})(${defaultBasic});` : null, {headers:{"Content-Type":"application/javascript; charset=utf-8", "X-Content-Type-Options":"nosniff", "Cache-Control":"private, no-store"}});
}

export function addReadershipConsent(request, url, response, enabled) {
  if (!enabled || url.hostname !== "ashtonmilton.net" || request.method !== "GET" || !response.ok || /\bnoindex\b/i.test(response.headers.get("X-Robots-Tag") || "") || !/\btext\/html\b/i.test(response.headers.get("Content-Type") || "")) return response;
  let existing = false, excluded = false;
  return new HTMLRewriter()
    .on("head meta[name]", {element(element) {
      const kind = element.getAttribute("name"), content = element.getAttribute("content") || "";
      if (kind === "readership-events" && content === "on") existing = true;
      if ((kind === "readership-edge-fallback" && content === "off") || (kind === "robots" && /\bnoindex\b/i.test(content))) excluded = true;
    }})
    .on("head", {element(element) {
      element.onEndTag((end) => {
        if (!excluded) end.before(`${existing ? "" : '<meta name="readership-events" content="on">'}<script defer src="${client}?v=3"></script>`, {html:true});
      });
    }})
    .on('script[src^="/assets/js/analytics.js"], #analytics-preference, details.footer-privacy > p:nth-of-type(2)', {element(element) { if (!excluded) element.remove(); }})
    .on("header.site-header", {element(element) {
      if (!excluded) element.after(controls, {html:true});
    }})
    .on("details.footer-privacy", {element(element) {
      if (!excluded) element.append(notice, {html:true});
    }})
    .transform(response);
}
