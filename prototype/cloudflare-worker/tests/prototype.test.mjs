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
 await env.NEWS.put("latest",JSON.stringify({generatedAt:published,feeds:[{id:"akiba-used",ok:true,count:0}],articles:entries,editorialRevision:4}));
 const front=await (await worker.fetch(new Request("https://test.invalid/"),env,{})).text();
 assert.match(front,/<title>ヘッドライン \| Karin Daily<\/title>/);
 assert.match(front,/href="\/" aria-current="page"/);
 assert.match(front,/href="\/\?category=ai"/);
 assert.match(front,/ヘッドライン一覧/);
 assert.match(front,/国内の災害対応が発表/);
 assert.match(front,/生成AIの新モデル/);
 assert.equal(front.split("国内の災害対応が発表").length-1,1,"top headline should appear only once");
 const ai=await (await worker.fetch(new Request("https://test.invalid/?category=ai"),env,{})).text();
 assert.match(ai,/<title>AI・生成AI \| Karin Daily<\/title>/);
 assert.match(ai,/生成AIの新モデル/);
 assert.doesNotMatch(ai,/国内の災害対応が発表/);
 const headlines=await (await worker.fetch(new Request("https://test.invalid/api/articles?category=headlines"),env,{})).json();
 assert.equal(headlines.articles.length,5);
 const category=await (await worker.fetch(new Request("https://test.invalid/api/articles?category=ai"),env,{})).json();
 assert.equal(category.articles.length,1);
 const all=await (await worker.fetch(new Request("https://test.invalid/api/articles?category=all"),env,{})).json();
 assert.equal(all.articles.length,5);
});

test("digest font is 20px at normal weight across desktop and mobile, with balanced hierarchy", async () => {
 const env={NEWS:mockKV()};
 const now=new Date().toISOString();
 await env.NEWS.put("latest",JSON.stringify({
   generatedAt:now,feeds:[{id:"akiba-used",ok:true,count:0}],editorialRevision:4,
   articles:[{id:"typography",url:"https://example.org/type",title:"読みやすいニュース見出し",
     summary:"本文要約を20ピクセルで表示する",source:"TEST",category:"domestic",score:90,published:now}]
 }));
 const html=await (await worker.fetch(new Request("https://test.invalid/?category=domestic"),env,{})).text();
 assert.match(html,/\.excerpt\{font-size:20px;font-weight:400;/);
 assert.match(html,/\.article h3\{[^}]*font-size:26px;font-weight:700;/);
 assert.match(html,/\.hero \.summary\{font-size:21px;/);
 assert.match(html,/\.tabs a\{[^}]*font-size:16px;/);
 assert.match(html,/\.sidebar p\{font-size:16px;/);
 assert.match(html,/\.excerpt\{font-size:20px;line-height:1\.75\}/);
 assert.match(html,/本文要約を20ピクセルで表示する/);
});

test("dark/light toggle is served as a same-origin script with safe CSP", async()=>{
 const env={NEWS:mockKV()};
 const date=new Date().toISOString();
 await env.NEWS.put("latest",JSON.stringify({generatedAt:date,feeds:[{id:"akiba-used",ok:true,count:0}],articles:[],editorialRevision:4}));
 const htmlResponse=await worker.fetch(new Request("https://test.invalid/"),env,{});
 const html=await htmlResponse.text();
 assert.match(html,/id="theme-toggle"/);
 assert.match(html,/src="\/theme\.js"/);
 assert.match(html,/prefers-color-scheme:dark/);
 assert.match(html,/:root\[data-theme="dark"\]/);
 assert.match(html,/color-scheme:dark/);
 assert.match(htmlResponse.headers.get("Content-Security-Policy"),/script-src 'self'/);
 const js=await worker.fetch(new Request("https://test.invalid/theme.js"),env,{});
 assert.equal(js.status,200);
 assert.match(js.headers.get("Content-Type"),/application\/javascript/);
 const code=await js.text();
 assert.match(code,/localStorage\.setItem/);
 assert.match(code,/aria-pressed/);
 assert.match(code,/matchMedia/);
});
test("used and junk feed articles are filtered to relevant secondhand hardware",async()=>{
 const old=globalThis.fetch;
 const date=new Date().toUTCString();
 const usedFeed='<rss version="2.0"><channel><item><title>2000円のジャンクThinkPadをOpenWrtルーターに改造</title><link>https://example.test/used</link><description>UARTとGitHubのソースを使って再活用した記録</description><pubDate>'+date+'</pubDate></item><item><title>中古Latitudeが39800円のセール</title><link>https://example.test/new</link><description>中古ノートPCを大量入荷</description><pubDate>'+date+'</pubDate></item></channel></rss>';
 const generalFeed='<rss version="2.0"><channel><item><title>政府が新制度を発表</title><link>https://example.test/policy</link><description>国内の政策動向</description><pubDate>'+date+'</pubDate></item></channel></rss>';
 globalThis.fetch=async input=>new Response(/akiba-pc\.watch|b\.hatena\.ne\.jp|qiita\.com|burariweb\.info|hackaday\.com/.test(String(input))?usedFeed:generalFeed,{status:200});
 const env={NEWS:mockKV()};
 try{
   const response=await worker.fetch(new Request("https://test.invalid/?category=used"),env,{});
   const html=await response.text();
   assert.match(html,/ジャンク再活用/);
   assert.match(html,/2000円のジャンクThinkPadをOpenWrtルーターに改造/);
   assert.doesNotMatch(html,/中古Latitudeが39800円のセール/);
   assert.match(html,/X：ジャンク改造の最新投稿/);
   assert.match(html,/中古品の値下げ・大量入荷は原則除外/);
   const data=await (await worker.fetch(new Request("https://test.invalid/api/articles?category=used"),env,{})).json();
   assert.equal(data.articles.length,1);
   assert.equal(data.articles[0].category,"used");
   const status=await (await worker.fetch(new Request("https://test.invalid/api/status"),env,{})).json();
   assert.equal(status.feeds.filter(s=>s.id==="akiba-used")[0].ok,true);
   assert.ok(status.categories.some(c=>c.id==="used"));
 }finally{globalThis.fetch=old}
});

test("article list stays single-column on desktop and mobile",async()=>{
 const env={NEWS:mockKV()}, timestamp=new Date().toISOString();
 await env.NEWS.put("latest",JSON.stringify({generatedAt:timestamp,feeds:[{id:"akiba-used",ok:true,count:0}],editorialRevision:4,articles:[
 {id:"a",url:"https://example.org/a",title:"一つ目の記事",summary:"読みやすい本文",source:"TEST",category:"domestic",score:90,published:timestamp},
 {id:"b",url:"https://example.org/b",title:"二つ目の記事",summary:"縦に連続する本文",source:"TEST",category:"domestic",score:85,published:timestamp}
 ]}));
 const html=await (await worker.fetch(new Request("https://test.invalid/?category=domestic"),env,{})).text();
 assert.match(html,/\.articles\{display:grid;grid-template-columns:minmax\(0,1fr\)\}/);
 assert.doesNotMatch(html,/\.articles\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.match(html,/\.excerpt\{font-size:20px;font-weight:400;/);
 assert.ok(html.indexOf("一つ目の記事") < html.indexOf("二つ目の記事"));
 assert.equal((html.match(/class="article"/g)||[]).length,2);
});

test("typography retains hierarchy: bold headlines and regular-weight excerpts", async()=>{
 const env={NEWS:mockKV()};
 const now=new Date().toISOString();
 await env.NEWS.put("latest",JSON.stringify({generatedAt:now,feeds:[{id:"akiba-used",ok:true,count:0}],editorialRevision:4,articles:[{
 id:"weight",url:"https://example.org/weight",title:"見出しと本文のウェイト比較",
 summary:"大きな本文は標準ウェイトで読みやすく",category:"domestic",source:"TEST",score:88,published:now
 }]}));
 const html=await (await worker.fetch(new Request("https://test.invalid/?category=domestic"),env,{})).text();
 assert.match(html,/\.article h3\{[^}]*font-size:26px;font-weight:700/);
 assert.match(html,/\.excerpt\{font-size:20px;font-weight:400/);
 assert.match(html,/\.excerpt\{[^}]*-webkit-line-clamp:5/);
 assert.match(html,/\.articles\{display:grid;grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(html,/@media\(max-width:560px\)\{[^}]*\}/);
 assert.match(html,/\.excerpt\{font-size:20px;line-height:1\.75\}/);
 assert.match(html,/:root\[data-theme="dark"\]/);
});


test("repurposing editorial refilters stale used listings on edition upgrade",async()=>{
 const oldFetch=globalThis.fetch;
 const env={NEWS:mockKV()};
 const date=new Date().toUTCString();
 const now=new Date().toISOString();
 const prior=[
  ["sale","中古Latitude 5320が39,800円、中古PCセール","中古PC大量入荷"],
  ["expensive","2万9800円で買ったジャンクPCをLinux化","手順を公開"],
  ["nasne","古いnasneをハックしてDebian化、新しい録画機に再利用","GitHubソースでの改造手順を公開"],
  ["tiny","2000円ジャンクルーターをOpenWrt化して再利用","UARTの修復記録"],
  ["ws","ジャンクワークステーション T3610を修理して復活","Linuxサーバーに再利用"]
 ].map(([id,title,summary])=>({id,url:"https://example.net/"+id,title,summary,source:"TEST",
 sourceId:"akiba-used",category:"used",priority:8,score:90,published:now}));
 await env.NEWS.put("latest",JSON.stringify({
  articles:prior,generatedAt:now,feeds:[{id:"akiba-used",name:"TEST",ok:true,count:5}],
  editorialRevision:3
 }));
 const simpleFeed='<rss version="2.0"><channel><item><title>国内のニュース速報</title><link>https://example.org/general</link><description>国内の現況</description><pubDate>'+date+'</pubDate></item></channel></rss>';
 globalThis.fetch=async()=>new Response(simpleFeed,{status:200});
 try{
  const html=await (await worker.fetch(new Request("https://test.invalid/?category=used"),env,{})).text();
  assert.match(html,/ジャンク再活用/);
  assert.match(html,/nasneをハック/);
  assert.match(html,/OpenWrt化/);
  assert.match(html,/T3610を修理/);
  assert.doesNotMatch(html,/39,800円、中古PCセール/);
  assert.doesNotMatch(html,/2万9800円で買った/);
  assert.match(html,/X：OpenWrt改造の最新投稿/);
  const listed=await (await worker.fetch(new Request("https://test.invalid/api/articles?category=used"),env,{})).json();
  assert.equal(listed.articles.length,3);
  const status=await (await worker.fetch(new Request("https://test.invalid/api/status"),env,{})).json();
  assert.ok(status.categories.some(c=>c.id==="used"&&c.label==="ジャンク再活用"));
 }finally{globalThis.fetch=oldFetch}
});

test("production compatibility keeps old healthz and index.html endpoints", async()=>{
 const env={NEWS:mockKV()},now=new Date().toISOString();
 await env.NEWS.put("latest",JSON.stringify({generatedAt:now,feeds:[{id:"akiba-used",ok:true,count:0}],articles:[],editorialRevision:4}));
 const legacy=await worker.fetch(new Request("https://daily.karin-lab.com/healthz"),env,{});
 assert.equal(legacy.status,200);
 assert.equal(await legacy.text(),"ok");
 const index=await worker.fetch(new Request("https://daily.karin-lab.com/index.html"),env,{});
 assert.equal(index.status,200);
 assert.match(await index.text(),/<title>ヘッドライン \| Karin Daily<\/title>/);
 const rss=await (await worker.fetch(new Request("https://daily.karin-lab.com/rss.xml"),env,{})).text();
 assert.match(rss,/<title>Karin Daily<\/title>/);
 assert.match(rss,/<link>https:\/\/daily\.karin-lab\.com\//);
});


test("open tabs detect a newer digest while preserving the reader's position",async()=>{
 const env={NEWS:mockKV()},timestamp=new Date().toISOString();
 await env.NEWS.put("latest",JSON.stringify({
  generatedAt:timestamp,feeds:[{id:"akiba-used",ok:true,count:0}],editorialRevision:4,articles:[]
 }));
 const html=await (await worker.fetch(new Request("https://test.invalid/"),env,{})).text();
 assert.match(html,/name="karin-daily-generated-at"/);
 assert.match(html,/src="\/updates\.js"/);
 const js=await worker.fetch(new Request("https://test.invalid/updates.js"),env,{});
 assert.equal(js.status,200);
 const text=await js.text();
 assert.match(text,/visibilitychange/);
 assert.match(text,/window\.location\.reload/);
 assert.match(text,/newAt>loadedAt/);
 assert.match(text,/window\.scrollY<=140/);
 assert.match(text,/setInterval\(check,5\*60\*1000\)/);
 const status=await worker.fetch(new Request("https://test.invalid/api/status"),env,{});
 assert.equal(status.headers.get("Cache-Control"),"no-store");
});
test("news edition promotes today's stories over stale high-score headlines",async()=>{
 const env={NEWS:mockKV()},now=Date.now();
 const articles=[
  {id:"old",url:"https://example.org/old",title:"一昨日の高得点ニュース",summary:"古い記事",source:"TEST",category:"domestic",score:99,published:new Date(now-36*3600000).toISOString()},
  {id:"new",url:"https://example.org/new",title:"今朝の新しいニュース",summary:"新しい記事",source:"TEST",category:"domestic",score:88,published:new Date(now-1*3600000).toISOString()}
 ];
 await env.NEWS.put("latest",JSON.stringify({generatedAt:new Date(now).toISOString(),feeds:[{id:"akiba-used",ok:true,count:0}],editorialRevision:4,articles}));
 const html=await (await worker.fetch(new Request("https://test.invalid/"),env,{})).text();
 assert.match(html,/<h1><a href="https:\/\/example\.org\/new"[^>]*>今朝の新しいニュース<\/a><\/h1>/);
 const digest=await (await worker.fetch(new Request("https://test.invalid/api/articles?category=headlines"),env,{})).json();
 assert.equal(digest.articles[0].id,"new");
 const category=await (await worker.fetch(new Request("https://test.invalid/api/articles?category=domestic"),env,{})).json();
 assert.equal(category.articles[0].id,"new");
});


test("homicide and road/rail collisions are hidden in all views while safety technology stays",async()=>{
 const env={NEWS:mockKV()},now=new Date().toISOString();
 const cases=[
  ["murder","東京で殺人事件 容疑者を逮捕","事件の続報",true],
  ["stabbing","男性が刃物で刺され死亡","殺害された可能性",true],
  ["suspect","事件の容疑者が新たな供述","殺人事件を捜査",true],
  ["hitrun","別府ひき逃げ事件で新チラシ 八田容疑者の初公開写真も","追跡捜査",true],
  ["car","乗用車が歩行者をはね死亡","事故の詳細",true],
  ["train","スペイン鉄道事故 指令センターが速度制限伝えず運転再開か","列車が追突",true],
  ["safety","交通事故防止AIを開発","技術で事故のリスクを減らす",false],
  ["selfdrive","自動運転の衝突回避技術を公開","新技術",false],
  ["policy","道路交通法の改正が成立","交通政策",false],
  ["factory","水道管工事現場で土砂に埋まり2人死亡","工事現場の事故",false],
  ["fukushima","原発事故後の漁業自粛区域を縮小","漁業政策",false],
  ["earthquake","千葉で地震 強い揺れを観測","防災情報",false]
 ].map(([id,title,summary,blocked])=>({id,url:"https://example.org/"+id,title,summary,blocked,published:now,category:"domestic",source:"TEST",score:77,priority:7}));
 const persisted=cases.map(({blocked,...a})=>a);
 await env.NEWS.put("latest",JSON.stringify({generatedAt:now,articles:persisted,feeds:[{id:"akiba-used",ok:true,count:0}],editorialRevision:4}));
 const visible=cases.filter(a=>!a.blocked);
 const html=await (await worker.fetch(new Request("https://test.invalid/"),env,{})).text();
 const domestic=await (await worker.fetch(new Request("https://test.invalid/?category=domestic"),env,{})).text();
 const all=(await (await worker.fetch(new Request("https://test.invalid/api/articles?category=all"),env,{})).json()).articles;
 const section=(await (await worker.fetch(new Request("https://test.invalid/api/articles?category=domestic"),env,{})).json()).articles;
 const headlines=(await (await worker.fetch(new Request("https://test.invalid/api/articles?category=headlines"),env,{})).json()).articles;
 const rss=await (await worker.fetch(new Request("https://test.invalid/rss.xml"),env,{})).text();
 const status=await (await worker.fetch(new Request("https://test.invalid/api/status"),env,{})).json();
 for(const a of cases.filter(a=>a.blocked)) {
  for(const view of [html,domestic,rss])assert.doesNotMatch(view,new RegExp(a.title));
  for(const list of [all,section,headlines])assert.ok(!list.some(x=>x.id===a.id),a.id);
 }
 for(const a of visible)assert.ok(all.some(x=>x.id===a.id),a.id);
 assert.equal(status.stored,visible.length);
});
test("scheduled ingestion never saves homicide and traffic accident items",async()=>{
 const old=globalThis.fetch,env={NEWS:mockKV()},date=new Date().toUTCString();
 const feed='<rss><channel>'
 +'<item><title>新たな殺人事件の捜査</title><link>https://example.org/murder</link><description>殺人</description><pubDate>'+date+'</pubDate></item>'
 +'<item><title>交通事故で乗用車が衝突</title><link>https://example.org/crash</link><description>事故</description><pubDate>'+date+'</pubDate></item>'
 +'<item><title>交通安全のための自動運転技術を開発</title><link>https://example.org/safety</link><description>研究成果</description><pubDate>'+date+'</pubDate></item>'
 +'</channel></rss>';
 globalThis.fetch=async()=>new Response(feed,{status:200});
 try{
  const pending=[];
  await worker.scheduled({},env,{waitUntil:p=>pending.push(p)});
  await Promise.all(pending);
  const saved=await env.NEWS.get("latest",{type:"json"});
  assert.equal(saved.articles.length,1);
  assert.match(saved.articles[0].title,/自動運転技術/);
  assert.ok(saved.feeds.every(f=>f.ok));
  assert.ok(saved.feeds.filter(f=>f.ok&&f.count===1).length>=10); // maker feeds correctly reject unrelated safety headlines
  assert.ok(saved.feeds.every(f=>f.count===0||f.count===1));
 }finally{globalThis.fetch=old}
});
