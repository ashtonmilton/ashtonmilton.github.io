import assert from "node:assert/strict";
import test from "node:test";
import {addReadershipConsent, readershipConsentClient} from "./readership-consent.mjs";

test("The opt-in script is only served on the public host and non-HTML responses are untouched", async () => {
  const url = new URL("https://ashtonmilton.net/_readership-client.js");
  const client = readershipConsentClient(new Request(url), url, true);
  assert.equal(client.status, 200);
  assert.match(await client.text(), /ashton_readership_preference_v1/);
  assert.equal(readershipConsentClient(new Request(url), url, false).status, 404);
  assert.equal(readershipConsentClient(new Request(url, {method:"POST"}), url, true).status, 404);
  const response = Response.json({});
  assert.equal(addReadershipConsent(new Request(url),url,response,true), response);
});
