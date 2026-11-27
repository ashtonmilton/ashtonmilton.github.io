import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import dashboard from "./dashboard.mjs";
import {draftAction, draftList} from "./drafts.mjs";
import {draftImage, discardUnusedImage, stageImage} from "./draft-media.mjs";
import {releasePhotoWithImages} from "./photo-release.mjs";
import {applyEdition, editionFields, generatedProfiles} from "./translations.mjs";
import {releasePages} from "./page-release.mjs";

const origin = "https://admin.ashtonmilton.net";
const address = new URL(origin+"/draft-data?key="+encodeURIComponent("/content:edition:ko"));
const call = (url,body,requestOrigin=origin) => new Request(url, body ? {method:"POST",headers:{Origin:requestOrigin},body} : undefined);
function storage() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(readFileSync(new URL("./editorial-schema.sql",import.meta.url),"utf8"));
  return {
    prepare(sql) {
      const query=sqlite.prepare(sql);
      const bind=(...args) => ({
        first:async () => query.get(...args) ?? null,
        run:async () => ({meta:query.run(...args)}),
        all:async () => ({results:query.all(...args)})
      });
      return {...bind(),bind:(...args)=>bind(...args.map((arg)=>arg instanceof ArrayBuffer ? new Uint8Array(arg) : arg))};
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const result=[]; for (const statement of statements) result.push(await statement.run()); sqlite.exec("COMMIT"); return result; }
      catch(e) { sqlite.exec("ROLLBACK"); throw e; }
    }
  };
}
const post = (revision, fields) => new URLSearchParams({version:"a".repeat(64),revision,title:"Korean profile",fields:JSON.stringify(fields)});

test("Private drafts sync without GitHub, reject stale writes and require sign-in",async (t) => {
  const db=storage(), initial=[["copy-0","First draft"]];
  t.mock.method(globalThis,"fetch",() => {throw new Error("Draft routes must not call external services");});
  const response=await dashboard.fetch(call(address),{EDITORIAL_DB:db},{});
  assert.equal(response.status,403);
  const created=await draftAction(call(address,post(0,initial)),db,address);
  assert.deepEqual((await draftAction(call(address),db,address)).fields,initial);
  const update=await draftAction(call(address,post(created.revision,[["copy-0","From another device"]])),db,address);
  assert.notEqual(update.revision,created.revision);
  await assert.rejects(draftAction(call(address,post(created.revision,initial)),db,address),{status:409});
  await assert.rejects(draftAction(call(address,post(update.revision,initial),"https://ashtonmilton.net"),db,address),{status:403});
  assert.equal((await draftList(db)).length,1);
  await draftAction(call(address,new URLSearchParams({action:"discard",revision:update.revision})),db,address);
  assert.equal(await draftAction(call(address),db,address),null);
});

test("All generated profiles are editable without rewriting neighbouring translations",() => {
  assert.equal(generatedProfiles.size,27);
  for (const edition of generatedProfiles.values()) {
    const source=readFileSync(new URL("../../"+edition.path,import.meta.url),"utf8");
    const {offset,raw,fields}=editionFields(source,edition);
    const form=new Map(fields.map(({value},i)=>[`copy-${i}`,value]));
    form.set("copy-1",fields[1].value+" (test)");
    const output=applyEdition(source,edition,form);
    assert.equal(output.slice(0,offset),source.slice(0,offset));
    assert.ok(output.endsWith(source.slice(offset+raw.length)));
    assert.equal(editionFields(output,edition).fields[1].value,form.get("copy-1"));
  }
});

test("Two translated page drafts in one source file release as one deployment",async (t) => {
  const db=storage(), source=readFileSync(new URL("../../localisation/east.json",import.meta.url),"utf8");
  const head="a".repeat(40), release="f".repeat(40), calls=[];
  t.mock.method(globalThis,"fetch",async (url,init) => {
    const path = url.split("/ashtonmilton.github.io/")[1];
    calls.push({path,method:init.method || "GET",body:init.body ? JSON.parse(init.body) : null});
    if(path==="git/ref/heads/main") return Response.json({object:{sha:head}});
    if(path.startsWith("contents/")) return Response.json({type:"file",encoding:"base64",size:Buffer.byteLength(source),sha:head,content:Buffer.from(source).toString("base64")});
    if(path===`git/commits/${head}`)return Response.json({tree:{sha:"b".repeat(40)}});
    return Response.json({sha:release});
  });
  const releaseForm=new URLSearchParams({confirm:"yes"});
  for (const id of ["edition:ko","edition:id"]) {
    const edition=generatedProfiles.get(id);
    const {fields,raw}=editionFields(source,edition);
    const version=Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw))).toString("hex");
    const key="/content:"+id;
    const url=new URL(origin+"/draft-data?key="+encodeURIComponent(key));
    const edits=fields.map(({value},i)=>[`copy-${i}`,i===1 ? value+" (test)" : value]);
    const row=await draftAction(call(url,new URLSearchParams({version,revision:"0",fields:JSON.stringify(edits),title:id})),db,url);
    releaseForm.append("page-release",key+"|"+row.revision);
  }
  assert.equal(calls.length,0);
  assert.equal(await releasePages(db,"fixture",releaseForm),release);
  const tree=calls.find(({path})=>path==="git/trees").body.tree;
  assert.equal(tree.length,1);
  assert.ok(JSON.parse(tree[0].content).ko[0][1].endsWith(" (test)"));
  assert.ok(JSON.parse(tree[0].content).id[0][1].endsWith(" (test)"));
  assert.equal(calls.filter(({method})=>method==="PATCH").length,1);
  assert.deepEqual(await draftList(db),[]);
});

test("Staged photos stay private and publish in one Git branch update",async (t) => {
  const db=storage();
  const image=new Uint8Array(1024*1024+128);
  image.set([137,80,78,71,13,10,26,10]);
  const form=new FormData();
  form.set("file",new Blob([image],{type:"image/png"}),"draft.png");
  const upload=new URL(origin+"/draft-image");
  const staged=await stageImage(call(upload,form),db,upload);
  const id=staged.path.split("/").at(-1);
  assert.deepEqual((await draftImage(db,id)).bytes,image);
  const blocked=await dashboard.fetch(call(new URL(origin+staged.preview)),{EDITORIAL_DB:db},{});
  assert.equal(blocked.status,403);
  const photoAddress=new URL(origin+"/draft-data?key="+encodeURIComponent("/photos:new"));
  await draftAction(call(photoAddress,post(0,[["photo-1",staged.path]])),db,photoAddress);
  await assert.rejects(discardUnusedImage(db,staged.path),{status:409});
  const head="a".repeat(40), result="f".repeat(40), calls=[];
  t.mock.method(globalThis,"fetch",async (url,init) => {
    const path = url.split("/ashtonmilton.github.io/")[1];
    const body=init.body ? JSON.parse(init.body) : null;
    calls.push({path,method:init.method,body});
    if(path==="git/ref/heads/main") return Response.json({object:{sha:head}});
    if(path.startsWith("contents/")) return Response.json({}, {status:404});
    if(path===`git/commits/${head}`)return Response.json({tree:{sha:"b".repeat(40)}});
    if(path==="git/blobs") return Response.json({sha:"c".repeat(40)});
    if(path==="git/trees") return Response.json({sha:"d".repeat(40)});
    return Response.json({sha:result});
  });
  assert.equal(await releasePhotoWithImages({slug:"mock-photo",title:"Mock photo",markdown:"Fixture"},[staged.path],"fixture",db),result);
  assert.equal(calls.filter(({method})=>method==="PATCH").length,1);
  assert.deepEqual(calls.find(({path})=>path==="git/trees").body.tree.map(({path})=>path),["src/writing/essays/mock-photo.md",staged.path.slice(1)]);
  assert.deepEqual(Buffer.from(calls.find(({path})=>path==="git/blobs").body.content,"base64"),Buffer.from(image));
  assert.equal(await draftImage(db,id),null);
});
