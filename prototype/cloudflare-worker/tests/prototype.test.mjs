import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function mockKV() {
  const m = new Map();
  return {
    async get(key,opts){const v=m.get(key);return v===undefined?null:opts?.type==="json"?JSON.parse(v):v;},
    async put(key,value){m.set(key,value);}
  };
}
const freshDate = new Date().toUTCString();
const feed = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>通信 &amp; AI に関する重要ニュース</title><link>https://example.org/story?utm_source=test</link><description>日本国内で新しい通信インフラが発表された。</description><pubDate>${freshDate}</pubDate></item></channel></rss>`;
test("health returns without touching feeds",async()=>{
  const old=globalThis.fetch;globalThis.fetch=()=>{throw Error("should not fetch")};
  try {
    const resp=await worker.fetch(new Request("https://test.invalid/api/health"),{NEWS:mockKV()},{waitUntil(){}});
    assert.equal(resp.status,200);assert.equal((await resp.json()).ok,true);
  }finally{globalThis.fetch=old;}
});
test("initial ingest, dedup, safe HTML, feed status and rss",async()=>{
  const old=globalThis.fetch;
  globalThis.fetch=async()=>new Response(feed,{status:200});
  const env={NEWS:mockKV()};
  try {
    const resp=await worker.fetch(new Request("https://test.invalid/"),env,{waitUntil(){}});
    assert.equal(resp.status,200);
    const html=await resp.text();
    assert.match(html,/Karin Daily/);
    assert.match(html,/通信 &amp; AI/);
    const status=await (await worker.fetch(new Request("https://test.invalid/api/status"),env,{})).json();
    assert.equal(status.stored,1);
    assert.ok(status.feeds.every(f=>f.ok));
    const article=await (await worker.fetch(new Request("https://test.invalid/api/articles"),env,{})).json();
    assert.equal(article.articles.length,1);
    assert.equal(article.articles[0].relatedSources.length,1);
    const rss=await (await worker.fetch(new Request("https://test.invalid/rss.xml"),env,{})).text();
    assert.match(rss,/<rss/);
  }finally{globalThis.fetch=old;}
});
test("preserves last successful digest during complete outage",async()=>{
  const old=globalThis.fetch;const env={NEWS:mockKV()};
  globalThis.fetch=async()=>new Response(feed,{status:200});
  try {
    await worker.fetch(new Request("https://test.invalid/"),env,{});
    const before=await env.NEWS.get("latest",{type:"json"});
    globalThis.fetch=async()=>{throw Error("offline")};
    const pending=[];
    await worker.scheduled({},env,{waitUntil:p=>pending.push(p)});
    await Promise.all(pending);
    const after=await env.NEWS.get("latest",{type:"json"});
    assert.equal(after.generatedAt,before.generatedAt);
    assert.equal(after.articles.length,1);
  }finally{globalThis.fetch=old;}
});
