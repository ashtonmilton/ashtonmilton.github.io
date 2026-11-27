import test from "node:test";
import assert from "node:assert/strict";
import { routeAbout } from "./about-localisation.mjs";

function visit(country, path = "/about/", method = "GET") {
  return routeAbout(Object.assign(new Request("https://ashtonmilton.net" + path, { method }), {
    cf: country ? { country } : undefined
  }));
}

test("Country redirects are temporary and cannot be reused across visitors", () => {
  for (const [country, prefix] of [["CN", "zh"], ["TH", "th"], ["JP", "ja"]]) {
    for (const method of ["GET", "HEAD"]) {
      const response = visit(country, "/about/?source=link", method);
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("Location"), `https://ashtonmilton.net/${prefix}/about/?source=link`);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
  }
});

test("Explicit choices, VPN bypass and unmapped places remain on the requested URL", () => {
  for (const country of ["CN", "TH", "JP", "GB", "US", "FR", "AU", "HK", "TW", "XX", "T1", undefined]) {
    for (const path of ["/zh/about/", "/th/about/", "/ja/about/", "/about/?lang=en", "/", "/writing/"]) {
      assert.equal(visit(country, path), null);
    }
    if (!["CN", "TH", "JP"].includes(country)) assert.equal(visit(country), null);
    assert.equal(visit(country, "/about/", "POST"), null);
  }
});
