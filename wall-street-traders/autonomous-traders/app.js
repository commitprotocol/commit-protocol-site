const API="https://kgtksjxfcwnmyeqddpug.supabase.co/functions/v1/autonomous-public";
const PRICE_API="https://kgtksjxfcwnmyeqddpug.supabase.co/functions/v1/clock-in-mainnet/prices";
const STARTING_BALANCE=10000;
const DEFAULT_TRADER_ID=160;
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2});
const number=new Intl.NumberFormat("en-US",{maximumFractionDigits:4});
const $=id=>document.getElementById(id);
let overviewPromise;

function imageUrl(id){return `../trading-floor/traders/${id}.png`}
function pct(value){const n=Number(value||0);return `${n>=0?"+":""}${n.toFixed(2)}%`}
function safe(value,fallback="—"){return value===null||value===undefined||value===""?fallback:value}
function title(value){return String(value||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}

async function request(params={}){
  const url=new URL(API);Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
  const response=await fetch(url,{headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error(`Request failed (${response.status})`);
  return response.json();
}

function getOverview(){
  if(!overviewPromise)overviewPromise=request({overview:"1"}).catch(error=>{overviewPromise=null;throw error});
  return overviewPromise;
}

function renderBars(trader){
  const labels=[["Risk tolerance","risk_tolerance"],["Discipline","discipline"],["Patience","patience"],["Adaptability","adaptability"],["Research skill","research_skill"],["Momentum bias","momentum_bias"]];
  $("dna-bars").innerHTML=labels.map(([label,key])=>`<div class="dna-row"><header><span>${label}</span><b>${trader[key]}/100</b></header><div class="bar"><i style="width:${trader[key]}%"></i></div></div>`).join("");
}

function renderPositions(items){
  const root=$("positions");$("positions-total").textContent=items.length;$("position-count").textContent=`${items.length} OPEN`;
  root.classList.toggle("empty",!items.length);
  root.innerHTML=items.length?items.map(p=>`<div class="data-row"><div><strong>${p.symbol}</strong><br><small>${number.format(p.quantity)} UNITS · AVG ${money.format(p.average_entry)}</small></div><div><strong>${money.format(p.market_value)}</strong><br><small class="${Number(p.unrealized_pnl)>=0?"buy":"sell"}">${money.format(p.unrealized_pnl)}</small></div></div>`).join(""):"NO OPEN POSITIONS";
}

function renderDecisions(items){
  const root=$("decisions");root.classList.toggle("empty",!items.length);
  root.innerHTML=items.length?items.map(d=>`<div class="data-row"><div><strong class="${d.action}">${String(d.action).toUpperCase()} ${safe(d.symbol,"")}</strong><br><small>${title(d.reason_code)}</small></div><div><strong>${Number(d.confidence).toFixed(1)}%</strong><br><small>${new Date(d.decided_at).toLocaleString()}</small></div></div>`).join(""):"NO DECISIONS YET";
}

function renderProfile(data,{updateUrl=true}={}){
  const {trader,portfolio,positions=[],decisions=[]}=data;const id=trader.token_id;
  $("profile").hidden=false;$("status").textContent=`Showing the autonomous profile for WST #${id}.`;
  $("trader-image").src=imageUrl(id);$("trader-image").alt=trader.name;
  $("rarity-badge").textContent=String(trader.rarity_tier).toUpperCase();$("public-file").textContent=`PUBLIC FILE / WST-${String(id).padStart(3,"0")}`;
  $("trader-name").textContent=`TRADER #${id}`;$("archetype").textContent=title(trader.archetype);$("rarity-score").textContent=`${trader.rarity_score}/100`;$("dna-version").textContent=String(trader.dna_version).toUpperCase();$("dna-archetype").textContent=title(trader.archetype).toUpperCase();
  const total=Number(portfolio.total_value);const ret=(total/STARTING_BALANCE-1)*100;
  $("total-value").textContent=money.format(total);$("total-return").textContent=`${pct(ret)} SINCE START`;$("total-return").className=ret>=0?"positive":"";
  $("cash-balance").textContent=money.format(portfolio.cash_balance);$("positions-value").textContent=money.format(portfolio.positions_value);$("trades-count").textContent=portfolio.trades_count;$("win-loss").textContent=`${portfolio.wins_count} W / ${portfolio.losses_count} L`;
  renderBars(trader);renderPositions(positions);renderDecisions(decisions);
  $("traits").innerHTML=Object.entries(trader.traits||{}).filter(([,v])=>v).map(([k,v])=>`<div class="trait"><span>${k.toUpperCase()}</span><b>${v}</b></div>`).join("");
  if(updateUrl){const url=new URL(location.href);url.searchParams.set("trader",id);history.replaceState(null,"",url)}
}

async function loadTrader(id,options={}){
  $("status").textContent=`Loading WST #${id}…`;if(!options.keepVisible)$("profile").hidden=true;
  try{renderProfile(await request({token_id:id}),options);return true}catch(error){$("status").textContent=error.message.includes("404")?`WST #${id} was not found.`:"The trader profile could not be loaded. Please try again.";return false}
}

function renderPriceTape(assets){
  const tape=$("price-tape");
  if(!tape||!assets.length)return;
  tape.replaceChildren();
  [...assets,...assets].forEach(asset=>{
    const item=document.createElement("span");item.className="tape-item";
    const symbol=document.createElement("b");symbol.textContent=safe(asset.symbol,"ASSET");
    const price=document.createElement("em");price.textContent=money.format(Number(asset.price||0));
    const separator=document.createElement("i");separator.setAttribute("aria-hidden","true");separator.textContent="◆";
    item.append(symbol,price,separator);tape.append(item);
  });
}

async function loadPrices(){
  const tape=$("price-tape");
  try{
    const overview=await getOverview();
    const publicPrices=Array.isArray(overview.prices)?overview.prices.filter(asset=>asset?.symbol&&Number.isFinite(Number(asset.price))):[];
    if(publicPrices.length){renderPriceTape(publicPrices);return}
    const response=await fetch(PRICE_API,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:"{}"});
    if(!response.ok)throw new Error("price_request_failed");
    const data=await response.json();
    const assets=Array.isArray(data.assets)?data.assets.filter(asset=>asset?.symbol&&Number.isFinite(Number(asset.price))):[];
    if(!assets.length)throw new Error("prices_unavailable");
    renderPriceTape(assets);
  }catch{
    if(tape)tape.innerHTML='<span class="tape-item"><b>STOCK TOKENS</b><em>MARKET DATA TEMPORARILY UNAVAILABLE</em><i aria-hidden="true">◆</i></span>';
  }
}

function renderLeaderboard(items){
  $("leaderboard").innerHTML=items.map((r,i)=>{const ret=(Number(r.total_value)/STARTING_BALANCE-1)*100;return `<a class="leader-row" href="?trader=${r.token_id}" data-token="${r.token_id}"><b>#${i+1}</b><img src="${imageUrl(r.token_id)}" alt="WST #${r.token_id}" loading="lazy"><div><strong>TRADER #${r.token_id}</strong><br><small>${title(r.archetype)} · ${r.trades_count} trades</small></div><strong>${money.format(r.total_value)}</strong><b class="${ret>=0?"gain":"loss"}">${pct(ret)}</b></a>`}).join("");
  document.querySelectorAll("[data-token]").forEach(row=>row.addEventListener("click",async event=>{event.preventDefault();const id=row.dataset.token;$("token-input").value=id;if(await loadTrader(id))showPanel("profile")}));
}

async function loadOverview(){
  try{const data=await getOverview();$("asset-count").textContent=data.assets;$("cycle-count").textContent=data.cycles;renderLeaderboard(data.leaderboard||[])}catch{$("leaderboard").innerHTML='<p class="loading">Standings temporarily unavailable.</p>'}
}

let activityLoading=false;
let activityLoaded=false;
function renderActivity(items){
  const root=$("activity-list");root.replaceChildren();
  if(!items.length){const empty=document.createElement("p");empty.className="loading";empty.textContent="No decisions have been recorded yet.";root.append(empty);return}
  for(const row of items){
    const id=Number(row.token_id);
    if(!Number.isInteger(id)||id<1||id>444)continue;
    const action=String(row.action||"HOLD").toUpperCase();
    const link=document.createElement("a");link.className="activity-row";link.href=`?trader=${id}`;
    const portrait=document.createElement("img");portrait.src=imageUrl(id);portrait.alt=`WST #${id}`;portrait.loading="lazy";
    const identity=document.createElement("span");identity.className="activity-trader";identity.textContent=`TRADER #${id}`;
    const decision=document.createElement("span");decision.className=`activity-action ${["BUY","SELL","HOLD"].includes(action)?action.toLowerCase():""}`;decision.textContent=`${action} ${safe(row.symbol,"")}`.trim();
    const reason=document.createElement("span");reason.className="activity-reason";reason.textContent=title(row.reason_code);
    const stamp=document.createElement("time");stamp.className="activity-time";
    const date=new Date(row.decided_at);
    if(!Number.isNaN(date.getTime())){stamp.dateTime=date.toISOString();stamp.textContent=date.toLocaleString(undefined,{dateStyle:"short",timeStyle:"medium"})}else stamp.textContent="TIME UNAVAILABLE";
    link.append(portrait,identity,decision,reason,stamp);
    link.addEventListener("click",async event=>{event.preventDefault();$("token-input").value=id;if(await loadTrader(id))showPanel("profile")});
    root.append(link);
  }
}
async function loadActivity(){
  if(activityLoading||document.hidden||!$("activity").classList.contains("active-panel"))return;
  activityLoading=true;
  try{
    const data=await request({activity:"1",limit:"30"});
    if(!Array.isArray(data.activity))throw new Error("Invalid activity response");
    renderActivity(data.activity);activityLoaded=true;
    $("activity-status").textContent=`UPDATED ${new Date().toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
  }catch{
    $("activity-status").textContent="UPDATES UNAVAILABLE";
    if(!activityLoaded)$("activity-list").innerHTML='<p class="loading">Activity is temporarily unavailable. Please try again later.</p>';
  }finally{activityLoading=false}
}

const navButtons=[...document.querySelectorAll(".autonomous-nav button")];
function showPanel(id){
  document.querySelectorAll(".workspace-content>.page-panel").forEach(panel=>panel.classList.toggle("active-panel",panel.id===id));
  navButtons.forEach(button=>button.setAttribute("aria-selected",String(button.dataset.panel===id)));
  if(id==="activity")loadActivity();
  window.scrollTo({top:$("main-content").offsetTop,behavior:"smooth"});
}
navButtons.forEach(button=>button.addEventListener("click",()=>showPanel(button.dataset.panel)));

$("search-form").addEventListener("submit",async event=>{event.preventDefault();const id=Number($("token-input").value);if(id>=1&&id<=444){if(await loadTrader(id))showPanel("profile")}else $("status").textContent="Enter a token ID between 1 and 444."});
const initial=new URLSearchParams(location.search).get("trader");
if(initial&&Number(initial)>=1&&Number(initial)<=444){$("token-input").value=initial;loadTrader(initial,{updateUrl:false}).then(success=>{if(success)showPanel("profile")})}
else loadTrader(DEFAULT_TRADER_ID,{updateUrl:false,scroll:false,keepVisible:true});
loadPrices();
loadOverview();
setInterval(loadActivity,30000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)loadActivity()});
