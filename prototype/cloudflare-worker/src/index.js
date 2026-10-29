/**
 * Karin Daily Next (prototype)
 * Independent Cloudflare Worker + KV implementation.
 * Editorial inspiration: AI-gaiden (MIT), AI Daily Pulse (MIT).
 * No external HTML scraping, no credentials in source, no old-site mutations.
 */
const SOURCES = [
  {id:"nhk-top",name:"NHK 主要",url:"https://www.nhk.or.jp/rss/news/cat0.xml",category:"domestic",priority:9},
  {id:"nhk-economy",name:"NHK 経済",url:"https://www.nhk.or.jp/rss/news/cat5.xml",category:"economy",priority:9},
  {id:"nhk-science",name:"NHK 科学・医療",url:"https://www.nhk.or.jp/rss/news/cat3.xml",category:"science",priority:8},
  {id:"itmedia-domestic",name:"ITmedia NEWS 国内",url:"https://rss.itmedia.co.jp/rss/2.0/news_domestic.xml",category:"technology",priority:7},
  {id:"itmedia-ai",name:"ITmedia AI＋",url:"https://rss.itmedia.co.jp/rss/2.0/aiplus.xml",category:"ai",priority:8},
  {id:"impress",name:"Impress Watch",url:"https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf",category:"domestic",priority:6},
  {id:"pc-watch",name:"PC Watch",url:"https://pc.watch.impress.co.jp/data/rss/1.0/pcw/feed.rdf",category:"hardware",priority:8},
  {id:"internet-watch",name:"INTERNET Watch",url:"https://internet.watch.impress.co.jp/data/rss/1.0/iw/feed.rdf",category:"infrastructure",priority:8},
  {id:"publickey",name:"Publickey",url:"https://www.publickey1.jp/atom.xml",category:"infrastructure",priority:7},
  {id:"digital-agency",name:"デジタル庁",url:"https://www.digital.go.jp/rss/news.xml",category:"domestic",priority:6},
  {id:"gigazine",name:"GIGAZINE",url:"https://gigazine.net/news/rss_2.0/",category:"technology",priority:6},
  {id:"akiba-used",name:"AKIBA PC Hotline!",url:"https://akiba-pc.watch.impress.co.jp/data/rss/1.0/ah/feed.rdf",category:"used",priority:9},
  {id:"hermitage-used",name:"エルミタージュ秋葉原",url:"https://www.gdm.or.jp/feed",category:"used",priority:8},
  {id:"google-junk",name:"Google ニュース / ジャンクPC",url:"https://news.google.com/rss/search?q=%E3%82%B8%E3%83%A3%E3%83%B3%E3%82%AFPC%20when%3A7d&hl=ja&gl=JP&ceid=JP%3Aja",category:"used",priority:6},
  {id:"google-workstation",name:"Google ニュース / 中古WS",url:"https://news.google.com/rss/search?q=%E4%B8%AD%E5%8F%A4%20%E3%83%AF%E3%83%BC%E3%82%AF%E3%82%B9%E3%83%86%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3%20when%3A7d&hl=ja&gl=JP&ceid=JP%3Aja",category:"used",priority:7},
];
const CATS = [
  {id:"headlines",label:"ヘッドライン"},{id:"domestic",label:"国内・社会"},{id:"world",label:"国際"},{id:"economy",label:"経済"},
  {id:"ai",label:"AI・生成AI"},{id:"technology",label:"テクノロジー"},
  {id:"infrastructure",label:"通信・開発"},{id:"hardware",label:"PC・機材"},{id:"used",label:"ジャンク・中古"},{id:"science",label:"科学・医療"}
];
const PROFILE = {
  domestic:["政府","国会","選挙","政策","社会","東京","災害","地震","防災","行政"],
  economy:["日銀","為替","経済","賃金","物価","株","企業","エネルギー"],
  ai:["生成AI","ChatGPT","GPT","Gemini","Claude","LLM","AI","エージェント","OpenAI"],
  infrastructure:["OpenWrt","Linux","Debian","Cloudflare","GitHub","Wi-Fi","5G","ルーター","OSS","ネットワーク","API","ソフトバンク","MT6990"],
  hardware:["CPU","GPU","RTX","PC","SSD","中古","ワークステーション","ARM","半導体","Intel","AMD"],
  science:["創薬","薬剤","生命科学","研究","大学","半導体","太陽光","電力","医療","サイエンス"]
};
const FOREIGN_HEADLINE = /(?:FRB|アメリカ|米国|イスラエル|スペイン|ウクライナ|ロシア|欧州|韓国|中国|台湾|トランプ|EU|NATO)/i;
const LOCAL_ALERT = /(?:地震|震度|津波|警報|避難|土砂災害|台風|大雨|大規模停電)/;
const HIGH_IMPACT = ["速報","発表","決定","成立","大規模","過去最大","初めて","新制度","改正","地震","災害","被害","死亡","停止","障害","流出","値上げ","利下げ","利上げ","新型","公開","発売"];
const USED_ITEM = /(?:中古|ジャンク|リユース|リファービッシュ|訳あり|難あり|現状品|動作未確認|整備済み|再生品|払い下げ|ハードオフ|アウトレット)/i;
const USED_HARDWARE = /(?:PC|パソコン|ワークステーション|サーバー|ノート|デスクトップ|SSD|HDD|GPU|CPU|メモリ|マザーボード|ThinkPad|Latitude|Precision|EliteDesk|ProDesk|Z[468]20|MacBook|スマホ|タブレット|ジャンク)/i;
const TRACKING = /^(utm_|fbclid$|gclid$|yclid$|mc_[ce]id$|ref$)/i;
const USER_AGENT = "KarinDailyPrototype/0.1 (RSS reader; contact via github.com/Karin-Laboratory/karin-daily)";
const nowIso = () => new Date().toISOString();
function h(s) { return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function x(s) {return h(s);}
function de(s) {
  return String(s||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
  .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,v)=>{const n=v[0].toLowerCase()==="x"?parseInt(v.slice(1),16):parseInt(v,10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):"";})
  .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi,(_,v)=>({"amp":"&","lt":"<","gt":">","quot":'"',"apos":"'","nbsp":" ","#39":"'"}[v.toLowerCase()]||""));
}
function clean(s) {return de(String(s||"").replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim();}
function tag(block,name) {
  const re=new RegExp("<(?:[\\w.-]+:)?"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?"+name+"\\s*>","i");
  return (block.match(re)||[])[1]||"";
}
function linkFrom(block) {
  const link=tag(block,"link");
  if(link) return clean(link);
  const atom=block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return atom?de(atom[1]):"";
}
function validHttp(raw) {try{const u=new URL(raw);return ["http:","https:"].includes(u.protocol)&&!!u.hostname?u.href:"";}catch{return "";}}
function canon(raw) {try{const u=new URL(raw);u.hash="";for(const k of [...u.searchParams.keys()])if(TRACKING.test(k))u.searchParams.delete(k);u.hostname=u.hostname.toLowerCase();return u.href.replace(/\/$/,"");}catch{return raw;}}
function shortTitle(s){return clean(s).replace(/\s*[-｜|]\s*(NHK|ITmedia|PC Watch|INTERNET Watch).*$/i,"").slice(0,180);}
function parseXml(xml,src) {
  const blocks=[...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].slice(0,24);
  return blocks.map(m=>{
    const b=m[2], url=validHttp(linkFrom(b));
    const title=shortTitle(tag(b,"title"));
    const description=clean(tag(b,"description")||tag(b,"summary")||tag(b,"encoded")||tag(b,"content")).slice(0,360);
    const rawDate=clean(tag(b,"pubDate")||tag(b,"published")||tag(b,"updated")||tag(b,"date"));
    const date=new Date(rawDate);
    if(!url||!title) return null;
    return {id:canon(url),url,title,summary:description,source:src.name,sourceId:src.id,category:src.id==="nhk-top"&&FOREIGN_HEADLINE.test(title)?"world":src.category,priority:src.priority,
      published:!Number.isNaN(date.getTime())?date.toISOString():nowIso()};
  }).filter(Boolean);
}
function similarity(a,b){
 const t=s=>Array.from(String(s).toLowerCase().replace(/[\s\p{P}\p{S}]/gu,"")).slice(0,90);
 const grams=s=>{const c=t(s),out=new Set();for(let i=0;i<c.length-1;i++)out.add(c[i]+c[i+1]);return out;};
 const A=grams(a),B=grams(b);if(!A.size||!B.size)return 0;
 let common=0;for(const k of A)if(B.has(k))common++;
 return common/(A.size+B.size-common);
}
function score(item,dt){
 const text=item.title+" "+item.summary, age=Math.max(0,(dt-new Date(item.published).getTime())/3600000);
 const recency=Math.max(0,Math.round(16-age/5));
 const impact=HIGH_IMPACT.reduce((n,k)=>n+(text.includes(k)?4:0),0);
 const interest=Object.values(PROFILE).flat().reduce((n,k)=>n+(text.toLowerCase().includes(k.toLowerCase())?2:0),0);
 const base= item.category==="domestic"||item.category==="economy"?48:42;
 const safety=LOCAL_ALERT.test(item.title)?22:0;
 const domesticBonus=item.category==="domestic"&&/(?:国内|日本|政府|東京|千葉|大阪|県|市|首相)/.test(item.title)?7:0;
 const score=Math.max(0,Math.min(99,base+recency+Math.min(18,impact)+Math.min(19,interest)+item.priority+safety+domesticBonus));
 return {score,reason: impact>=8?"社会的な重要性":interest>=6?"関心分野と高い一致":age<=12?"新着ニュース":"注目記事"};
}
function editorial(raw,previous) {
 const dt=Date.now();
 const combined=[...raw,...(previous?.articles||[])].filter(a=>a.url&&a.title&&Date.parse(a.published)>dt-8*86400000);
 const byUrl=new Map();
 for(const a of combined){const key=canon(a.url);if(!byUrl.has(key)||a.summary.length>(byUrl.get(key).summary||"").length)byUrl.set(key,a);}
 const scored=[...byUrl.values()].map(a=>({...a,...score(a,dt)})).sort((a,b)=>b.score-a.score || Date.parse(b.published)-Date.parse(a.published));
 const selected=[];
 for(const a of scored) {
   const duplicate=selected.find(q=>similarity(q.title,a.title)>=0.83);
   if(duplicate) {duplicate.relatedSources=[...new Set([...(duplicate.relatedSources||[duplicate.source]),a.source])];continue;}
   selected.push({...a,relatedSources:[a.source]});
 }
 // Daily Pulse-inspired per-category quotas; no category may overwhelm front page.
 const cap={domestic:32,world:20,economy:20,ai:20,technology:20,infrastructure:20,hardware:20,used:32,science:20};
 const count={};const balanced=[];
 for(const a of selected){count[a.category]=(count[a.category]||0)+1;if(count[a.category]<=(cap[a.category]||15))balanced.push(a);}
 // Edition mix: protect public-interest coverage from personalized tech overfitting.
 const group=a=>["domestic","economy","world"].includes(a.category)?"general":a.category==="science"?"science":"tech";
 const groups={general:[],tech:[],science:[]};
 for(const a of balanced)groups[group(a)].push(a);
 const front=[];
 const quotas={general:25,tech:15,science:10};
 for(const g of ["general","tech","science"])front.push(...groups[g].splice(0,quotas[g]));
 front.sort((a,b)=>b.score-a.score);
 return front.concat(Object.values(groups).flat().sort((a,b)=>b.score-a.score)).slice(0,150);
}
// The front page is a curated edition, not simply every article in score order.
// Reserve space for civic affairs, the economy and the reader's specialist interests.
function selectHeadlines(articles, limit=18) {
 const sections=[
   {categories:["domestic"],quota:5},
   {categories:["economy"],quota:3},
   {categories:["world"],quota:2},
   {categories:["ai","technology","infrastructure","hardware","used"],quota:6},
   {categories:["science"],quota:2}
 ];
 const chosen=[], seen=new Set();
 for(const section of sections){
   let used=0;
   for(const a of articles){
     const key=a.id||a.url;
     if(used>=section.quota)break;
     if(section.categories.includes(a.category)&&!seen.has(key)){
       chosen.push(a);seen.add(key);used++;
     }
   }
 }
 for(const a of articles){
   if(chosen.length>=limit)break;
   const key=a.id||a.url;
   if(!seen.has(key)){chosen.push(a);seen.add(key);}
 }
 return chosen.sort((a,b)=>(b.score||0)-(a.score||0) || Date.parse(b.published)-Date.parse(a.published)).slice(0,limit);
}
function visibleArticles(articles,category) {
 const fresh=articles.filter(a=>Date.now()-Date.parse(a.published)<72*3600000);
 if(category==="headlines")return selectHeadlines(fresh);
 return fresh.filter(a=>a.category===category).slice(0,55);
}
async function fetchOne(src) {
 const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),6500);
 try{
   const res=await fetch(src.url,{headers:{"Accept":"application/rss+xml,application/atom+xml,application/xml,text/xml,*/*","User-Agent":USER_AGENT},signal:ctrl.signal});
   if(!res.ok)throw Error("HTTP "+res.status);
   const body=await res.text();
   if(body.length>2_000_000)throw Error("feed too large");
   const parsed=parseXml(body,src);
   if(!parsed.length)throw Error("no parseable items");
   // Market and hardware publications also cover new products. Keep this
   // section strictly for used, refurbished, outlet and junk equipment.
   const items=src.category==="used"?
     parsed.filter(a=>USED_ITEM.test(a.title+" "+a.summary)&&USED_HARDWARE.test(a.title+" "+a.summary)):
     parsed;
   return {id:src.id,name:src.name,items,count:items.length,scanned:parsed.length,ok:true};
 }catch(e){return{id:src.id,name:src.name,items:[],count:0,ok:false,error:String(e).slice(0,110)};}
 finally{clearTimeout(timer);}
}
async function refresh(env) {
 const old=await env.NEWS.get("latest",{type:"json"});
 const result=await Promise.all(SOURCES.map(fetchOne));
 const fetched=result.flatMap(r=>r.items);
 if(fetched.length===0) return {ok:false,count:old?.articles?.length||0,error:"all feeds failed",feeds:result.map(({items,...rest})=>rest)};
 const articles=editorial(fetched,old), digest={generatedAt:nowIso(),articles,feeds:result.map(({items,...rest})=>rest),version:"0.1.0"};
 await env.NEWS.put("latest",JSON.stringify(digest));
 return {ok:true,count:articles.length,inserted:fetched.length,failures:result.filter(r=>!r.ok).map(r=>r.id)};
}
async function load(env) {return await env.NEWS.get("latest",{type:"json"});}
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*","Cache-Control":"public, max-age=120","X-Content-Type-Options":"nosniff"}});
const dateJst=t=>new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(t));
const longJst=t=>new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"long",day:"numeric",weekday:"long",hour:"2-digit",minute:"2-digit"}).format(new Date(t));
function card(a,lead=false) {
 const cat=CATS.find(c=>c.id===a.category)?.label||"ニュース";
 return '<article class="article'+(lead?' lead':'')+'"><div class="metadata"><span class="tag">'+h(cat)+'</span><time>'+h(dateJst(a.published))+'</time><span class="score">'+h(a.score)+' / 99</span></div>'+
 '<h3><a href="'+h(a.url)+'" target="_blank" rel="noopener noreferrer">'+h(a.title)+'</a></h3>'+
 (a.summary?'<p class="excerpt">'+h(a.summary)+'</p>':'')+
 '<div class="foot"><span>'+h(a.source)+(a.relatedSources?.length>1?" ほか"+(a.relatedSources.length-1)+"媒体":"")+'</span><span>'+h(a.reason)+'</span></div></article>';
}
const CSS=String.raw`
/* Karin Daily typography: comfortable reading on desktop and mobile.
   Digest excerpt scale: 12px -> 14px -> 16px (two steps). */
:root{
  font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;
  font-size:16px;line-height:1.65;
  background:#f7f5ef;color:#1c2a2d;font-synthesis:none;
}
*{box-sizing:border-box}
body{margin:0}
a{color:inherit;text-decoration:none}
a:hover{color:#147064}
header{border-bottom:1px solid #cbd2ca;background:#f7f5ef}
.shell{width:min(1200px,calc(100% - 42px));margin:auto}
.micro{background:#163e3c;color:#eaf4ea;padding:8px 0;font-size:12px;letter-spacing:.07em}
.micro .shell{display:flex;justify-content:space-between;gap:10px}
.masthead{padding:29px 0 22px;display:flex;align-items:end;justify-content:space-between;gap:20px}
.eyebrow{font-size:12px;letter-spacing:.2em;color:#247d6b;font-weight:800}
.logo{font-family:Georgia,"Yu Mincho","Hiragino Mincho ProN",serif;letter-spacing:-.065em;font-weight:800;font-size:clamp(40px,7vw,76px);line-height:1.1}
.logo span{color:#c06d42}
.desc{font-size:15px;line-height:1.7;color:#586c67;margin-top:11px}
.bulletin{text-align:right;font-size:13px;color:#55726e;line-height:1.85}
.bulletin strong{font-size:14px;color:#1c5350}
.tabs{border-top:1px solid #cbd2ca;display:flex;align-items:center;gap:6px;overflow-x:auto;white-space:nowrap;padding:11px 0}
.tabs a{display:inline-flex;align-items:center;gap:7px;font-size:14px;font-weight:700;border-radius:22px;padding:10px 14px;color:#475a58;flex-shrink:0}
.tabs a.active,.tabs a:hover{background:#194945;color:#fff}
.tabs a.active:first-child{background:#b96743}
.tabs .tab-count{font-size:11px;opacity:.72}
.tabs a.active .tab-count{opacity:.95}
.hero{display:grid;grid-template-columns:1.7fr 1fr;gap:34px;padding:35px 0;border-bottom:1px solid #c9d0c9}
.kicker{color:#bb6544;font-size:12px;letter-spacing:.16em;font-weight:900}
.hero h1{font-family:Georgia,"Yu Mincho",serif;font-size:clamp(28px,3.4vw,44px);line-height:1.45;letter-spacing:-.03em;margin:14px 0 14px;overflow-wrap:anywhere}
.hero .summary{font-size:17px;color:#526560;line-height:1.85;max-width:64ch}
.hero-box{background:#e5eee8;border:1px solid #c8dcd0;border-radius:8px;padding:23px}
.hero-box .count{font-size:48px;color:#194945;font-family:Georgia,serif;line-height:1.25;margin:8px 0}
.hero-box p{font-size:14px;color:#4f6e63;line-height:1.85}
.main{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:38px;margin-top:30px}
.section-heading{display:flex;justify-content:space-between;align-items:end;gap:12px;border-bottom:2px solid #244b46;padding-bottom:12px;margin-bottom:10px}
.section-heading h2{font-size:23px;line-height:1.4;margin:0;font-family:Georgia,"Yu Mincho",serif}
.section-heading span{font-size:12px;color:#64766e;white-space:nowrap}
.articles{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:34px}
.article{padding:24px 0 30px;border-bottom:1px solid #d8dcd5;min-width:0}
.article.lead{grid-column:span 2}
.metadata{display:flex;flex-wrap:wrap;gap:7px 12px;align-items:center;color:#6c7d76;font-size:12px;line-height:1.55}
.tag{font-size:11px;background:#dce7dd;color:#265b4c;padding:4px 8px;border-radius:3px;font-weight:800}
.score{margin-left:auto;color:#a75c3e;font-weight:700}
.article h3{font-family:Georgia,"Yu Mincho",serif;line-height:1.55;font-size:21px;margin:13px 0 12px;overflow-wrap:anywhere}
.article.lead h3{font-size:27px}
.excerpt{font-size:16px;color:#4d605a;line-height:1.85;margin:0 0 16px;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.foot{font-size:12px;line-height:1.6;display:flex;gap:10px;justify-content:space-between;color:#697e76;padding-top:8px;flex-wrap:wrap}
.sidebar{border-left:1px solid #d9dcd5;padding-left:25px}
.sidebar h3{font-family:Georgia,serif;font-size:18px;margin:9px 0 15px}
.source{font-size:14px;line-height:1.6;padding:10px 0;border-bottom:1px solid #e3e5de;display:flex;justify-content:space-between;gap:8px}
.source span:last-child{flex-shrink:0;color:#65786e}
.dot{width:7px;height:7px;border-radius:50%;background:#2e9b7f;display:inline-block;margin-right:8px}
.dot.bad{background:#c77963}
.sidebar p{font-size:14px;color:#647970;line-height:1.85}
footer{margin-top:65px;background:#183c39;color:#c9ded3;padding:30px 0;font-size:13px;line-height:1.85}
.empty{padding:70px 10px;text-align:center;color:#65736e;font-size:15px}
.loadMore{margin:25px 0 0;border:1px solid #b9c7ba;color:#235b50;background:transparent;border-radius:4px;padding:12px 22px;cursor:pointer;font-size:14px;font-weight:700}
.used-links{border:1px solid var(--rule);border-radius:9px;padding:17px 18px;margin:17px 0 9px;background:var(--panel)}
.used-links strong{display:block;font-size:16px;margin-bottom:7px;color:var(--ink)}
.used-links p{font-size:13px;line-height:1.75;color:var(--muted);margin:0 0 13px}
.used-links a{display:inline-block;font-size:14px;font-weight:650;margin:0 14px 9px 0;text-decoration:underline;text-underline-offset:3px;color:var(--accent)}
@media(max-width:830px){
  .hero,.main{grid-template-columns:1fr}
  .sidebar{border-left:none;padding:0;border-top:1px solid #ccc;margin-top:20px}
  .bulletin{display:none}
}
@media(max-width:560px){
  .shell{width:calc(100% - 28px)}
  .micro{font-size:11px}
  .logo{font-size:47px}
  .masthead{padding:23px 0}
  .hero{padding:23px 0;gap:20px}
  .hero h1{font-size:clamp(27px,7.5vw,36px)}
  .hero .summary{font-size:16px}
  .hero-box{padding:16px}
  .tabs a{font-size:14px;padding:10px 13px}
  .articles{grid-template-columns:minmax(0,1fr)}
  .article.lead{grid-column:auto}
  .article h3,.article.lead h3{font-size:21px}
  .excerpt{font-size:16px;line-height:1.85}
  .section-heading h2{font-size:21px}
}
`.trim();
function page(d,category) {
 const all=d?.articles||[], current=CATS.some(c=>c.id===category)?category:"headlines";
 const fresh=all.filter(a=>Date.now()-Date.parse(a.published)<72*3600000);
 const articles=visibleArticles(all,current);
 const isFront=current==="headlines";
 const lead=articles[0], updated=d?.generatedAt?longJst(d.generatedAt):"更新待ち";
 const selectedCategory=CATS.find(c=>c.id===current);
 const menu=CATS.map(c=>{
   const count=c.id==="headlines"?selectHeadlines(fresh).length:fresh.filter(a=>a.category===c.id).length;
   return '<a class="'+(c.id===current?'active':'')+'" href="'+(c.id==="headlines"?"/":"/?category="+encodeURIComponent(c.id))+'"'+(c.id===current?' aria-current="page"':'')+'>'+h(c.label)+'<span class="tab-count">'+h(count)+'</span></a>';
 }).join("");
 const feeds=d?.feeds||SOURCES.map(s=>({name:s.name,id:s.id,ok:false,count:0}));
 const sourceHtml=feeds.map(f=>'<div class="source"><span><i class="dot'+(f.ok?"":" bad")+'"></i>'+h(f.name)+'</span><span>'+h(f.ok?String(f.count)+"件":"要確認")+'</span></div>').join("");
 const featured=isFront&&lead?
   '<div><div class="kicker">TODAY’S TOP HEADLINE</div><h1><a href="'+h(lead.url)+'" target="_blank" rel="noopener noreferrer">'+h(lead.title)+'</a></h1><p class="summary">'+h(lead.summary||"元記事で詳しく読む")+'</p><div class="metadata">'+h(lead.source)+' · '+h(dateJst(lead.published))+' · '+h(lead.reason)+'</div></div>':
   '<div><div class="kicker">'+(isFront?"KARIN DAILY NEXT":"SECTION / CATEGORY")+'</div><h1>'+(isFront?'今日のニュースを、<br>自分の視点で。':h(selectedCategory.label))+'</h1><p class="summary">'+(isFront?"ニュースを収集中です。":"この分野の新着記事を、重要度と公開時刻を考慮して並べています。気になる見出しから元記事へどうぞ。")+'</p></div>';
 const visibleCards=isFront&&lead?articles.slice(1):articles;
 const usedLinks=current==="used"?
 '<div class="used-links" aria-label="中古・ジャンク情報の外部検索"><strong>販売情報・投稿を直接確認</strong><p>こちらは外部サービスへの検索リンクです。Xやフリマの投稿・出品はニュース記事として自動収集していません。</p><a href="https://x.com/search?q=%E3%82%B8%E3%83%A3%E3%83%B3%E3%82%AFPC&f=live" target="_blank" rel="noopener noreferrer">X：ジャンクPCの最新投稿 ↗</a><a href="https://x.com/search?q=%E4%B8%AD%E5%8F%A4PC&f=live" target="_blank" rel="noopener noreferrer">X：中古PCの最新投稿 ↗</a><a href="https://akiba-pc.watch.impress.co.jp/category/used/" target="_blank" rel="noopener noreferrer">AKIBA PC Hotline! 中古・リユース品 ↗</a><a href="https://www.gdm.or.jp/" target="_blank" rel="noopener noreferrer">エルミタージュ秋葉原 ↗</a></div>':"";
 const body=visibleCards.length?visibleCards.map(a=>card(a)).join(""):'<div class="empty">'+(isFront?"ほかのヘッドラインを収集中です。":"この分野に新着記事はありません。")+'</div>';
 return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>'+h(selectedCategory.label)+' | Karin Daily Next</title><meta name="description" content="国内ニュースを中心に、AI、OpenWrt、科学、PCの情報を一枚に編集。">'+
 '<meta name="color-scheme" content="light"><style>'+CSS+'</style></head><body>'+
 '<div class="micro"><div class="shell"><span>INDEPENDENT NEWS DIGEST · JAPAN</span><span>PROTOTYPE / 2026</span></div></div>'+
 '<header><div class="shell"><div class="masthead"><div><div class="eyebrow">THE PERSONAL INTELLIGENCE EDITION</div><div class="logo">Karin Daily<span>.</span></div><div class="desc">国内ニュースを中心に、今日の重要事項と関心分野をひとつに。</div></div><div class="bulletin"><strong>DAILY EDITION</strong><br>'+h(updated)+' 更新<br>自動収集 · 出典へのリンク</div></div><nav class="tabs" aria-label="ヘッドライン・分野別紙面">'+menu+'</nav></div></header>'+
 '<div class="shell"><section class="hero">'+featured+'<div class="hero-box"><div class="eyebrow">'+(isFront?"HEADLINE EDITION":"SECTION DIGEST")+'</div><div class="count">'+h(articles.length)+'</div><p>'+(isFront?"重要ニュースと関心分野をバランスよく選んだ、今日のヘッドライン。分野別の全記事は上のタブから読めます。":"この分野に掲載している、直近72時間の記事数。ほかの分野は上のタブから切り替えられます。")+'</p><p>新着取得：'+h(updated)+'</p></div></section>'+
 '<div class="main"><main><div class="section-heading"><h2>'+(isFront?"ヘッドライン一覧":h(selectedCategory.label)+" のニュース")+'</h2><span>'+h(articles.length)+' ARTICLES'+(isFront?" · 重要記事を厳選":"")+'</span></div>'+usedLinks+'<div class="articles">'+body+'</div></main>'+
 '<aside class="sidebar"><div class="eyebrow">NEWSROOM</div><h3>配信ソース</h3>'+sourceHtml+
 '<h3 style="margin-top:30px">編集ポリシー</h3><p>ヘッドラインは国内社会、経済、国際、IT、科学から横断的に選びます。各分野の全記事はタブで確認できます。</p><p>要約は配信元のRSS抜粋です。AIによる自動要約は未接続です。出典と公開時刻を確認してお読みください。</p><p><a href="/api/status">更新状態 API ↗</a><br><a href="/rss.xml">Karin Daily RSS ↗</a></p></aside></div></div>'+
 '<footer><div class="shell"><strong>Karin Daily Next</strong> · Experimental edition<br>自動収集された情報です。元記事の著作権は各媒体に帰属します。<br><a href="https://github.com/Karin-Laboratory/karin-daily/tree/prototype/cloudflare-worker">Source / GitHub ↗</a></div></footer></body></html>';
}
function rss(d) {
 const items=(d?.articles||[]).slice(0,50).map(a=>'<item><title>'+x(a.title)+'</title><link>'+x(a.url)+'</link><guid isPermaLink="false">'+x(a.id)+'</guid><pubDate>'+new Date(a.published).toUTCString()+'</pubDate><description>'+x(a.summary)+'</description></item>').join("");
 return '<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Karin Daily Next</title><description>日本のニュースと関心分野のダイジェスト</description><link>https://karin-daily-next.karin-laboratory.workers.dev/</link>'+items+'</channel></rss>';
}
export default {
 async fetch(request,env,ctx){
   const u=new URL(request.url);
   if(request.method!=="GET")return new Response("Method Not Allowed",{status:405});
   if(u.pathname==="/api/health")return json({ok:true,service:"karin-daily-next",version:"0.1.0"});
   let d=await load(env);
   if(!d){try{await refresh(env);d=await load(env);}catch(e){console.error("initial refresh",String(e));}}
   if(u.pathname==="/api/status")return json({generatedAt:d?.generatedAt||null,stored:d?.articles?.length||0,feeds:d?.feeds||[],categories:CATS,algorithm:"deterministic relevance + age + cross-source clustering; AI scoring not enabled"});
   if(u.pathname==="/api/articles"){const cat=u.searchParams.get("category")||"all", n=Math.max(1,Math.min(150,Number(u.searchParams.get("limit"))||50));const items=cat==="all"?(d?.articles||[]):visibleArticles(d?.articles||[],cat==="headlines"?"headlines":cat);return json({generatedAt:d?.generatedAt||null,articles:items.slice(0,n)});}
   if(u.pathname==="/rss.xml")return new Response(rss(d),{headers:{"Content-Type":"application/rss+xml; charset=utf-8","Cache-Control":"public,max-age=300"}});
   if(u.pathname!=="/")return new Response("Not found",{status:404});
   return new Response(page(d,u.searchParams.get("category")||"headlines"),{headers:{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'","X-Content-Type-Options":"nosniff","Cache-Control":"public,max-age=120"}});
 },
 async scheduled(event,env,ctx){ctx.waitUntil(refresh(env).then(r=>console.log("Karin Daily scheduled refresh",JSON.stringify(r))));}
};
