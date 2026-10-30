/**
 * Karin Daily (Cloudflare Worker edition)
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
  {id:"akiba-used",name:"AKIBA PC Hotline! / ジャンク探索",url:"https://akiba-pc.watch.impress.co.jp/data/rss/1.0/ah/feed.rdf",category:"used",priority:5},
  {id:"hatena-junk",name:"はてなブックマーク / ジャンク",url:"https://b.hatena.ne.jp/search/tag?q=%E3%82%B8%E3%83%A3%E3%83%B3%E3%82%AF&mode=rss",category:"used",priority:9},
  {id:"hatena-mod",name:"はてなブックマーク / 改造",url:"https://b.hatena.ne.jp/search/tag?q=%E6%94%B9%E9%80%A0&mode=rss",category:"used",priority:8},
  {id:"qiita-junk",name:"Qiita / ジャンク技術記録",url:"https://qiita.com/tags/%E3%82%B8%E3%83%A3%E3%83%B3%E3%82%AF/feed",category:"used",priority:8},
  {id:"burari-hack",name:"ぶらり＠web / 電子工作",url:"https://burariweb.info/feed",category:"used",priority:8},
  {id:"hackaday-hardware",name:"Hackaday / Hardware Hacks",url:"https://hackaday.com/feed/",category:"used",priority:7},
];
const CATS = [
  {id:"headlines",label:"ヘッドライン"},{id:"domestic",label:"国内・社会"},{id:"world",label:"国際"},{id:"economy",label:"経済"},
  {id:"ai",label:"AI・生成AI"},{id:"technology",label:"テクノロジー"},
  {id:"infrastructure",label:"通信・開発"},{id:"hardware",label:"PC・機材"},{id:"used",label:"ジャンク再活用"},{id:"science",label:"科学・医療"}
];
const PROFILE = {
  domestic:["政府","国会","選挙","政策","社会","東京","災害","地震","防災","行政"],
  economy:["日銀","為替","経済","賃金","物価","株","企業","エネルギー"],
  ai:["生成AI","ChatGPT","GPT","Gemini","Claude","LLM","AI","エージェント","OpenAI"],
  infrastructure:["OpenWrt","Linux","Debian","Cloudflare","GitHub","Wi-Fi","5G","ルーター","OSS","ネットワーク","API","ソフトバンク","MT6990"],
  hardware:["CPU","GPU","RTX","PC","SSD","中古","ワークステーション","ARM","半導体","Intel","AMD"],
  used:["OpenWrt","Debian化","Linux化","UART","JTAG","root化","リバースエンジニアリング","ファームウェア","改造","再利用","再活用","転用","hack","repurpose","restore","復活","ジャンク"],
  science:["創薬","薬剤","生命科学","研究","大学","半導体","太陽光","電力","医療","サイエンス"]
};
const FOREIGN_HEADLINE = /(?:FRB|アメリカ|米国|イスラエル|スペイン|ウクライナ|ロシア|欧州|韓国|中国|台湾|トランプ|EU|NATO)/i;
const LOCAL_ALERT = /(?:地震|震度|津波|警報|避難|土砂災害|台風|大雨|大規模停電)/;
const HIGH_IMPACT = ["速報","発表","決定","成立","大規模","過去最大","初めて","新制度","改正","地震","災害","被害","死亡","停止","障害","流出","値上げ","利下げ","利上げ","新型","公開","発売"];
// The "used" section is a maker's field notebook, NOT a secondhand marketplace.
const HACK_ACTION = /(?:改造|魔改造|ハック|ハッキング|解析|リバースエンジニアリング|リバエン|分解|修理|修復|復活|蘇ら|再生|再利用|再活用|転用|流用|使い道|活用術|アップサイクル|自作ファーム|ファームウェアを書き|Linux化|Debian化|OpenWrt化|root化|root取得|UART|JTAG|ブートローダ|書き換え|移植|救出|hack(?:ing|ed|s)?|repurpos(?:e|ed|ing)|reus(?:e|ed|ing)|restore|restor(?:ed|ing)|retrofit|reverse.engineer|modif(?:y|ied)|modding|convert(?:ed|ing)?|repair(?:ed|ing)?|teardown|reflash|firmware mod)/i;
const HARDWARE_TARGET = /(?:ジャンク|中古|旧型|古い|廃棄|払い下げ|使わなくなった|故障|壊れ|不動品|ルーター|ホームルーター|ターミナル|モデム|nasne|テレビ|チューナー|セットトップボックス|STB|NAS|PC|パソコン|ワークステーション|サーバー|ノート|端末|スマホ|携帯|タブレット|Chromebook|Thin Client|シンクライアント|小型コンピュータ|基板|マイコン|電子機器|プリンタ|カメラ|ゲーム機|ラジオ|アンテナ|IoT|デバイス|ルータ|router|modem|laptop|computer|server|console|console|device|gadget|terminal|electronics|watch|printer|camera|keyboard|controller|chip|miner|Tamagotchi|Game Boy|Raspberry|ESP32)/i;
const RESCUE_OLD = /(?:ジャンク|中古|廃棄|旧型|古い|壊れ|故障|眠っていた|眠っている|眠る|使わなくなった|捨てられた|不動|訳あり|unwanted|discarded|broken|old |obsolete|e.waste|cheap|thrift|second.hand|salvag|vintage|retro)/i;
const SALE_ONLY = /(?:セール|大量入荷|特価|値下げ|割引|中古品販売|限定販売|在庫|買取|買い取り|最安|円で販売|円で登場|円で購入|円で買える|中古[ABCＳS]ランク|クーポン|お買い得|入荷|新品発売|発売開始|再販|再入荷)/i;
const HOWTO_SIGNAL = /(?:手順|方法|解説|公開|GitHub|ソース|コード|パッチ|成功|検証|DIY|やってみた|試してみた|作ってみた|改造記録|制作|実装|firmware|tutorial|guide|project|github|source.code|open.source)/i;
function lowPriceYen(text) {
 // Only explicitly priced items count. Product models (T3610 etc.) do not.
 const value=String(text);
 const man=[...value.matchAll(/(\d+(?:\.\d+)?)\s*万\s*(\d{1,4})?\s*円/g)]
   .map(m=>Math.round(Number(m[1])*10000)+Number(m[2]||0));
 const yen=[...value.matchAll(/(?:[¥￥]\s*([\d,]+)|(?<![万\d])([\d,]+)\s*円)/g)]
   .map(m=>Number((m[1]||m[2]).replace(/,/g,"")));
 const prices=[...man,...yen].filter(n=>n>=100&&n<=1000000);
 return prices.length?Math.min(...prices):Infinity;
}
function reuseSignal(a) {
 const title=a.title||"", summary=(a.summary||"").slice(0,260), text=title+" "+summary;
 const action=HACK_ACTION.test(title), hw=HARDWARE_TARGET.test(text), old=RESCUE_OLD.test(text);
 const how=HOWTO_SIGNAL.test(text), sales=SALE_ONLY.test(title);
 const price=lowPriceYen(title);
 const affordable=price<=5000;
 const overpriced=price>=15000&&price!==Infinity;
 // A real conversion/repair/hack is worth publishing even without a price.
 const maker=action&&hw;
 const revival=!action&&hw&&old&&how&&HACK_ACTION.test(summary);
 // A repair + bargain discovery (not an ordinary listing) may be interesting.
 const cheapProject=affordable&&old&&hw&&(action||HACK_ACTION.test(summary));
 const accept=(maker||revival||cheapProject)&&!(sales&&!action)&&!overpriced;
 const points=(action?20:0)+(old?12:0)+(how?9:0)+(affordable?12:0)+(RESCUE_OLD.test(title)?5:0)-(sales?17:0);
 const reason=/(?:転用|再利用|再活用|流用|repurpos|reus)/i.test(text)?"意外な使い道":
   /(?:UART|JTAG|OpenWrt|Linux化|Debian化|root化|ファームウェア|firmware|reverse.engineer)/i.test(text)?"改造手順・技術解析":
   /(?:復活|修理|修復|restore|repair)/i.test(text)?"ジャンク修復の実例":"機材ハックの実例";
 return {accept,points,reason};
}
// Personal news preference: suppress reporting of individual homicide/violent
// stabbing cases and road/rail collisions, without hiding transport policy,
// crash-prevention technology, industrial accidents or natural disasters.
const HOMICIDE_EVENT = /(?:殺人|殺害|殺傷|刺殺|絞殺|毒殺|撲殺|銃殺|刺し殺|通り魔|死体遺棄|刺され(?:て|た|る|死亡|重体)|刺した(?:疑い|容疑)|刃物で.{0,12}(?:刺し|刺され))/i;
const TRANSPORT_COLLISION = /(?:交通事故|ひき逃げ|ひき殺|当て逃げ|玉突き事故|多重衝突|衝突事故|追突|鉄道事故|列車事故|脱線事故|車にはねられ|車にひかれ|(?:乗用車|軽自動車|自動車|車|トラック|バス|タクシー|バイク|オートバイ|自転車|列車|電車).{0,24}(?:はね|衝突|追突|突っ込|横転|転落|脱線)|(?:歩行者|小学生|児童|生徒|高齢者|男性|女性|人).{0,15}(?:はねら|ひかれ))/i;
const SAFETY_RESEARCH = /(?:交通事故(?:防止|予防|対策|削減|抑止|分析|統計)|事故(?:防止|予防|削減|回避)|交通安全|安全運転|運転支援|自動運転|衝突回避|安全基準|道路交通法|事故率|安全技術)/;
const SPECIFIC_CASUALTY = /(?:死亡|死傷|重傷|重体|ケガ|けが|負傷|容疑|逮捕|現場|巻き込ま|遺族|被害者)/;
function excludedIncident(a) {
 const title=String(a?.title||"");
 if(HOMICIDE_EVENT.test(title))return true;
 if(TRANSPORT_COLLISION.test(title)) {
  if(SAFETY_RESEARCH.test(title)&&!SPECIFIC_CASUALTY.test(title))return false;
  return true;
 }
 // Some headlines only say "suspect arrested"; the RSS excerpt clarifies
 // whether it was an unwanted homicide or hit-and-run story.
 if(/(?:事件|逮捕|指名手配|容疑者|不審死)/.test(title)) {
  const summary=String(a?.summary||"").slice(0,200);
  return /(?:殺人|殺害|刺殺|殺傷|ひき逃げ|交通事故)/.test(summary);
 }
 return false;
}
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
function shortTitle(s){return clean(s).replace(/\s*[-｜|]\s*(NHK|ITmedia|PC Watch|INTERNET Watch|AKIBA PC Hotline!|エルミタージュ秋葉原).*$/i,"").slice(0,180);}
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
 if(item.category==="used"){
   const r=reuseSignal(item);
   return {score:Math.max(0,Math.min(99,49+recency+item.priority+r.points)),reason:r.reason};
 }
 const safety=LOCAL_ALERT.test(item.title)?22:0;
 const domesticBonus=item.category==="domestic"&&/(?:国内|日本|政府|東京|千葉|大阪|県|市|首相)/.test(item.title)?7:0;
 const score=Math.max(0,Math.min(99,base+recency+Math.min(18,impact)+Math.min(19,interest)+item.priority+safety+domesticBonus));
 return {score,reason: impact>=8?"社会的な重要性":interest>=6?"関心分野と高い一致":age<=12?"新着ニュース":"注目記事"};
}
function editorial(raw,previous) {
 const dt=Date.now();
 const combined=[...raw,...(previous?.articles||[])].filter(a=>a.url&&a.title&&!excludedIncident(a)&&Date.parse(a.published)>dt-(a.category==="used"?21:8)*86400000&& (a.category!=="used"||reuseSignal(a).accept));
 const byUrl=new Map();
 for(const a of combined){const key=canon(a.url);if(!byUrl.has(key)||a.summary.length>(byUrl.get(key).summary||"").length)byUrl.set(key,a);}
 const scored=[...byUrl.values()].map(a=>({...a,title:shortTitle(a.title),...score(a,dt)})).sort((a,b)=>b.score-a.score || Date.parse(b.published)-Date.parse(a.published));
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
// Ranking in the stored digest is about significance. The visible edition
// also needs to favor today's news, without deleting historical KV articles.
function displayRank(a,mode="headlines",now=Date.now()) {
 const timestamp=Date.parse(a.published);
 const hours=Number.isFinite(timestamp)?Math.max(0,(now-timestamp)/3600000):1000;
 const grace=mode==="used"?24:6;
 const decay=mode==="used"?0.12:0.68;
 return (a.score||0)-Math.min(85,Math.max(0,hours-grace)*decay);
}
function displayOrder(articles,mode="headlines") {
 const now=Date.now();
 return [...articles].sort((a,b)=>displayRank(b,mode,now)-displayRank(a,mode,now) ||
   Date.parse(b.published)-Date.parse(a.published));
}
function selectHeadlines(articles, limit=18) {
 const ranked=displayOrder(articles,"headlines");
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
   for(const a of ranked){
     const key=a.id||a.url;
     if(used>=section.quota)break;
     if(section.categories.includes(a.category)&&!seen.has(key)){
       chosen.push(a);seen.add(key);used++;
     }
   }
 }
 for(const a of ranked){
   if(chosen.length>=limit)break;
   const key=a.id||a.url;
   if(!seen.has(key)){chosen.push(a);seen.add(key);}
 }
 return displayOrder(chosen,"headlines").slice(0,limit);
}
function visibleArticles(articles,category) {
 const fresh=articles.filter(a=>Date.now()-Date.parse(a.published)<(category==="used"?21*24:72)*3600000);
 if(category==="headlines")return selectHeadlines(fresh);
 return displayOrder(fresh.filter(a=>a.category===category),category).slice(0,55);
}
async function fetchOne(src) {
 const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),src.category==="used"?9500:6500);
 try{
   const res=await fetch(src.url,{headers:{"Accept":"application/rss+xml,application/atom+xml,application/xml,text/xml,*/*","User-Agent":USER_AGENT},signal:ctrl.signal});
   if(!res.ok)throw Error("HTTP "+res.status);
   const body=await res.text();
   if(body.length>2_000_000)throw Error("feed too large");
   const parsed=parseXml(body,src);
   if(!parsed.length)throw Error("no parseable items");
   // Curate actual hardware hacks, not ordinary secondhand-price advertising.
   const items=parsed.filter(a=>!excludedIncident(a)&&(src.category!=="used"||reuseSignal(a).accept));
   return {id:src.id,name:src.name,items,count:items.length,scanned:parsed.length,ok:true};
 }catch(e){return{id:src.id,name:src.name,items:[],count:0,ok:false,error:String(e).slice(0,110)};}
 finally{clearTimeout(timer);}
}
async function refresh(env) {
 const old=await load(env);
 const result=await Promise.all(SOURCES.map(fetchOne));
 const fetched=result.flatMap(r=>r.items);
 if(fetched.length===0) return {ok:false,count:old?.articles?.length||0,error:"all feeds failed",feeds:result.map(({items,...rest})=>rest)};
 const articles=editorial(fetched,old), digest={generatedAt:nowIso(),articles,feeds:result.map(({items,...rest})=>rest),version:"0.1.0",editorialRevision:4};
 await env.NEWS.put("latest",JSON.stringify(digest));
 return {ok:true,count:articles.length,inserted:fetched.length,failures:result.filter(r=>!r.ok).map(r=>r.id)};
}
async function load(env) {const saved=await env.NEWS.get("latest",{type:"json"});return saved?{...saved,articles:(saved.articles||[]).filter(a=>!excludedIncident(a))}:null;}
const json=(obj,status=200,cache="public, max-age=120")=>new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*","Cache-Control":cache,"X-Content-Type-Options":"nosniff"}});
const dateJst=t=>new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(t));
const longJst=t=>new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"long",day:"numeric",weekday:"long",hour:"2-digit",minute:"2-digit"}).format(new Date(t));
function card(a,lead=false) {
 const cat=CATS.find(c=>c.id===a.category)?.label||"ニュース";
 return '<article class="article'+(lead?' lead':'')+'"><div class="metadata"><span class="tag">'+h(cat)+'</span><time>'+h(dateJst(a.published))+'</time><span class="score">'+h(a.score)+' / 99</span></div>'+
 '<h3><a href="'+h(a.url)+'" target="_blank" rel="noopener noreferrer">'+h(a.title)+'</a></h3>'+
 (a.summary?'<p class="excerpt">'+h(a.summary)+'</p>':'')+
 '<div class="foot"><span>'+h(a.source)+(a.relatedSources?.length>1?" ほか"+(a.relatedSources.length-1)+"媒体":"")+'</span><span>'+h(a.reason)+'</span></div></article>';
}
const AUTO_UPDATE_JS=String.raw`(() => {
 "use strict";
 const meta=document.querySelector('meta[name="karin-daily-generated-at"]');
 const loadedAt=Date.parse(meta?.content||"")||0;
 let inFlight=false,lastCheck=0;
 function notify() {
  if(document.getElementById("daily-new-edition"))return;
  const button=document.createElement("button");
  button.id="daily-new-edition";
  button.type="button";
  button.textContent="新しいニュースがあります。クリックして更新";
  button.addEventListener("click",()=>window.location.reload());
  document.body.prepend(button);
 }
 async function check() {
  if(document.visibilityState!=="visible"||inFlight||Date.now()-lastCheck<15000)return;
  inFlight=true;lastCheck=Date.now();
  try {
   const response=await fetch("/api/status",{cache:"no-store",headers:{"Accept":"application/json"}});
   if(!response.ok)return;
   const data=await response.json(),newAt=Date.parse(data.generatedAt||"");
   if(Number.isFinite(newAt)&&newAt>loadedAt+1000) {
    if(window.scrollY<=140)window.location.reload();
    else notify();
   }
  } catch (_) {
   // Network disruption is not a reason to replace a readable edition.
  } finally {inFlight=false;}
 }
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")check();});
 window.addEventListener("pageshow",check);
 window.addEventListener("focus",check);
 setInterval(check,5*60*1000);
})();`;
const THEME_JS=String.raw`(() => {
 "use strict";
 const key="karin-daily-theme";
 const root=document.documentElement;
 const preference=window.matchMedia("(prefers-color-scheme: dark)");
 try {
   const stored=localStorage.getItem(key);
   if (stored==="dark"||stored==="light")root.dataset.theme=stored;
 } catch {}
 const isDark=()=>root.dataset.theme==="dark"||(!root.dataset.theme&&preference.matches);
 const sync=()=>{
   const control=document.getElementById("theme-toggle");
   if(!control)return;
   const dark=isDark();
   const label=document.getElementById("theme-label");
   const symbol=control.querySelector(".theme-symbol");
   if(label)label.textContent=dark?"ライトモード":"ダークモード";
   if(symbol)symbol.textContent=dark?"☀":"☾";
   control.setAttribute("aria-pressed",String(dark));
   control.setAttribute("aria-label",dark?"ライトモードに切り替え":"ダークモードに切り替え");
 };
 document.addEventListener("DOMContentLoaded",()=>{
   const control=document.getElementById("theme-toggle");
   if(!control)return;
   control.addEventListener("click",()=>{
     const next=isDark()?"light":"dark";
     root.dataset.theme=next;
     try{localStorage.setItem(key,next)}catch{}
     sync();
   });
   if(typeof preference.addEventListener==="function")preference.addEventListener("change",sync);
   sync();
 });
})();`;
const CSS=String.raw`
/* Dark theme obeys the system unless the reader chooses an explicit setting. */
:root{--paper:#f7f5ef;--ink:#1c2a2d;--rule:#cbd2ca;--panel:#e5eee8;--panel-border:#c8dcd0;--tag-bg:#dce7dd;--tag-text:#265b4c;--tab-text:#475a58;--tab-active-bg:#194945;--body-text:#394b45;--muted:#586c67;--accent:#247d6b;--rust:#bb6544;color-scheme:light;}
:root[data-theme="dark"]{--paper:#131b1d;--ink:#eaf0ec;--rule:#344645;--panel:#202d2b;--panel-border:#455956;--tag-bg:#2b4d45;--tag-text:#c4eee0;--tab-text:#c3d4ce;--tab-active-bg:#245e53;--body-text:#d5e1da;--muted:#a7bcb3;--accent:#9ee2c8;--rust:#e8a37b;color-scheme:dark;}
@media(prefers-color-scheme:dark){:root:not([data-theme]){--paper:#131b1d;--ink:#eaf0ec;--rule:#344645;--panel:#202d2b;--panel-border:#455956;--tag-bg:#2b4d45;--tag-text:#c4eee0;--tab-text:#c3d4ce;--tab-active-bg:#245e53;--body-text:#c6d4cd;--muted:#a7bcb3;--accent:#9ee2c8;--rust:#e8a37b;color-scheme:dark;}}

/* Karin Daily typography: comfortable reading on desktop and mobile.
   Digest excerpt scale: 12px -> 14px -> 16px -> 18px -> 20px (two more steps). */
:root{
  font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;
  font-size:18px;line-height:1.7;
  background:var(--paper);color:var(--ink);font-synthesis:none;
}
*{box-sizing:border-box}
body{margin:0}
a{color:inherit;text-decoration:none}
a:hover{color:var(--accent)}
header{border-bottom:1px solid var(--rule);background:var(--paper)}
.shell{width:min(1200px,calc(100% - 42px));margin:auto}
.micro{background:#163e3c;color:#eaf4ea;padding:8px 0;font-size:12px;letter-spacing:.07em}
.micro .shell{display:flex;justify-content:space-between;gap:10px}
.masthead{padding:29px 0 22px;display:flex;align-items:end;justify-content:space-between;gap:20px}
.eyebrow{font-size:12px;letter-spacing:.2em;color:var(--accent);font-weight:800}
.logo{font-family:Georgia,"Yu Mincho","Hiragino Mincho ProN",serif;letter-spacing:-.065em;font-weight:800;font-size:clamp(40px,7vw,76px);line-height:1.1}
.logo span{color:#c06d42}
.desc{font-size:17px;line-height:1.7;color:var(--muted);margin-top:11px}
.bulletin{text-align:right;font-size:15px;color:var(--muted);line-height:1.85}
.bulletin strong{font-size:16px;color:var(--ink)}
.tabs{border-top:1px solid var(--rule);display:flex;align-items:center;gap:6px;overflow-x:auto;white-space:nowrap;padding:11px 0}
.tabs a{display:inline-flex;align-items:center;gap:7px;font-size:16px;font-weight:700;border-radius:22px;padding:10px 14px;color:var(--tab-text);flex-shrink:0}
.tabs a.active,.tabs a:hover{background:var(--tab-active-bg);color:#fff}
.tabs a.active:first-child{background:#b96743}
.tabs .tab-count{font-size:13px;opacity:.72}
.tabs a.active .tab-count{opacity:.95}
.hero{display:grid;grid-template-columns:1.7fr 1fr;gap:34px;padding:35px 0;border-bottom:1px solid var(--rule)}
.kicker{color:var(--rust);font-size:12px;letter-spacing:.16em;font-weight:900}
.hero h1{font-family:Georgia,"Yu Mincho",serif;font-size:clamp(32px,3.7vw,48px);line-height:1.45;letter-spacing:-.03em;margin:14px 0 14px;overflow-wrap:anywhere}
.hero .summary{font-size:21px;font-weight:400;color:var(--body-text);line-height:1.85;max-width:64ch}
.hero-box{background:var(--panel);border:1px solid var(--panel-border);border-radius:8px;padding:23px}
.hero-box .count{font-size:48px;color:var(--tab-active-bg);font-family:Georgia,serif;line-height:1.25;margin:8px 0}
.hero-box p{font-size:16px;color:var(--muted);line-height:1.85}
.main{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:38px;margin-top:30px}
.section-heading{display:flex;justify-content:space-between;align-items:end;gap:12px;border-bottom:2px solid #244b46;padding-bottom:12px;margin-bottom:10px}
.section-heading h2{font-size:27px;line-height:1.4;margin:0;font-family:Georgia,"Yu Mincho",serif}
.section-heading span{font-size:14px;color:var(--muted);white-space:nowrap}
.articles{display:grid;grid-template-columns:minmax(0,1fr)}
.article{padding:30px 0 35px;border-bottom:1px solid var(--rule);min-width:0}
.article.lead{grid-column:auto}
.metadata{display:flex;flex-wrap:wrap;gap:7px 12px;align-items:center;color:var(--muted);font-size:14px;line-height:1.55}
.tag{font-size:13px;background:var(--tag-bg);color:var(--tag-text);padding:4px 8px;border-radius:3px;font-weight:800}
.score{margin-left:auto;color:var(--rust);font-weight:700}
.article h3{font-family:Georgia,"Yu Mincho",serif;line-height:1.5;font-size:26px;font-weight:700;margin:13px 0 12px;overflow-wrap:anywhere}
.article.lead h3{font-size:30px}
.excerpt{font-size:20px;font-weight:400;color:var(--body-text);line-height:1.75;margin:0 0 18px;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.foot{font-size:14px;line-height:1.6;display:flex;gap:10px;justify-content:space-between;color:var(--muted);padding-top:8px;flex-wrap:wrap}
.sidebar{border-left:1px solid var(--rule);padding-left:25px}
.sidebar h3{font-family:Georgia,serif;font-size:20px;margin:9px 0 15px}
.source{font-size:16px;line-height:1.6;padding:10px 0;border-bottom:1px solid var(--rule);display:flex;justify-content:space-between;gap:8px}
.source span:last-child{flex-shrink:0;color:var(--muted)}
.dot{width:7px;height:7px;border-radius:50%;background:#2e9b7f;display:inline-block;margin-right:8px}
.dot.bad{background:#c77963}
.sidebar p{font-size:16px;color:var(--muted);line-height:1.85}
footer{margin-top:65px;background:#183c39;color:#c9ded3;padding:30px 0;font-size:15px;line-height:1.85}
.empty{padding:70px 10px;text-align:center;color:var(--muted);font-size:17px}
.loadMore{margin:25px 0 0;border:1px solid var(--rule);color:var(--accent);background:transparent;border-radius:4px;padding:12px 22px;cursor:pointer;font-size:16px;font-weight:700}
.used-links{border:1px solid var(--rule);border-radius:9px;padding:17px 18px;margin:17px 0 9px;background:var(--panel)}
.used-links strong{display:block;font-size:18px;margin-bottom:7px;color:var(--ink)}
.used-links p{font-size:15px;line-height:1.75;color:var(--muted);margin:0 0 13px}
.used-links a{display:inline-block;font-size:16px;font-weight:650;margin:0 14px 9px 0;text-decoration:underline;text-underline-offset:3px;color:var(--accent)}
#daily-new-edition{position:fixed;z-index:100;top:12px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 30px);border:1px solid var(--accent);border-radius:30px;background:var(--tab-active-bg);color:#fff;padding:12px 22px;cursor:pointer;font:inherit;font-size:15px;font-weight:700;box-shadow:0 5px 24px #0003}
#daily-new-edition:focus-visible{outline:3px solid var(--rust);outline-offset:2px}
@media(max-width:830px){
  .hero,.main{grid-template-columns:1fr}
  .sidebar{border-left:none;padding:0;border-top:1px solid var(--rule);margin-top:20px}
  .bulletin{display:none}
}
@media(max-width:560px){
  .shell{width:calc(100% - 28px)}
  .micro{font-size:11px}
  .logo{font-size:47px}
  .masthead{padding:23px 0}
  .hero{padding:23px 0;gap:20px}
  .hero h1{font-size:clamp(27px,7.5vw,36px)}
  .hero .summary{font-size:20px}
  .hero-box{padding:16px}
  .tabs a{font-size:16px;padding:11px 13px}
  .articles{grid-template-columns:minmax(0,1fr)}
  .article.lead{grid-column:auto}
  .article h3,.article.lead h3{font-size:25px}
  .excerpt{font-size:20px;line-height:1.75}
  .section-heading h2{font-size:25px}
}


.header-tools{display:flex;flex-direction:column;align-items:flex-end;gap:10px}
.theme-toggle{appearance:none;border:1px solid var(--rule);color:var(--ink);background:var(--panel);padding:9px 15px;border-radius:30px;font:inherit;font-size:15px;line-height:1.4;font-weight:750;white-space:nowrap;cursor:pointer;transition:background-color .15s,border-color .15s}
.theme-toggle:hover{border-color:var(--accent)}
.theme-toggle:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.theme-toggle .theme-symbol{font-size:18px;line-height:1;margin-right:5px}
@media(max-width:560px){.masthead{flex-direction:column;align-items:flex-start;gap:15px}.header-tools{align-items:flex-start}.theme-toggle{font-size:16px}}
`.trim();
function page(d,category) {
 const all=d?.articles||[], current=CATS.some(c=>c.id===category)?category:"headlines";
 const fresh=all.filter(a=>Date.now()-Date.parse(a.published)<72*3600000);
 const articles=visibleArticles(all,current);
 const isFront=current==="headlines";
 const lead=articles[0], updated=d?.generatedAt?longJst(d.generatedAt):"更新待ち";
 const selectedCategory=CATS.find(c=>c.id===current);
 const menu=CATS.map(c=>{
   const count=c.id==="headlines"?selectHeadlines(fresh).length:visibleArticles(all,c.id).length;
   return '<a class="'+(c.id===current?'active':'')+'" href="'+(c.id==="headlines"?"/":"/?category="+encodeURIComponent(c.id))+'"'+(c.id===current?' aria-current="page"':'')+'>'+h(c.label)+'<span class="tab-count">'+h(count)+'</span></a>';
 }).join("");
 const feeds=d?.feeds||SOURCES.map(s=>({name:s.name,id:s.id,ok:false,count:0}));
 const sourceHtml=feeds.map(f=>'<div class="source"><span><i class="dot'+(f.ok?"":" bad")+'"></i>'+h(f.name)+'</span><span>'+h(f.ok?String(f.count)+"件":"要確認")+'</span></div>').join("");
 const featured=isFront&&lead?
   '<div><div class="kicker">TODAY’S TOP HEADLINE</div><h1><a href="'+h(lead.url)+'" target="_blank" rel="noopener noreferrer">'+h(lead.title)+'</a></h1><p class="summary">'+h(lead.summary||"元記事で詳しく読む")+'</p><div class="metadata">'+h(lead.source)+' · '+h(dateJst(lead.published))+' · '+h(lead.reason)+'</div></div>':
   '<div><div class="kicker">'+(isFront?"KARIN DAILY NEXT":"SECTION / CATEGORY")+'</div><h1>'+(isFront?'今日のニュースを、<br>自分の視点で。':h(selectedCategory.label))+'</h1><p class="summary">'+(isFront?"ニュースを収集中です。":"この分野の新着記事を、重要度と公開時刻を考慮して並べています。気になる見出しから元記事へどうぞ。")+'</p></div>';
 const visibleCards=isFront&&lead?articles.slice(1):articles;
 const usedLinks=current==="used"?
 '<div class="used-links" aria-label="ジャンク機材再活用情報"><strong>安く買うより、面白く使い倒す。</strong><p>中古品の値下げ・大量入荷は原則除外。故障品の修復、古い端末のLinux化、ファームウェア解析、意外な転用を優先する選集です。元記事で手順や再現性を確かめてね。</p><a href="https://x.com/search?q=%E3%82%B8%E3%83%A3%E3%83%B3%E3%82%AF%20%E6%94%B9%E9%80%A0&f=live" target="_blank" rel="noopener noreferrer">X：ジャンク改造の最新投稿 ↗</a><a href="https://x.com/search?q=OpenWrt%20%E6%94%B9%E9%80%A0&f=live" target="_blank" rel="noopener noreferrer">X：OpenWrt改造の最新投稿 ↗</a><a href="https://hackaday.com/" target="_blank" rel="noopener noreferrer">Hackaday 海外ハック実例 ↗</a><a href="https://qiita.com/tags/%E3%82%B8%E3%83%A3%E3%83%B3%E3%82%AF" target="_blank" rel="noopener noreferrer">Qiita ジャンク技術記録 ↗</a></div>':"";
 const body=visibleCards.length?visibleCards.map(a=>card(a)).join(""):'<div class="empty">'+(isFront?"ほかのヘッドラインを収集中です。":"この分野に新着記事はありません。")+'</div>';
 return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>'+h(selectedCategory.label)+' | Karin Daily</title><meta name="description" content="国内ニュースを中心に、AI、OpenWrt、科学、PCの情報を一枚に編集。">'+
 '<meta name="color-scheme" content="light dark"><meta name="karin-daily-generated-at" content="'+h(d?.generatedAt||"")+'"><script src="/theme.js"></script><script defer src="/updates.js"></script><style>'+CSS+'</style></head><body>'+
 '<div class="micro"><div class="shell"><span>INDEPENDENT NEWS DIGEST · JAPAN</span><span>DAILY / 2026</span></div></div>'+
 '<header><div class="shell"><div class="masthead"><div><div class="eyebrow">THE PERSONAL INTELLIGENCE EDITION</div><div class="logo">Karin Daily<span>.</span></div><div class="desc">国内ニュースを中心に、今日の重要事項と関心分野をひとつに。</div></div><div class="header-tools"><div class="bulletin"><strong>DAILY EDITION</strong><br>'+h(updated)+' 更新<br>自動収集 · 出典へのリンク</div><button id="theme-toggle" class="theme-toggle" type="button" aria-label="表示モードを切り替え" aria-pressed="false"><span class="theme-symbol" aria-hidden="true">☾</span><span id="theme-label">ダークモード</span></button></div></div><nav class="tabs" aria-label="ヘッドライン・分野別紙面">'+menu+'</nav></div></header>'+
 '<div class="shell"><section class="hero">'+featured+'<div class="hero-box"><div class="eyebrow">'+(isFront?"HEADLINE EDITION":"SECTION DIGEST")+'</div><div class="count">'+h(articles.length)+'</div><p>'+(isFront?"重要ニュースと関心分野をバランスよく選んだ、今日のヘッドライン。分野別の全記事は上のタブから読めます。":"この分野で選び抜いた記事数。改造・転用の実例を重視し、ジャンク再活用は過去21日以内の記事を掲載します。")+'</p><p>新着取得：'+h(updated)+'</p></div></section>'+
 '<div class="main"><main><div class="section-heading"><h2>'+(isFront?"ヘッドライン一覧":h(selectedCategory.label)+" のニュース")+'</h2><span>'+h(articles.length)+' ARTICLES'+(isFront?" · 重要記事を厳選":"")+'</span></div>'+usedLinks+'<div class="articles">'+body+'</div></main>'+
 '<aside class="sidebar"><div class="eyebrow">NEWSROOM</div><h3>配信ソース</h3>'+sourceHtml+
 '<h3 style="margin-top:30px">編集ポリシー</h3><p>殺人事件・交通事故（道路・鉄道）の個別報道は除外します。交通政策や事故防止技術は掲載します。ジャンク再活用は値下げ広告を除外し、古い機材のハックや新しい用途を優先。各分野はタブで確認できます。</p><p>要約は配信元のRSS抜粋です。AIによる自動要約は未接続です。出典と公開時刻を確認してお読みください。</p><p><a href="/api/status">更新状態 API ↗</a><br><a href="/rss.xml">Karin Daily RSS ↗</a></p></aside></div></div>'+
 '<footer><div class="shell"><strong>Karin Daily</strong> · Independent edition<br>自動収集された情報です。元記事の著作権は各媒体に帰属します。<br><a href="https://github.com/Karin-Laboratory/karin-daily/tree/main/prototype/cloudflare-worker">Source / GitHub ↗</a></div></footer></body></html>';
}
function rss(d) {
 const items=(d?.articles||[]).slice(0,50).map(a=>'<item><title>'+x(a.title)+'</title><link>'+x(a.url)+'</link><guid isPermaLink="false">'+x(a.id)+'</guid><pubDate>'+new Date(a.published).toUTCString()+'</pubDate><description>'+x(a.summary)+'</description></item>').join("");
 return '<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Karin Daily</title><description>日本のニュースと関心分野のダイジェスト</description><link>https://daily.karin-lab.com/</link>'+items+'</channel></rss>';
}
export default {
 async fetch(request,env,ctx){
   const u=new URL(request.url);
   if(request.method!=="GET")return new Response("Method Not Allowed",{status:405});
   if(u.pathname==="/updates.js")return new Response(AUTO_UPDATE_JS,{headers:{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"public,max-age=3600","X-Content-Type-Options":"nosniff"}});
   if(u.pathname==="/theme.js")return new Response(THEME_JS,{headers:{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"public,max-age=3600","X-Content-Type-Options":"nosniff"}});
   if(u.pathname==="/healthz")return new Response("ok",{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
   if(u.pathname==="/api/health")return json({ok:true,service:"karin-daily-next",version:"0.1.0"});
   let d=await load(env);
   // One-time source migration: add the new feeds without deleting the existing KV snapshot.
   if(!d||!d.feeds?.some(f=>f.id==="akiba-used")||d.editorialRevision!==4){try{await refresh(env);d=await load(env);}catch(e){console.error("initial/source refresh",String(e));}}
   if(u.pathname==="/api/status")return json({generatedAt:d?.generatedAt||null,stored:d?.articles?.length||0,feeds:d?.feeds||[],categories:CATS,algorithm:"deterministic relevance + age + cross-source clustering; AI scoring not enabled"},200,"no-store");
   if(u.pathname==="/api/articles"){const cat=u.searchParams.get("category")||"all", n=Math.max(1,Math.min(150,Number(u.searchParams.get("limit"))||50));const items=cat==="all"?(d?.articles||[]):visibleArticles(d?.articles||[],cat==="headlines"?"headlines":cat);return json({generatedAt:d?.generatedAt||null,articles:items.slice(0,n)});}
   if(u.pathname==="/rss.xml")return new Response(rss(d),{headers:{"Content-Type":"application/rss+xml; charset=utf-8","Cache-Control":"public,max-age=300"}});
   if(u.pathname!=="/"&&u.pathname!=="/index.html")return new Response("Not found",{status:404});
   return new Response(page(d,u.searchParams.get("category")||"headlines"),{headers:{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'","X-Content-Type-Options":"nosniff","Cache-Control":"public,max-age=120"}});
 },
 async scheduled(event,env,ctx){ctx.waitUntil(refresh(env).then(r=>console.log("Karin Daily scheduled refresh",JSON.stringify(r))));}
};
