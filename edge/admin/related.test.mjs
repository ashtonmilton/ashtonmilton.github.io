import assert from "node:assert/strict";
import test from "node:test";
import {relatedChoices, selectedRelated} from "./related.mjs";

test("Related Work preselects authored links, with no self links and no arbitrary URLs", () => {
  const existing = [{url:"/writing/first/",label:"An Authored Label"}, {url:"/writing/withdrawn/",label:"Withdrawn Work"}];
  const available = new Map([["/writing/self/","Current"], ["/writing/first/","First"], ["/writing/second/","Second"]]);
  const choices = relatedChoices(available, "/writing/self/", existing);
  assert.deepEqual(choices.map(({checked,available}) => [checked,available]), [[true,true],[true,false],[false,true]]);
  assert.deepEqual(selectedRelated(new URLSearchParams([["related","/writing/first/"],["related","/writing/second/"]]), choices),
    [{url:"/writing/first/",label:"An Authored Label"},{url:"/writing/second/",label:"Second"}]);
  assert.deepEqual(selectedRelated(new URLSearchParams(), choices), []);
  assert.deepEqual(selectedRelated(new URLSearchParams({related:"/writing/first/", "related-label:/writing/first/":"Edited label"}), choices),
    [{url:"/writing/first/",label:"Edited label"}]);
  assert.throws(() => selectedRelated(new URLSearchParams({related:"/writing/self/"}), choices), /still public/);
});
