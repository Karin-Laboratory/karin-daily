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

test("headline is the default, category tabs isolate sections and avoid duplicated lead", async () => {
 const env={NEWS:mockKV()};
 const published=new Date().toISOString();
 const entries=[
  ["japan","国内の災害対応が発表","domestic",95],
  ["econ","日本の経済政策","economy",86],
  ["world","海外情勢速報","world",85],
  ["ai","生成AIの新モデル","ai",90],
  ["science","創薬の研究成果","science",80]
 ].map(([id,title,category,score])=>({id,url:"https://example.org/"+id,title,category,score,published,summary:"ニュースの抜粋",source:"TEST",relatedSources:["TEST"]}));
 await env.NEWS.put("latest",JSON.stringify({generatedAt:published,feeds:[],articles:entries}));
 const front=await (await worker.fetch(new Request("https://test.invalid/"),env,{})).text();
 assert.match(front,/<title>ヘッドライン \| Karin Daily Next<\/title>/);
 assert.match(front,/href="\/" aria-current="page"/);
 assert.match(front,/href="\/\?category=ai"/);
 assert.match(front,/ヘッドライン一覧/);
 assert.match(front,/国内の災害対応が発表/);
 assert.match(front,/生成AIの新モデル/);
 assert.equal(front.split("国内の災害対応が発表").length-1,1,"top headline should appear only once");
 const ai=await (await worker.fetch(new Request("https://test.invalid/?category=ai"),env,{})).text();
 assert.match(ai,/<title>AI・生成AI \| Karin Daily Next<\/title>/);
 assert.match(ai,/生成AIの新モデル/);
 assert.doesNotMatch(ai,/国内の災害対応が発表/);
 const headlines=await (await worker.fetch(new Request("https://test.invalid/api/articles?category=headlines"),env,{})).json();
 assert.equal(headlines.articles.length,5);
 const category=await (await worker.fetch(new Request("https://test.invalid/api/articles?category=ai"),env,{})).json();
 assert.equal(category.articles.length,1);
 const all=await (await worker.fetch(new Request("https://test.invalid/api/articles?category=all"),env,{})).json();
 assert.equal(all.articles.length,5);
});

test("digest font is 16px across desktop and mobile, with balanced hierarchy", async () => {
 const env={NEWS:mockKV()};
 const now=new Date().toISOString();
 await env.NEWS.put("latest",JSON.stringify({
   generatedAt:now,feeds:[],
   articles:[{id:"typography",url:"https://example.org/type",title:"読みやすいニュース見出し",
     summary:"本文要約を16ピクセルで表示する",source:"TEST",category:"domestic",score:90,published:now}]
 }));
 const html=await (await worker.fetch(new Request("https://test.invalid/?category=domestic"),env,{})).text();
 assert.match(html,/\.excerpt\{font-size:16px;/);
 assert.match(html,/\.article h3\{[^}]*font-size:21px;/);
 assert.match(html,/\.hero \.summary\{font-size:17px;/);
 assert.match(html,/\.tabs a\{[^}]*font-size:14px;/);
 assert.match(html,/\.sidebar p\{font-size:14px;/);
 assert.match(html,/\.excerpt\{font-size:16px;line-height:1\.85\}/);
 assert.match(html,/本文要約を16ピクセルで表示する/);
});
