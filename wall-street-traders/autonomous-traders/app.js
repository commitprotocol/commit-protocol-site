const API="https://kgtksjxfcwnmyeqddpug.supabase.co/functions/v1/autonomous-public";
const PRICE_API="https://kgtksjxfcwnmyeqddpug.supabase.co/functions/v1/clock-in-mainnet/prices";
const STARTING_BALANCE=10000;
const DEFAULT_TRADER_ID=160;
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2});
const number=new Intl.NumberFormat("en-US",{maximumFractionDigits:4});
const $=id=>document.getElementById(id);
let overviewPromise;
const HISTORY_PAGE_SIZE=25;
const historyState={tokenId:null,action:"all",cursor:null,hasMore:false,loading:false,items:[]};
const ACTIVITY_PAGE_SIZE=25;
const activityState={action:"all",cursor:null,hasMore:false,loading:false,items:[]};

function imageUrl(id){return `../trading-floor/traders/${id}.png`}
function pct(value){const n=Number(value||0);return `${n>=0?"+":""}${n.toFixed(2)}%`}
function safe(value,fallback="—"){return value===null||value===undefined||value===""?fallback:value}
function title(value){return String(value||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]))}

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
  root.innerHTML=items.length?items.map(p=>{
    const pnl=Number(p.unrealized_pnl??p.total_pnl_usd??0);
    const cost=Number(p.average_entry||p.avg_cost||0)*Number(p.quantity||p.qty||0);
    const totalPct=p.total_pnl_pct!=null?Number(p.total_pnl_pct):(cost?pnl/cost*100:null);
    const dayUsd=p.day_pnl_usd??p.day_pnl??null;
    const dayPct=p.day_pnl_pct!=null?Number(p.day_pnl_pct):null;
    const pnlCls=pnl>=0?"buy":"sell";
    const dayLine=dayUsd!=null?`<br><small class="${Number(dayUsd)>=0?"buy":"sell"}">${money.format(Number(dayUsd))}${dayPct!=null?` (${pct(dayPct)})`:""} DAY</small>`:"";
    const totalLine=`<small class="${pnlCls}">${money.format(pnl)}${totalPct!=null?` (${pct(totalPct)})`:""}</small>`;
    return `<div class="data-row"><div><strong>${escapeHtml(p.symbol)}</strong><br><small>${number.format(p.quantity??p.qty)} UNITS · AVG ${money.format(p.average_entry??p.avg_cost)}</small></div><div><strong>${money.format(p.market_value)}</strong><br>${totalLine}${dayLine}</div></div>`
  }).join(""):"NO OPEN POSITIONS";
}

function renderDecisions(items){
  const root=$("decisions");root.classList.toggle("empty",!items.length);
  root.innerHTML=items.length?items.map(d=>{
    const action=String(d.action||"hold").toLowerCase();const proof=d.proof_data||{};const hash=String(d.proof_hash||"");const exit=d.exit_details||null;
    const exitMarkup=exit?`<div><span>EXIT REASON</span><b>${escapeHtml(title(d.reason_code).toUpperCase())}</b></div><div><span>ENTRY PRICE</span><b>${money.format(Number(exit.entry_price))}</b></div><div><span>EXIT PRICE</span><b>${money.format(Number(exit.exit_price))}</b></div><div><span>POSITION RETURN</span><b class="${Number(exit.return_pct)>=0?"buy":"sell"}">${pct(exit.return_pct)}</b></div><div><span>REALIZED P&amp;L</span><b class="${Number(exit.realized_pnl)>=0?"buy":"sell"}">${money.format(Number(exit.realized_pnl))}</b></div><div><span>QUANTITY SOLD</span><b>${number.format(Number(exit.quantity))}</b></div><div><span>TAKE PROFIT TARGET</span><b>${exit.take_profit_pct==null?"UNAVAILABLE":`+${Number(exit.take_profit_pct).toFixed(2)}%`}</b></div><div><span>STOP LOSS LIMIT</span><b>${exit.stop_loss_pct==null?"UNAVAILABLE":`-${Number(exit.stop_loss_pct).toFixed(2)}%`}</b></div>`:"";
    const proofMarkup=hash?`<details class="decision-proof"><summary>VIEW DECISION PROOF</summary><div class="proof-grid">${exitMarkup}<div><span>PRICE SNAPSHOT</span><b>${proof.price_snapshot==null?"UNAVAILABLE":money.format(Number(proof.price_snapshot))}</b></div><div><span>MARKET SIGNAL</span><b>${escapeHtml(String(safe(proof.market_signal)).toUpperCase())}</b></div><div><span>SIGNAL STRENGTH</span><b>${escapeHtml(String(safe(proof.signal_strength)).toUpperCase())}</b></div><div><span>RISK INFLUENCE</span><b>${escapeHtml(String(safe(proof.risk_influence)).toUpperCase())}</b></div><div><span>DISCIPLINE INFLUENCE</span><b>${escapeHtml(String(safe(proof.discipline_influence)).toUpperCase())}</b></div><div><span>MOMENTUM INFLUENCE</span><b>${escapeHtml(String(safe(proof.momentum_influence)).toUpperCase())}</b></div><div><span>ENGINE / DNA</span><b>${escapeHtml(String(safe(d.engine_version)).toUpperCase())} / ${escapeHtml(String(safe(d.dna_version)).toUpperCase())}</b></div><div class="proof-hash"><span>COMMITMENT HASH</span><code title="${escapeHtml(hash)}">${escapeHtml(hash.slice(0,22))}…${escapeHtml(hash.slice(-10))}</code></div></div><p>PUBLIC PROOF EXPOSES DECISION CONTEXT. PROPRIETARY WEIGHTS AND RAW INPUTS REMAIN PRIVATE.</p></details>`:"";
    return `<div class="data-row decision-row"><div><strong class="${["buy","sell"].includes(action)?action:""}">${escapeHtml(action.toUpperCase())} ${escapeHtml(safe(d.symbol,""))}</strong><br><small>${escapeHtml(title(d.reason_code))}</small></div><div><strong>${Number(d.confidence).toFixed(1)}%</strong><br><small>${escapeHtml(new Date(d.decided_at).toLocaleString())}</small></div>${proofMarkup}</div>`
  }).join(""):"NO DECISIONS YET";
  $("history-count").textContent=`${items.length} ${items.length===1?"DECISION":"DECISIONS"} LOADED`;
}

function setHistoryControls(){
  document.querySelectorAll(".history-toolbar button").forEach(button=>button.classList.toggle("active",button.dataset.action===historyState.action));
  const loadMore=$("load-more-decisions");loadMore.hidden=!historyState.hasMore;loadMore.disabled=historyState.loading;
  loadMore.textContent=historyState.loading?"LOADING…":"LOAD MORE ↓";
}

async function loadDecisionHistory({reset=false}={}){
  if(historyState.loading||!historyState.tokenId)return;
  if(reset){historyState.cursor=null;historyState.hasMore=false;historyState.items=[];renderDecisions([])}
  const requestedToken=historyState.tokenId;const requestedAction=historyState.action;
  historyState.loading=true;$("history-status").textContent="LOADING…";setHistoryControls();
  try{
    const params={history:"1",token_id:String(requestedToken),action:requestedAction,limit:String(HISTORY_PAGE_SIZE)};
    if(historyState.cursor)params.before=historyState.cursor;
    const data=await request(params);
    if(historyState.tokenId!==requestedToken||historyState.action!==requestedAction)return;
    const page=Array.isArray(data.decisions)?data.decisions:[];
    historyState.items=reset?page:[...historyState.items,...page];
    historyState.cursor=data.next_cursor||null;historyState.hasMore=Boolean(data.has_more);
    renderDecisions(historyState.items);$("history-status").textContent=historyState.hasMore?"MORE AVAILABLE":"COMPLETE";
  }catch{
    $("history-status").textContent="UNAVAILABLE";
    if(!historyState.items.length)$("decisions").innerHTML='<p class="loading">Decision history is temporarily unavailable.</p>';
  }finally{historyState.loading=false;setHistoryControls()}
}


const SPAN_LABELS={"1D":"Today","1W":"Past week","1M":"Past month","3M":"Past 3 months","YTD":"Year to date","ALL":"All time"};
const SPAN_ORDER=["1D","1W","1M","3M","YTD","ALL"];
let equityChart=null;
let equityState={span:"ALL",history:[],estimated:true,tokenId:null,total:STARTING_BALANCE};

function mulberry32(a){return function(){let t=a+=0x6d2b79f5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
function clamp(n,lo,hi){return Math.max(lo,Math.min(hi,n))}
function parseTs(v){if(v==null)return NaN;if(typeof v==="number")return v<1e12?v*1000:v;const t=Date.parse(v);return Number.isNaN(t)?NaN:t}
function normalizeHistory(raw){
  if(!Array.isArray(raw)||!raw.length)return[];
  return raw.map(p=>{
    const ts=parseTs(p.ts??p.timestamp??p.t??p.time);
    const equity=Number(p.equity_usd??p.equityUsd??p.equity??p.value??p.total_value);
    return{ts,equityUsd:equity};
  }).filter(p=>Number.isFinite(p.ts)&&Number.isFinite(p.equityUsd)).sort((a,b)=>a.ts-b.ts);
}
function extractEquityHistory(data){
  const candidates=[data.equity_history,data.equity_snapshots,data.history_curve,data.equity,data.portfolio?.equity_history,data.portfolio?.equity_snapshots];
  for(const c of candidates){const n=normalizeHistory(c);if(n.length)return n}
  return[];
}
function buildEstimatedHistory(tokenId,total,tradesCount){
  const now=Date.now();
  const start=STARTING_BALANCE;
  const end=Number(total)||start;
  const points=Math.max(24,Math.min(120,12+Number(tradesCount||0)*4));
  const spanMs=Math.max(3,Math.min(90,7+Number(tradesCount||0)*2))*24*3600_000;
  const step=spanMs/Math.max(1,points-1);
  const rng=mulberry32((Number(tokenId)||1)*997+(Number(tradesCount)||0)*131+42);
  const series=[];
  for(let i=0;i<points;i++){
    const t=i/(points-1);
    const ease=t*t*(3-2*t);
    const wobble=(rng()-0.5)*0.018*(1-Math.abs(t-0.5)*1.4);
    const equity=start+(end-start)*ease+start*wobble*(1-t);
    series.push({ts:now-spanMs+i*step,equityUsd:Math.round(Math.max(100,equity)*100)/100});
  }
  series[0].equityUsd=Math.round(start*100)/100;
  series[series.length-1].equityUsd=Math.round(end*100)/100;
  return series;
}
function spanWindowStart(span,now=Date.now()){
  if(span==="1D")return now-24*3600_000;
  if(span==="1W")return now-7*24*3600_000;
  if(span==="1M")return now-30*24*3600_000;
  if(span==="3M")return now-90*24*3600_000;
  if(span==="YTD")return new Date(new Date(now).getFullYear(),0,1).getTime();
  return 0;
}
function seriesForSpan(history,span){
  if(!history.length)return[];
  const start=spanWindowStart(span);
  let slice=history.filter(p=>p.ts>=start);
  if(!slice.length){
    const last=history[history.length-1];
    const prev=history.length>1?history[history.length-2]:{ts:last.ts-3600_000,equityUsd:STARTING_BALANCE};
    slice=[{ts:Math.max(start||prev.ts,prev.ts),equityUsd:prev.equityUsd},last];
  }else if(slice.length===1&&history.length>1){
    const idx=history.indexOf(slice[0]);
    const prev=history[Math.max(0,idx-1)];
    slice=[prev,slice[0]];
  }
  return slice;
}
function pnlFromSeries(series){
  if(!series.length)return{usd:0,pct:0,last:0,first:0};
  const first=series[0].equityUsd;const last=series[series.length-1].equityUsd;
  const usd=last-first;const pctVal=first===0?0:(usd/first)*100;
  return{usd,pct:pctVal,last,first};
}
function chartColor(up){return up?"#78f29a":"#ff8e8e"}
function chartFill(up){return up?"rgba(120,242,154,0.14)":"rgba(255,142,142,0.14)"}
function formatTipDate(ts,span){
  const d=new Date(ts);
  if(span==="1D"||span==="1W")return d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  if(span==="1M")return d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
}
function updateSpanHeadline(pnl,span){
  const amt=$("span-return-amt");const label=$("span-return-label");const totalRet=$("total-return");
  if(!amt)return;
  const usdTxt=(pnl.usd>=0?"+":"-")+money.format(Math.abs(pnl.usd));
  amt.textContent=`${usdTxt} (${pct(pnl.pct)})`;
  amt.className=pnl.usd>=0?"buy":"sell";
  if(label)label.textContent=SPAN_LABELS[span]||span;
  if(totalRet){
    totalRet.textContent=`${pct(pnl.pct)} · ${SPAN_LABELS[span]||span}`.toUpperCase();
    totalRet.className=pnl.usd>=0?"positive":"negative";
  }
}
function renderEquityChart(span){
  const canvas=$("equity-chart");if(!canvas||typeof Chart==="undefined")return;
  const series=seriesForSpan(equityState.history,span);
  const pnl=pnlFromSeries(series);
  updateSpanHeadline(pnl,span);
  const up=pnl.usd>=0;const color=chartColor(up);const fill=chartFill(up);
  const labels=series.map(p=>p.ts);const data=series.map(p=>p.equityUsd);
  const tip=$("chart-tip");const tipVal=$("tip-val");const tipDate=$("tip-date");const card=canvas.closest(".chart-card");
  const externalTooltip=ctx=>{
    const{tooltip}=ctx;
    if(!tooltip||tooltip.opacity===0||!tooltip.dataPoints?.length){tip?.classList.remove("visible");return}
    const dp=tooltip.dataPoints[0];
    tipVal.textContent=money.format(dp.parsed.y);
    tipDate.textContent=formatTipDate(labels[dp.dataIndex],span);
    tip.classList.add("visible");
    const tw=tip.offsetWidth||120;
    tip.style.left=clamp(dp.element.x,8+tw/2,(card?.clientWidth||300)-8-tw/2)+"px";
    tip.style.top=Math.max(28,dp.element.y)+"px";
  };
  if(equityChart){equityChart.destroy();equityChart=null}
  equityChart=new Chart(canvas.getContext("2d"),{
    type:"line",
    data:{labels,datasets:[{data,borderColor:color,backgroundColor:fill,borderWidth:2,fill:true,tension:series.length>2?0.35:0,pointRadius:series.length<=3?3:0,pointHoverRadius:5,pointHoverBackgroundColor:color,pointHoverBorderColor:"#050605",pointHoverBorderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:260},interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{enabled:false,external:externalTooltip}},scales:{x:{display:false},y:{display:false,grace:"4%"}},layout:{padding:{top:10,bottom:4,left:0,right:0}}}
  });
}
function setEquitySpan(span){
  if(!SPAN_ORDER.includes(span))span="ALL";
  equityState.span=span;
  document.querySelectorAll(".equity-spans button").forEach(btn=>{
    const on=btn.dataset.span===span;
    btn.setAttribute("aria-pressed",String(on));
    btn.tabIndex=on?0:-1;
  });
  renderEquityChart(span);
}
function wireEquitySpans(){
  const tabs=[...document.querySelectorAll(".equity-spans button")];
  if(!tabs.length||tabs[0].dataset.wired)return;
  tabs.forEach((btn,idx)=>{
    btn.dataset.wired="1";
    btn.addEventListener("click",()=>setEquitySpan(btn.dataset.span));
    btn.addEventListener("keydown",e=>{
      let next=null;
      if(e.key==="ArrowRight"||e.key==="ArrowDown")next=tabs[(idx+1)%tabs.length];
      if(e.key==="ArrowLeft"||e.key==="ArrowUp")next=tabs[(idx-1+tabs.length)%tabs.length];
      if(e.key==="Home")next=tabs[0];
      if(e.key==="End")next=tabs[tabs.length-1];
      if(next){e.preventDefault();next.focus();setEquitySpan(next.dataset.span)}
    });
  });
}
function renderPortfolioChart(data){
  wireEquitySpans();
  const id=data?.trader?.token_id??equityState.tokenId;
  const total=Number(data?.portfolio?.total_value??equityState.total);
  const trades=Number(data?.portfolio?.trades_count||0);
  let history=extractEquityHistory(data||{});
  const estimated=!history.length;
  if(estimated)history=buildEstimatedHistory(id,total,trades);
  else{
    const last=history[history.length-1];
    if(!last||Math.abs(last.equityUsd-total)>0.02)history=[...history,{ts:Date.now(),equityUsd:total}];
  }
  const nextSpan=estimated?"ALL":(equityState.span||"ALL");
  equityState={span:nextSpan,history,estimated,tokenId:id,total};
  const src=$("equity-source");const note=$("equity-note");
  if(src)src.textContent=estimated?"ESTIMATED":"LIVE HISTORY";
  if(note)note.textContent=estimated?"ESTIMATED CURVE · FULL HISTORY COMING FROM ENGINE":"LIVE EQUITY SNAPSHOTS · PAPER TRADING ONLY";
  setEquitySpan(nextSpan);
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
  renderBars(trader);renderPositions(positions);renderDecisions(decisions);renderPortfolioChart(data);
  $("traits").innerHTML=Object.entries(trader.traits||{}).filter(([,v])=>v).map(([k,v])=>`<div class="trait"><span>${k.toUpperCase()}</span><b>${v}</b></div>`).join("");
  historyState.tokenId=id;historyState.action="all";historyState.cursor=null;historyState.hasMore=false;historyState.items=decisions;setHistoryControls();loadDecisionHistory({reset:true});
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

function renderActivity(items){
  const root=$("activity-list");root.replaceChildren();
  $("activity-count").textContent=`${items.length} ${items.length===1?"DECISION":"DECISIONS"} LOADED`;
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
function setActivityControls(){
  document.querySelectorAll("[data-activity-action]").forEach(button=>button.classList.toggle("active",button.dataset.activityAction===activityState.action));
  const loadMore=$("load-more-activity");loadMore.hidden=!activityState.hasMore;loadMore.disabled=activityState.loading;loadMore.textContent=activityState.loading?"LOADING…":"LOAD MORE ↓";
}
async function loadActivity({reset=false}={}){
  if(activityState.loading||document.hidden||!$("activity").classList.contains("active-panel"))return;
  if(reset){activityState.cursor=null;activityState.hasMore=false;activityState.items=[];renderActivity([])}
  activityState.loading=true;setActivityControls();$("activity-status").textContent="LOADING…";
  try{
    const params={activity:"1",action:activityState.action,limit:String(ACTIVITY_PAGE_SIZE)};if(activityState.cursor)params.before=activityState.cursor;
    const data=await request(params);
    if(!Array.isArray(data.activity))throw new Error("Invalid activity response");
    activityState.items=reset?data.activity:[...activityState.items,...data.activity];activityState.cursor=data.next_cursor||null;activityState.hasMore=Boolean(data.has_more);renderActivity(activityState.items);
    $("activity-status").textContent=`UPDATED ${new Date().toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
  }catch{
    $("activity-status").textContent="UPDATES UNAVAILABLE";
    if(!activityState.items.length)$("activity-list").innerHTML='<p class="loading">Activity is temporarily unavailable. Please try again later.</p>';
  }finally{activityState.loading=false;setActivityControls()}
}

const navButtons=[...document.querySelectorAll(".autonomous-nav button")];
function showPanel(id){
  document.querySelectorAll(".workspace-content>.page-panel").forEach(panel=>panel.classList.toggle("active-panel",panel.id===id));
  navButtons.forEach(button=>button.setAttribute("aria-selected",String(button.dataset.panel===id)));
  if(id==="activity"&&!activityState.items.length)loadActivity({reset:true});
  window.scrollTo({top:$("main-content").offsetTop,behavior:"smooth"});
}
navButtons.forEach(button=>button.addEventListener("click",()=>showPanel(button.dataset.panel)));

$("search-form").addEventListener("submit",async event=>{event.preventDefault();const id=Number($("token-input").value);if(id>=1&&id<=444){if(await loadTrader(id))showPanel("profile")}else $("status").textContent="Enter a token ID between 1 and 444."});
const initial=new URLSearchParams(location.search).get("trader");
if(initial&&Number(initial)>=1&&Number(initial)<=444){$("token-input").value=initial;loadTrader(initial,{updateUrl:false}).then(success=>{if(success)showPanel("profile")})}
else loadTrader(DEFAULT_TRADER_ID,{updateUrl:false,scroll:false,keepVisible:true});
loadPrices();
loadOverview();
setInterval(()=>{if(activityState.items.length<=ACTIVITY_PAGE_SIZE)loadActivity({reset:true})},30000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&activityState.items.length<=ACTIVITY_PAGE_SIZE)loadActivity({reset:true})});
document.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>{if(historyState.loading)return;historyState.action=button.dataset.action;loadDecisionHistory({reset:true})}));
$("load-more-decisions").addEventListener("click",()=>loadDecisionHistory());
document.querySelectorAll("[data-activity-action]").forEach(button=>button.addEventListener("click",()=>{if(activityState.loading)return;activityState.action=button.dataset.activityAction;loadActivity({reset:true})}));
$("load-more-activity").addEventListener("click",()=>loadActivity());
