import test from "node:test";
import assert from "node:assert/strict";
import worker, { routeAbout } from "./about-localisation.mjs";

function visit(country, path = "/", method = "GET", cookie = "") {
  return routeAbout(Object.assign(new Request("https://ashtonmilton.net" + path, { method, headers: { Cookie: cookie } }), {
    cf: country ? { country } : undefined
  }));
}

test("Country redirects are temporary and cannot be reused across visitors", () => {
  for (const [country, prefix] of [["CN", "zh"], ["TH", "th"], ["JP", "ja"]]) {
    for (const method of ["GET", "HEAD"]) {
      const response = visit(country, "/?source=link", method);
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("Location"), `https://ashtonmilton.net/${prefix}/about/?source=link`);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
  }
});

test("Explicit choices, VPN bypass and unmapped places remain on the requested URL", () => {
  for (const country of ["CN", "TH", "JP", "GB", "US", "FR", "AU", "HK", "TW", "XX", "T1", undefined]) {
    for (const path of ["/zh/about/", "/th/about/", "/ja/about/", "/about/", "/writing/"]) {
      assert.equal(visit(country, path), null);
    }
    if (!["CN", "TH", "JP"].includes(country)) assert.equal(visit(country), null);
    assert.equal(visit(country, "/", "POST"), null);
  }
});

test("Choosing English returns the English page even without cookies", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response("English homepage"));
  assert.equal(visit("JP", "/?lang=en"), null);
  const request = Object.assign(new Request("https://ashtonmilton.net/?lang=en"), { cf: { country: "JP" } });
  const choice = await worker.fetch(request, { ABOUT_LOCALISATION: "on" });
  assert.equal(choice.status, 200);
  assert.equal(await choice.text(), "English homepage");
  assert.equal(choice.headers.get("Cache-Control"), "private, no-store");
  assert.match(choice.headers.get("Set-Cookie"), /^ashton_site_language=en;/);
  assert.equal(visit("JP", "/?source=welcome", "GET", "ashton_site_language=en"), null);
  assert.equal(visit("JP", "/ja/about/", "GET", "ashton_site_language=en"), null);
});
