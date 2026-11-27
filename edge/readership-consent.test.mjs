import assert from "node:assert/strict";
import test from "node:test";
import {runInNewContext} from "node:vm";
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

test("Basic readership defaults on only in the UK and honours opt-out and browser privacy", async () => {
  const url = new URL("https://ashtonmilton.net/_readership-client.js?v=4");
  async function run(country, initial, globalPrivacyControl = false) {
    const request = Object.assign(new Request(url), {cf:{country}});
    const response = readershipConsentClient(request,url,true,true);
    assert.equal(response.headers.get("Cache-Control"),"private, no-store");
    const events = [], listeners = {}, attrs = {}, button = {setAttribute:(k,v) => {attrs[k] = v;}};
    let preference = initial;
    const controls = {dataset:{},querySelector: (s) => s === '[role="switch"]' ? button : null,
      addEventListener: (k, fn) => {listeners[k] = fn;}};
    runInNewContext(await response.text(), {
      URL, navigator:{globalPrivacyControl}, location:{pathname:"/writing/"},
      localStorage:{getItem:() => preference, setItem:(_, value) => {preference = value;}},
      document:{documentElement:{dataset:{}},querySelector:(s) => s === "#analytics-preference" ? controls :
        s.includes("readership-events") ? {content:"on"} : null, addEventListener:(k,fn) => {listeners[k] = fn;}},
      fetch:async (_, request) => {events.push(JSON.parse(request.body)); return {ok:true};}
    });
    listeners["work-search-topic"]({detail:"Asia"});
    return {events,attrs,toggle() {listeners.click({target:{closest:(s) => s === '[role="switch"]' ? button : null}});
      listeners["work-search-topic"]({detail:"Education"}); return preference;}};
  }
  const british = await run("GB");
  assert.deepEqual(british.events.map(({kind})=>kind),["page"]);
  assert.equal(british.attrs["aria-checked"],"true");
  assert.equal(british.toggle(),"off");
  assert.equal(british.attrs["aria-checked"],"false");
  assert.equal(british.events.length,1);
  assert.equal((await run("GB","off")).events.length,0);
  const protectedBrowser = await run("GB",null,true);
  assert.equal(protectedBrowser.attrs["aria-disabled"],"true");
  protectedBrowser.toggle();
  assert.equal(protectedBrowser.events.length,0);
  assert.equal((await run("FR")).events.length,0);
  assert.deepEqual((await run("FR","allow")).events.map(({kind})=>kind),["page","search"]);
  const french = await run("FR");
  assert.equal(french.toggle(),"basic");
  assert.deepEqual(french.events.map(({kind})=>kind),["page"]);
});
