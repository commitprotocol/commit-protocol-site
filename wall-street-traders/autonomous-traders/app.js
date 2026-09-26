const API="https://kgtksjxfcwnmyeqddpug.supabase.co/functions/v1/autonomous-public";
const PRICE_API="https://kgtksjxfcwnmyeqddpug.supabase.co/functions/v1/clock-in-mainnet/prices";
const STARTING_BALANCE=10000;
const DEFAULT_TRADER_ID=160;
const WATCH_KEY="wst_autonomous_watchlist_v1";
const FOLLOW_KEY="wst_autonomous_follow_dna_v1";
const AGENT_CTRL_KEY="wst_autonomous_agent_controls_v1";
const DCA_KEY="wst_autonomous_dca_v1";
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2});
const number=new Intl.NumberFormat("en-US",{maximumFractionDigits:4});
const $=id=>document.getElementById(id);
let overviewPromise;
let priceMap=new Map();
let profileCache={tokenId:null,positions:[],decisions:[],portfolio:null,trader:null};
const HISTORY_PAGE_SIZE=25;
const historyState={tokenId:null,action:"all",cursor:null,hasMore:false,loading:false,items:[]};
const ACTIVITY_PAGE_SIZE=25;
const activityState={action:"all",cursor:null,hasMore:false,loading:false,items:[],tokenId:"",symbol:"",view:"tickets"};
const rankingsState={sort:"gainers",metric:"equity",limit:10,loading:false,items:[]};
const scanState={archetype:"",minReturn:"",maxReturn:"",minTrades:"",sort:"gainers",metric:"equity",limit:25,loading:false,items:[],matched:0,backend:true};
let showHoldsMarkers=false;

function imageUrl(id){return `../trading-floor/traders/${id}.png`}
function pct(value){const n=Number(value||0);return `${n>=0?"+":""}${n.toFixed(2)}%`}
function safe(value,fallback="—"){return value===null||value===undefined||value===""?fallback:value}
function title(value){return String(value||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]))}
function clsPnL(n){return Number(n)>=0?"buy":"sell"}

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

function ingestPrices(list){
  if(!Array.isArray(list))return;
  for(const asset of list){
    const sym=String(asset?.symbol||"").toUpperCase();
    const price=Number(asset?.price);
    if(!sym||!Number.isFinite(price))continue;
    const prev=priceMap.get(sym);
    const changePct=asset.change_pct!=null?Number(asset.change_pct)
      :asset.day_change_pct!=null?Number(asset.day_change_pct)
      :asset.pct_change!=null?Number(asset.pct_change)
      :(prev&&prev.price&&prev.price!==price)?((price-prev.price)/prev.price)*100:null;
    priceMap.set(sym,{symbol:sym,price,changePct:Number.isFinite(changePct)?changePct:null,capturedAt:asset.captured_at||null});
  }
}
function priceOf(symbol){
  const hit=priceMap.get(String(symbol||"").toUpperCase());
  return hit||null;
}

/* ── Watchlist (localStorage) ── */
function loadWatchlist(){
  try{const raw=JSON.parse(localStorage.getItem(WATCH_KEY)||"[]");return Array.isArray(raw)?raw.map(s=>String(s).toUpperCase()).filter(Boolean):[]}catch{return[]}
}
function saveWatchlist(list){
  const uniq=[...new Set(list.map(s=>String(s).toUpperCase()).filter(Boolean))].slice(0,40);
  localStorage.setItem(WATCH_KEY,JSON.stringify(uniq));
  return uniq;
}
function isWatched(symbol){return loadWatchlist().includes(String(symbol||"").toUpperCase())}
function toggleWatch(symbol){
  const sym=String(symbol||"").toUpperCase();if(!sym)return;
  const list=loadWatchlist();
  const next=list.includes(sym)?list.filter(s=>s!==sym):[...list,sym];
  saveWatchlist(next);renderWatchlist();updateWatchButtons(sym);
}
function updateWatchButtons(symbol){
  const sym=String(symbol||"").toUpperCase();
  const on=isWatched(sym);
  document.querySelectorAll(`[data-watch-symbol="${sym}"]`).forEach(btn=>{
    btn.textContent=on?"★ WATCHING":"+ WATCH";
    btn.classList.toggle("watching",on);
  });
  const drawerBtn=$("drawer-watch-btn");
  if(drawerBtn&&drawerBtn.dataset.symbol===sym){
    drawerBtn.textContent=on?"★ WATCHING":"+ WATCH";
    drawerBtn.classList.toggle("watching",on);
  }
}
function renderWatchlist(){
  const root=$("watchlist-strip");const count=$("watchlist-count");if(!root)return;
  const list=loadWatchlist();
  if(count)count.textContent=String(list.length);
  if(!list.length){root.innerHTML='<p class="watchlist-empty">No symbols watched yet. Add from a position card or asset drawer.</p>';return}
  root.innerHTML=list.map(sym=>{
    const px=priceOf(sym);
    const chg=px?.changePct;
    const chgHtml=chg!=null?`<em class="${clsPnL(chg)}">${pct(chg)}</em>`:"";
    const priceHtml=px?`<b>${money.format(px.price)}</b>`:`<b class="muted">—</b>`;
    return `<button type="button" class="watch-chip" data-open-asset="${escapeHtml(sym)}"><span>${escapeHtml(sym)}</span>${priceHtml}${chgHtml}<i data-unwatch="${escapeHtml(sym)}" title="Remove">×</i></button>`;
  }).join("");
}

/* ── Follow DNA (localStorage) ── */
function loadFollowDna(){
  try{const raw=JSON.parse(localStorage.getItem(FOLLOW_KEY)||"[]");return Array.isArray(raw)?raw.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=444):[]}catch{return[]}
}
function saveFollowDna(list){
  const uniq=[...new Set(list.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=444))].slice(0,60);
  localStorage.setItem(FOLLOW_KEY,JSON.stringify(uniq));
  return uniq;
}
function isFollowing(id){return loadFollowDna().includes(Number(id))}
function toggleFollowDna(id){
  const token=Number(id);if(!Number.isInteger(token)||token<1||token>444)return;
  const list=loadFollowDna();
  const next=list.includes(token)?list.filter(n=>n!==token):[...list,token];
  saveFollowDna(next);updateFollowButton(token);renderFollowedStrip();
}
function updateFollowButton(id){
  const btn=$("follow-dna-btn");if(!btn)return;
  const on=isFollowing(id);
  btn.textContent=on?"FOLLOWING":"FOLLOW DNA";
  btn.classList.toggle("watching",on);
  btn.dataset.tokenId=String(id||"");
}
function renderFollowedStrip(){
  const root=$("followed-strip");const count=$("followed-count");if(!root)return;
  const list=loadFollowDna();
  if(count)count.textContent=String(list.length);
  if(!list.length){root.innerHTML='<p class="followed-empty">No DNA followed yet. Open a trader profile and tap FOLLOW DNA.</p>';return}
  const controls=loadAgentControls();
  root.innerHTML=list.map(id=>{
    const paused=!!controls[String(id)]?.paused;
    return `<button type="button" class="follow-chip ${paused?"paused":""}" data-open-trader="${id}"><img src="${imageUrl(id)}" alt="" loading="lazy"><span>TRADER #${id}</span>${paused?"<em>PAUSED BY YOU</em>":""}<i data-unfollow="${id}" title="Unfollow">×</i></button>`;
  }).join("");
}


/* ── Spectator DCA (local paper contract only) ── */
function loadDcaMap(){
  try{const raw=JSON.parse(localStorage.getItem(DCA_KEY)||"{}");return raw&&typeof raw==="object"?raw:{}}catch{return{}}
}
function saveDcaMap(map){localStorage.setItem(DCA_KEY,JSON.stringify(map||{}));return map}
function getDcaForToken(id){
  const row=loadDcaMap()[String(id)]||{};
  const mode=["off","buy","sell","both"].includes(row.mode)?row.mode:"off";
  const slices=Number.isInteger(Number(row.slices))&&Number(row.slices)>=2&&Number(row.slices)<=12?Number(row.slices):3;
  const interval_hint=typeof row.interval_hint==="string"&&row.interval_hint?row.interval_hint:"1h";
  return{mode,slices,interval_hint};
}
function setDcaMode(id,mode){
  const token=Number(id);if(!Number.isInteger(token)||token<1||token>444)return;
  const nextMode=["off","buy","sell","both"].includes(mode)?mode:"off";
  const map=loadDcaMap();
  const prev=getDcaForToken(token);
  map[String(token)]={mode:nextMode,slices:prev.slices,interval_hint:prev.interval_hint,updatedAt:Date.now()};
  saveDcaMap(map);
  renderDcaControls(token);
}
function renderDcaControls(tokenId){
  const id=Number(tokenId||profileCache.tokenId);
  const cfg=getDcaForToken(id);
  document.querySelectorAll("[data-dca-mode]").forEach(btn=>btn.classList.toggle("active",btn.dataset.dcaMode===cfg.mode));
  const badge=$("dca-badge");
  if(badge)badge.textContent=cfg.mode==="off"?"SPECTATOR DCA · ENGINE SUPPORT COMING":`SPECTATOR DCA · ${cfg.mode.toUpperCase()} · ENGINE SUPPORT COMING`;
}

/* ── Spectator agent controls (local UI only) ── */
function loadAgentControls(){
  try{const raw=JSON.parse(localStorage.getItem(AGENT_CTRL_KEY)||"{}");return raw&&typeof raw==="object"?raw:{}}catch{return{}}
}
function saveAgentControls(map){
  localStorage.setItem(AGENT_CTRL_KEY,JSON.stringify(map||{}));
  return map;
}
function isAgentPaused(id){return !!loadAgentControls()[String(id)]?.paused}
function setAgentPaused(id,paused){
  const token=Number(id);if(!Number.isInteger(token))return;
  const map=loadAgentControls();
  map[String(token)]={paused:!!paused,updatedAt:Date.now()};
  saveAgentControls(map);
  renderSafetyTheater(token);
  renderFollowedStrip();
}
function renderSafetyTheater(tokenId){
  const id=Number(tokenId||profileCache.tokenId);
  const paused=isAgentPaused(id);
  const status=$("agent-status");
  const badge=$("safety-status-badge");
  const pauseBtn=$("spectator-pause-btn");
  const resumeBtn=$("spectator-resume-btn");
  const fill=$("budget-ring-fill");
  const val=$("budget-ring-value");
  if(status){status.textContent=paused?"PAUSED BY YOU":"ACTIVE";status.className=paused?"negative":"positive"}
  if(badge){badge.textContent=paused?"PAUSED BY YOU":"ACTIVE";badge.className=paused?"loss":""}
  if(pauseBtn)pauseBtn.disabled=paused;
  if(resumeBtn)resumeBtn.disabled=!paused;
  const total=Number(profileCache.portfolio?.total_value||STARTING_BALANCE);
  if(fill){
    const pctFill=Math.max(6,Math.min(100,(total/STARTING_BALANCE)*100));
    fill.style.width=pctFill+"%";
    fill.className=total>=STARTING_BALANCE?"up":"down";
  }
  if(val)val.textContent=money.format(STARTING_BALANCE);
  renderDcaControls(id);
}

/* ── Portfolio digest (client-side) ── */
function buildPortfolioDigest(data){
  const trader=data?.trader||{};
  const portfolio=data?.portfolio||{};
  const positions=Array.isArray(data?.positions)?data.positions:[];
  const decisions=Array.isArray(data?.decisions)?data.decisions:[];
  const id=trader.token_id;
  const total=Number(portfolio.total_value||STARTING_BALANCE);
  const ret=((total/STARTING_BALANCE)-1)*100;
  const wins=Number(portfolio.wins_count||0);
  const losses=Number(portfolio.losses_count||0);
  const decided=wins+losses;
  const winRate=decided?wins/decided*100:null;
  const movers=[...positions].sort((a,b)=>Math.abs(Number(b.unrealized_pnl||0))-Math.abs(Number(a.unrealized_pnl||0))).slice(0,3);
  const last=decisions[0];
  const lastAction=last?String(last.action||"hold").toUpperCase():null;
  const lastSym=last?.symbol?String(last.symbol).toUpperCase():"";
  const parts=[];
  parts.push(`Trader #${id} (${title(trader.archetype)||"unknown archetype"}) holds a paper book at ${money.format(total)} (${pct(ret)} since the $10,000 start).`);
  if(positions.length){
    const moverTxt=movers.map(p=>{
      const pnl=Number(p.unrealized_pnl||0);
      return `${String(p.symbol).toUpperCase()} ${pnl>=0?"up":"down"} ${money.format(Math.abs(pnl))}`;
    }).join("; ");
    parts.push(`Open book: ${positions.length} position${positions.length===1?"":"s"}. Top unrealized movers — ${moverTxt}.`);
  }else{
    parts.push("No open positions right now; capital sits in cash.");
  }
  if(decided){
    parts.push(`Closed-trade tally: ${wins}W / ${losses}L${winRate!=null?` (${winRate.toFixed(0)}% win rate)`:""}. Realized P&L ${money.format(Number(portfolio.realized_pnl||0))}.`);
  }else{
    parts.push("No closed trades yet in this beta season.");
  }
  if(lastAction){
    const holdNote=lastAction==="HOLD"?" (condition checked · no trade)":"";
    parts.push(`Last recorded action: ${lastAction}${lastSym?" "+lastSym:""}${holdNote}${last?.reason_code?` — ${title(last.reason_code)}`:""}.`);
  }
  return parts.join(" ");
}
function renderPortfolioDigest(data){
  const root=$("portfolio-digest");if(!root)return;
  const text=buildPortfolioDigest(data);
  root.innerHTML=`<p class="digest-text">${escapeHtml(text)}</p><p class="digest-disclaimer">INFORMATIONAL · PAPER · NOT ADVICE</p>`;
}

/* ── Evaluation ledger ── */
function renderEvalLedger(decisions){
  const root=$("eval-ledger");if(!root)return;
  const items=Array.isArray(decisions)?decisions.slice(0,12):[];
  if(!items.length){root.innerHTML='<p class="loading">No evaluations yet.</p>';return}
  root.innerHTML=items.map(d=>{
    const action=String(d.action||"hold").toLowerCase();
    const isHold=action==="hold";
    const label=isHold?"CONDITION CHECKED · NO TRADE":action.toUpperCase();
    const when=(()=>{const t=new Date(d.decided_at);return Number.isNaN(t.getTime())?"—":t.toLocaleString()})();
    const proof=d.proof_data||{};
    const extras=[];
    if(proof.market_signal)extras.push(`Signal ${String(proof.market_signal).toUpperCase()}`);
    if(proof.signal_strength)extras.push(`Strength ${String(proof.signal_strength).toUpperCase()}`);
    if(proof.price_snapshot!=null)extras.push(`Px ${money.format(Number(proof.price_snapshot))}`);
    return `<div class="eval-row ${action}">
      <div class="eval-action"><strong class="${["buy","sell"].includes(action)?action:""}">${escapeHtml(label)}</strong>${d.symbol?`<button type="button" class="ticket-sym" data-open-asset="${escapeHtml(String(d.symbol).toUpperCase())}">${escapeHtml(String(d.symbol).toUpperCase())}</button>`:""}</div>
      <div class="eval-reason">${escapeHtml(title(d.reason_code)||"—")}</div>
      <div class="eval-meta">${escapeHtml(extras.join(" · ")||"—")}</div>
      <time class="eval-time">${escapeHtml(when)}</time>
    </div>`;
  }).join("");
}

/* ── DNA bars ── */
function renderBars(trader){
  const labels=[["Risk tolerance","risk_tolerance"],["Discipline","discipline"],["Patience","patience"],["Adaptability","adaptability"],["Research skill","research_skill"],["Momentum bias","momentum_bias"]];
  $("dna-bars").innerHTML=labels.map(([label,key])=>`<div class="dna-row"><header><span>${label}</span><b>${trader[key]}/100</b></header><div class="bar"><i style="width:${trader[key]}%"></i></div></div>`).join("");
}

/* ── Positions (mini-cards) ── */
function positionLastPrice(p){
  const fromPos=Number(p.current_price??p.last_price??p.mark_price);
  if(Number.isFinite(fromPos)&&fromPos>0)return fromPos;
  const tape=priceOf(p.symbol);
  if(tape)return tape.price;
  const qty=Number(p.quantity??p.qty??0);
  const mv=Number(p.market_value||0);
  return qty?mv/qty:Number(p.average_entry||p.avg_cost||0);
}
function renderPositions(items,portfolio){
  const root=$("positions");$("positions-total").textContent=items.length;$("position-count").textContent=`${items.length} OPEN`;
  root.classList.toggle("empty",!items.length);
  const book=Number(portfolio?.total_value||0)||items.reduce((s,p)=>s+Number(p.market_value||0),0);
  root.innerHTML=items.length?items.map(p=>{
    const qty=Number(p.quantity??p.qty??0);
    const avg=Number(p.average_entry||p.avg_cost||0);
    const last=positionLastPrice(p);
    const mv=Number(p.market_value??(qty*last)??0);
    const pnl=Number(p.unrealized_pnl??p.total_pnl_usd??(mv-avg*qty)??0);
    const cost=avg*qty;
    const totalPct=p.total_pnl_pct!=null?Number(p.total_pnl_pct):(cost?pnl/cost*100:0);
    const weight=book?mv/book*100:0;
    const sym=String(p.symbol||"").toUpperCase();
    const watched=isWatched(sym);
    return `<button type="button" class="position-card" data-open-asset="${escapeHtml(sym)}">
      <header><strong>${escapeHtml(sym)}</strong><span class="weight">${weight.toFixed(1)}% BOOK</span></header>
      <div class="pos-grid">
        <div><span>QTY</span><b>${number.format(qty)}</b></div>
        <div><span>AVG</span><b>${money.format(avg)}</b></div>
        <div><span>LAST</span><b>${money.format(last)}</b></div>
        <div><span>MKT VALUE</span><b>${money.format(mv)}</b></div>
      </div>
      <footer>
        <span class="${clsPnL(pnl)}">${money.format(pnl)} (${pct(totalPct)})</span>
        <span class="watch-inline ${watched?"watching":""}" data-watch-symbol="${escapeHtml(sym)}" role="button" tabindex="0">${watched?"★ WATCHING":"+ WATCH"}</span>
      </footer>
    </button>`;
  }).join(""):"NO OPEN POSITIONS";
}

/* ── Order tickets (decisions) ── */
function ticketKind(d){
  const reason=String(d.reason_code||"").toLowerCase();
  const exit=d.exit_details||{};
  if(reason.includes("stop")||exit.stop_hit||exit.stop_triggered)return "STOP";
  if(reason.includes("take_profit")||reason.includes("take-profit")||exit.take_profit_hit)return "LIMIT / TP";
  if(String(d.action||"").toLowerCase()==="sell"&&d.exit_details)return "MARKET";
  if(String(d.action||"").toLowerCase()==="buy")return "MARKET";
  return "SIGNAL";
}
function renderDecisionTicket(d,{compact=false}={}){
  const action=String(d.action||"hold").toLowerCase();
  const exit=d.exit_details||null;
  const proof=d.proof_data||{};
  const hash=String(d.proof_hash||"");
  const kind=ticketKind(d);
  const conf=Number(d.confidence);
  const confTxt=Number.isFinite(conf)?`${conf.toFixed(1)}%`:"—";
  const when=(()=>{const t=new Date(d.decided_at);return Number.isNaN(t.getTime())?"—":t.toLocaleString()})();
  let fill="";
  if(exit&&action==="sell"){
    const pnl=Number(exit.realized_pnl);
    const ret=Number(exit.return_pct);
    fill=`<div class="ticket-fill">
      <div><span>ENTRY</span><b>${money.format(Number(exit.entry_price))}</b></div>
      <div><span>EXIT</span><b>${money.format(Number(exit.exit_price))}</b></div>
      <div><span>REALIZED</span><b class="${clsPnL(pnl)}">${money.format(pnl)}</b></div>
      <div><span>RETURN</span><b class="${clsPnL(ret)}">${pct(ret)}</b></div>
      ${exit.stop_loss_pct!=null?`<div><span>STOP</span><b>−${Number(exit.stop_loss_pct).toFixed(2)}%</b></div>`:""}
      ${exit.take_profit_pct!=null?`<div><span>TAKE</span><b>+${Number(exit.take_profit_pct).toFixed(2)}%</b></div>`:""}
      ${exit.quantity!=null?`<div><span>QTY</span><b>${number.format(Number(exit.quantity))}</b></div>`:""}
    </div>`;
  }
  const exitMarkup=exit?`<div><span>EXIT REASON</span><b>${escapeHtml(title(d.reason_code).toUpperCase())}</b></div><div><span>ENTRY PRICE</span><b>${money.format(Number(exit.entry_price))}</b></div><div><span>EXIT PRICE</span><b>${money.format(Number(exit.exit_price))}</b></div><div><span>POSITION RETURN</span><b class="${clsPnL(exit.return_pct)}">${pct(exit.return_pct)}</b></div><div><span>REALIZED P&amp;L</span><b class="${clsPnL(exit.realized_pnl)}">${money.format(Number(exit.realized_pnl))}</b></div><div><span>QUANTITY SOLD</span><b>${number.format(Number(exit.quantity))}</b></div><div><span>TAKE PROFIT TARGET</span><b>${exit.take_profit_pct==null?"UNAVAILABLE":`+${Number(exit.take_profit_pct).toFixed(2)}%`}</b></div><div><span>STOP LOSS LIMIT</span><b>${exit.stop_loss_pct==null?"UNAVAILABLE":`-${Number(exit.stop_loss_pct).toFixed(2)}%`}</b></div>`:"";
  const proofMarkup=hash?`<details class="decision-proof"><summary>VIEW DECISION PROOF</summary><div class="proof-grid">${exitMarkup}<div><span>PRICE SNAPSHOT</span><b>${proof.price_snapshot==null?"UNAVAILABLE":money.format(Number(proof.price_snapshot))}</b></div><div><span>MARKET SIGNAL</span><b>${escapeHtml(String(safe(proof.market_signal)).toUpperCase())}</b></div><div><span>SIGNAL STRENGTH</span><b>${escapeHtml(String(safe(proof.signal_strength)).toUpperCase())}</b></div><div><span>RISK INFLUENCE</span><b>${escapeHtml(String(safe(proof.risk_influence)).toUpperCase())}</b></div><div><span>DISCIPLINE INFLUENCE</span><b>${escapeHtml(String(safe(proof.discipline_influence)).toUpperCase())}</b></div><div><span>MOMENTUM INFLUENCE</span><b>${escapeHtml(String(safe(proof.momentum_influence)).toUpperCase())}</b></div><div><span>ENGINE / DNA</span><b>${escapeHtml(String(safe(d.engine_version)).toUpperCase())} / ${escapeHtml(String(safe(d.dna_version)).toUpperCase())}</b></div><div class="proof-hash"><span>COMMITMENT HASH</span><code title="${escapeHtml(hash)}">${escapeHtml(hash.slice(0,22))}…${escapeHtml(hash.slice(-10))}</code></div></div><p>PUBLIC PROOF EXPOSES DECISION CONTEXT. PROPRIETARY WEIGHTS AND RAW INPUTS REMAIN PRIVATE.</p></details>`:"";
  const symBtn=d.symbol?`<button type="button" class="ticket-sym" data-open-asset="${escapeHtml(String(d.symbol).toUpperCase())}">${escapeHtml(String(d.symbol).toUpperCase())}</button>`:"";
  return `<article class="order-ticket ${action} ${compact?"compact":""}">
    <div class="ticket-top">
      <div class="ticket-action"><strong class="${["buy","sell"].includes(action)?action:""}">${escapeHtml(action.toUpperCase())}</strong>${symBtn}<em class="ticket-kind">${escapeHtml(kind)}</em></div>
      <div class="ticket-meta"><b>${escapeHtml(confTxt)}</b><small>CONF</small></div>
    </div>
    <p class="ticket-reason">${escapeHtml(title(d.reason_code))}</p>
    <p class="ticket-time">${escapeHtml(when)}</p>
    ${fill}
    ${proofMarkup}
  </article>`;
}
function renderDecisions(items){
  const root=$("decisions");root.classList.toggle("empty",!items.length);
  root.innerHTML=items.length?items.map(d=>renderDecisionTicket(d)).join(""):"NO DECISIONS YET";
  $("history-count").textContent=`${items.length} ${items.length===1?"DECISION":"DECISIONS"} LOADED`;
}

function setHistoryControls(){
  document.querySelectorAll(".history-toolbar button[data-action]").forEach(button=>button.classList.toggle("active",button.dataset.action===historyState.action));
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
    profileCache.decisions=historyState.items;
    renderEvalLedger(historyState.items);
  }catch{
    $("history-status").textContent="UNAVAILABLE";
    if(!historyState.items.length)$("decisions").innerHTML='<p class="loading">Decision history is temporarily unavailable.</p>';
  }finally{historyState.loading=false;setHistoryControls()}
}

/* ── Equity curve ── */
const SPAN_LABELS={"1D":"Today","1W":"Past week","1M":"Past month","3M":"Past 3 months","YTD":"Year to date","ALL":"All time"};
const SPAN_ORDER=["1D","1W","1M","3M","YTD","ALL"];
let equityChart=null;
let equityState={span:"ALL",history:[],estimated:true,tokenId:null,total:STARTING_BALANCE,markerDecisions:[]};

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
function interpolateEquity(history, ts){
  if(!history.length)return STARTING_BALANCE;
  if(ts<=history[0].ts)return history[0].equityUsd;
  if(ts>=history[history.length-1].ts)return history[history.length-1].equityUsd;
  let lo=0,hi=history.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(history[mid].ts<=ts)lo=mid;else hi=mid}
  const a=history[lo],b=history[hi];
  if(b.ts===a.ts)return a.equityUsd;
  const t=(ts-a.ts)/(b.ts-a.ts);
  return a.equityUsd+(b.equityUsd-a.equityUsd)*t;
}
function nearestEquityPoint(history, ts){
  if(!history.length)return null;
  let best=history[0],bestDist=Math.abs(history[0].ts-ts);
  for(const p of history){
    const d=Math.abs(p.ts-ts);
    if(d<bestDist){best=p;bestDist=d}
  }
  return best;
}
function buildMarkerPoints(decisions, series, span){
  const start=spanWindowStart(span);
  const end=series.length?series[series.length-1].ts:Date.now();
  const spanStart=series.length?series[0].ts:start;
  const out={buy:[],sell:[],hold:[]};
  for(const d of decisions||[]){
    const ts=parseTs(d.decided_at);
    if(!Number.isFinite(ts))continue;
    if(ts<spanStart||ts>end+60_000)continue;
    const action=String(d.action||"hold").toLowerCase();
    const y=interpolateEquity(series,ts);
    const point={
      x:ts,
      y,
      action,
      symbol:String(d.symbol||"").toUpperCase(),
      reason_code:d.reason_code||"",
      confidence:d.confidence,
      decided_at:d.decided_at
    };
    if(action==="buy")out.buy.push(point);
    else if(action==="sell")out.sell.push(point);
    else out.hold.push(point);
  }
  return out;
}
function renderEquityChart(span){
  const canvas=$("equity-chart");if(!canvas||typeof Chart==="undefined")return;
  const series=seriesForSpan(equityState.history,span);
  const pnl=pnlFromSeries(series);
  updateSpanHeadline(pnl,span);
  const up=pnl.usd>=0;const color=chartColor(up);const fill=chartFill(up);
  const lineData=series.map(p=>({x:p.ts,y:p.equityUsd}));
  const markers=buildMarkerPoints(equityState.markerDecisions||[],series,span);
  const tip=$("chart-tip");const tipVal=$("tip-val");const tipDate=$("tip-date");const card=canvas.closest(".chart-card");
  const externalTooltip=ctx=>{
    const{tooltip}=ctx;
    if(!tooltip||tooltip.opacity===0||!tooltip.dataPoints?.length){tip?.classList.remove("visible");return}
    const dp=tooltip.dataPoints[0];
    const raw=dp.raw||{};
    if(raw.action){
      const conf=Number.isFinite(Number(raw.confidence))?` · ${Number(raw.confidence).toFixed(0)}%`:"";
      tipVal.textContent=`${String(raw.action).toUpperCase()} ${raw.symbol||""}${conf}`.trim();
      tipDate.textContent=`${title(raw.reason_code)||"—"} · ${formatTipDate(raw.x??dp.parsed.x,span)}`;
    }else{
      tipVal.textContent=money.format(dp.parsed.y);
      tipDate.textContent=formatTipDate(dp.parsed.x,span);
    }
    tip.classList.add("visible");
    const tw=tip.offsetWidth||120;
    tip.style.left=clamp(dp.element.x,8+tw/2,(card?.clientWidth||300)-8-tw/2)+"px";
    tip.style.top=Math.max(28,dp.element.y)+"px";
  };
  const datasets=[
    {type:"line",label:"Equity",data:lineData,borderColor:color,backgroundColor:fill,borderWidth:2,fill:true,tension:series.length>2?0.35:0,pointRadius:series.length<=3?3:0,pointHoverRadius:5,pointHoverBackgroundColor:color,pointHoverBorderColor:"#050605",pointHoverBorderWidth:2,order:3},
    {type:"scatter",label:"BUY",data:markers.buy,pointStyle:"triangle",rotation:0,radius:7,hoverRadius:9,backgroundColor:"#78f29a",borderColor:"#050605",borderWidth:1,order:1},
    {type:"scatter",label:"SELL",data:markers.sell,pointStyle:"triangle",rotation:180,radius:7,hoverRadius:9,backgroundColor:"#ff8e8e",borderColor:"#050605",borderWidth:1,order:1}
  ];
  if(showHoldsMarkers){
    datasets.push({type:"scatter",label:"HOLD",data:markers.hold,pointStyle:"rectRot",rotation:0,radius:3.5,hoverRadius:5,backgroundColor:"#6b7168",borderColor:"#050605",borderWidth:1,order:2});
  }
  if(equityChart){equityChart.destroy();equityChart=null}
  equityChart=new Chart(canvas.getContext("2d"),{
    type:"line",
    data:{datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:{duration:260},
      interaction:{mode:"nearest",intersect:true},
      plugins:{legend:{display:false},tooltip:{enabled:false,external:externalTooltip}},
      scales:{
        x:{type:"linear",display:false,min:series[0]?.ts,max:series[series.length-1]?.ts},
        y:{display:false,grace:"8%"}
      },
      layout:{padding:{top:14,bottom:8,left:4,right:4}}
    }
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
  const estimated=history.length<2;
  if(estimated)history=buildEstimatedHistory(id,total,trades);
  else{
    const last=history[history.length-1];
    if(!last||Math.abs(last.equityUsd-total)>0.02)history=[...history,{ts:Date.now(),equityUsd:total}];
  }
  const nextSpan=estimated?"ALL":(equityState.span||"ALL");
  const priorMarkers=equityState.tokenId===id?(equityState.markerDecisions||[]):[];
  const fromProfile=Array.isArray(data?.decisions)?data.decisions:[];
  const seedMarkers=priorMarkers.length?priorMarkers:fromProfile;
  equityState={span:nextSpan,history,estimated,tokenId:id,total,markerDecisions:seedMarkers};
  const src=$("equity-source");const note=$("equity-note");
  if(src)src.textContent=estimated?"ESTIMATED":"LIVE HISTORY";
  if(note)note.textContent=estimated?"ESTIMATED CURVE · FULL HISTORY COMING FROM ENGINE":"LIVE EQUITY SNAPSHOTS · PAPER TRADING ONLY · MARKERS = DECISIONS";
  setEquitySpan(nextSpan);
  loadEquityMarkers(id);
}
async function loadEquityMarkers(tokenId){
  const id=Number(tokenId);if(!Number.isInteger(id)||id<1||id>444)return;
  try{
    const data=await request({history:"1",token_id:String(id),action:"all",limit:"50"});
    if(equityState.tokenId!==id)return;
    const page=Array.isArray(data.decisions)?data.decisions:[];
    const merged=new Map();
    for(const d of [...(equityState.markerDecisions||[]),...page]){
      const key=`${d.decided_at}|${d.action}|${d.symbol}|${d.reason_code||""}`;
      merged.set(key,d);
    }
    equityState.markerDecisions=[...merged.values()];
    renderEquityChart(equityState.span||"ALL");
  }catch{/* keep profile decisions */}
}


/* ── Asset drawer ── */
function closeAssetDrawer(){
  const drawer=$("asset-drawer");const back=$("drawer-backdrop");
  if(drawer){drawer.hidden=true;drawer.setAttribute("aria-hidden","true")}
  if(back)back.hidden=true;
  document.body.classList.remove("drawer-open");
}
function openAssetDrawer(symbol){
  const sym=String(symbol||"").toUpperCase();if(!sym)return;
  const drawer=$("asset-drawer");const back=$("drawer-backdrop");if(!drawer)return;
  drawer.hidden=false;drawer.setAttribute("aria-hidden","false");
  if(back)back.hidden=false;
  document.body.classList.add("drawer-open");
  $("drawer-symbol").textContent=sym;
  const px=priceOf(sym);
  const pos=(profileCache.positions||[]).find(p=>String(p.symbol||"").toUpperCase()===sym);
  const last=pos?positionLastPrice(pos):(px?.price??null);
  const chg=px?.changePct;
  $("drawer-price").innerHTML=last!=null
    ?`${money.format(last)}${chg!=null?` <em class="${clsPnL(chg)}">${pct(chg)}</em>`:""}`
    :"PRICE UNAVAILABLE";
  const watchBtn=$("drawer-watch-btn");
  watchBtn.dataset.symbol=sym;
  const on=isWatched(sym);
  watchBtn.textContent=on?"★ WATCHING":"+ WATCH";
  watchBtn.classList.toggle("watching",on);

  const spark=$("drawer-spark");
  if(spark){
    const seed=sym.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
    const rng=mulberry32(seed*17+91);
    const base=last||100;
    const pts=Array.from({length:24},(_,i)=>{
      const wobble=(rng()-0.5)*0.04;
      return Math.max(1,base*(1+wobble*(i/23)));
    });
    if(last)pts[pts.length-1]=last;
    const min=Math.min(...pts),max=Math.max(...pts),span=max-min||1;
    const w=280,h=64;
    const path=pts.map((v,i)=>{
      const x=(i/(pts.length-1))*w;
      const y=h-((v-min)/span)*(h-8)-4;
      return `${i?"L":"M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const up=(pts[pts.length-1]??0)>=(pts[0]??0);
    spark.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" fill="none" stroke="${up?"#78f29a":"#ff8e8e"}" stroke-width="2"/></svg><small>PRICE SPARK · ILLUSTRATIVE</small>`;
  }

  const stats=$("drawer-stats");
  if(pos){
    const qty=Number(pos.quantity??pos.qty??0);
    const avg=Number(pos.average_entry||pos.avg_cost||0);
    const mv=Number(pos.market_value??(qty*last)??0);
    const pnl=Number(pos.unrealized_pnl??(mv-avg*qty)??0);
    const cost=avg*qty;
    const totalPct=cost?pnl/cost*100:0;
    const book=Number(profileCache.portfolio?.total_value||0);
    const weight=book?mv/book*100:0;
    stats.innerHTML=`
      <div><span>QTY</span><b>${number.format(qty)}</b></div>
      <div><span>AVG ENTRY</span><b>${money.format(avg)}</b></div>
      <div><span>LAST</span><b>${money.format(last||0)}</b></div>
      <div><span>MKT VALUE</span><b>${money.format(mv)}</b></div>
      <div><span>UNREALIZED</span><b class="${clsPnL(pnl)}">${money.format(pnl)} (${pct(totalPct)})</b></div>
      <div><span>BOOK WEIGHT</span><b>${weight.toFixed(1)}%</b></div>`;
  }else{
    stats.innerHTML=`<div><span>POSITION</span><b>NOT HELD</b></div><div><span>LAST</span><b>${last!=null?money.format(last):"—"}</b></div>`;
  }

  const pool=[...(historyState.items||[]),...(profileCache.decisions||[])];
  const seen=new Set();
  const related=[];
  for(const d of pool){
    if(String(d.symbol||"").toUpperCase()!==sym)continue;
    const key=`${d.decided_at}|${d.action}|${d.proof_hash||""}`;
    if(seen.has(key))continue;seen.add(key);related.push(d);
    if(related.length>=8)break;
  }
  const box=$("drawer-decisions");
  box.innerHTML=related.length?related.map(d=>renderDecisionTicket(d,{compact:true})).join(""):'<p class="loading">No decisions for this symbol in the loaded history.</p>';
}

/* ── Market cards (overview) ── */
function renderMarketCards(prices){
  const root=$("market-cards");const status=$("market-cards-status");if(!root)return;
  const list=Array.isArray(prices)?prices.filter(p=>p?.symbol&&Number.isFinite(Number(p.price))):[];
  if(!list.length){root.innerHTML='<p class="loading">Market cards temporarily unavailable.</p>';if(status)status.textContent="UNAVAILABLE";return}
  const withChg=list.map(p=>{
    const hit=priceOf(p.symbol)||{price:Number(p.price),changePct:null};
    return{symbol:String(p.symbol).toUpperCase(),price:Number(p.price),changePct:hit.changePct};
  });
  const hasMoves=withChg.some(p=>p.changePct!=null);
  let cards;
  if(hasMoves){
    const sorted=[...withChg].sort((a,b)=>Math.abs(b.changePct||0)-Math.abs(a.changePct||0));
    cards=sorted.slice(0,8);
    if(status)status.textContent="TOP MOVERS";
  }else{
    const byPrice=[...withChg].sort((a,b)=>b.price-a.price);
    const high=byPrice.slice(0,4);
    const low=byPrice.slice(-4).reverse();
    const seen=new Set();
    cards=[];
    for(const c of [...high,...low]){if(seen.has(c.symbol))continue;seen.add(c.symbol);cards.push(c);if(cards.length>=8)break}
    if(status)status.textContent="SPOTLIGHT";
  }
  root.innerHTML=cards.map(c=>{
    const chg=c.changePct!=null?`<em class="${clsPnL(c.changePct)}">${pct(c.changePct)}</em>`:`<em class="muted">SPOT</em>`;
    return `<button type="button" class="market-card" data-market-symbol="${escapeHtml(c.symbol)}"><span>${escapeHtml(c.symbol)}</span><b>${money.format(c.price)}</b>${chg}</button>`;
  }).join("");
}

/* ── Compare traders ── */
function openCompare(seedIds=[]){
  const modal=$("compare-modal");const back=$("compare-backdrop");
  if(!modal)return;
  modal.hidden=false;if(back)back.hidden=false;
  document.body.classList.add("modal-open");
  const ids=seedIds.filter(n=>Number.isInteger(n)&&n>=1&&n<=444).slice(0,3);
  if(ids[0])$("compare-a").value=ids[0];
  if(ids[1])$("compare-b").value=ids[1];
  if(ids[2])$("compare-c").value=ids[2];
  else if(!ids.length&&profileCache.tokenId)$("compare-a").value=profileCache.tokenId;
}
function closeCompare(){
  const modal=$("compare-modal");const back=$("compare-backdrop");
  if(modal)modal.hidden=true;if(back)back.hidden=true;
  document.body.classList.remove("modal-open");
}
async function runCompare(ids){
  const grid=$("compare-grid");
  grid.innerHTML='<p class="loading">Loading trader books…</p>';
  const unique=[...new Set(ids)].slice(0,3);
  try{
    const results=await Promise.all(unique.map(async id=>{
      try{return{id,data:await request({token_id:String(id)})}}catch(err){return{id,error:err.message}}
    }));
    grid.innerHTML=results.map(({id,data,error})=>{
      if(error||!data?.trader){
        return `<article class="compare-card error"><h3>TRADER #${id}</h3><p>Unavailable</p></article>`;
      }
      const p=data.portfolio||{};
      const total=Number(p.total_value||0);
      const ret=(total/STARTING_BALANCE-1)*100;
      const wins=Number(p.wins_count||0);const losses=Number(p.losses_count||0);
      const decided=wins+losses;const winRate=decided?wins/decided*100:0;
      const posCount=(data.positions||[]).length;
      return `<article class="compare-card">
        <header><img src="${imageUrl(id)}" alt="" loading="lazy"><div><h3>TRADER #${id}</h3><small>${escapeHtml(title(data.trader.archetype))}</small></div></header>
        <dl>
          <div><dt>TOTAL VALUE</dt><dd>${money.format(total)}</dd></div>
          <div><dt>RETURN</dt><dd class="${ret>=0?"buy":"sell"}">${pct(ret)}</dd></div>
          <div><dt>TRADES</dt><dd>${safe(p.trades_count,0)}</dd></div>
          <div><dt>WIN RATE</dt><dd>${decided?winRate.toFixed(0)+"%":"—"} <small>${wins}W / ${losses}L</small></dd></div>
          <div><dt>CASH</dt><dd>${money.format(Number(p.cash_balance||0))}</dd></div>
          <div><dt>POSITIONS</dt><dd>${posCount}</dd></div>
        </dl>
        <button type="button" class="ghost-btn" data-open-trader="${id}">OPEN PROFILE →</button>
      </article>`;
    }).join("");
  }catch{
    grid.innerHTML='<p class="loading">Compare failed. Try again.</p>';
  }
}

/* ── Profile ── */
function renderProfile(data,{updateUrl=true}={}){
  const {trader,portfolio,positions=[],decisions=[]}=data;const id=trader.token_id;
  $("profile").hidden=false;$("status").textContent=`Showing the autonomous profile for WST #${id}.`;
  $("trader-image").src=imageUrl(id);$("trader-image").alt=trader.name;
  $("rarity-badge").textContent=String(trader.rarity_tier).toUpperCase();$("public-file").textContent=`PUBLIC FILE / WST-${String(id).padStart(3,"0")}`;
  $("trader-name").textContent=`TRADER #${id}`;$("archetype").textContent=title(trader.archetype);$("rarity-score").textContent=`${trader.rarity_score}/100`;$("dna-version").textContent=String(trader.dna_version).toUpperCase();$("dna-archetype").textContent=title(trader.archetype).toUpperCase();
  const total=Number(portfolio.total_value);const ret=(total/STARTING_BALANCE-1)*100;
  $("total-value").textContent=money.format(total);$("total-return").textContent=`${pct(ret)} SINCE START`;$("total-return").className=ret>=0?"positive":"negative";
  $("cash-balance").textContent=money.format(portfolio.cash_balance);$("positions-value").textContent=money.format(portfolio.positions_value);$("trades-count").textContent=portfolio.trades_count;$("win-loss").textContent=`${portfolio.wins_count} W / ${portfolio.losses_count} L`;
  const seasonEl=$("identity-season");if(seasonEl)seasonEl.textContent="BETA-1 · PAPER";
  const lastEv=$("last-evaluated");
  if(lastEv){const t=new Date(portfolio.last_evaluated_at);lastEv.textContent=Number.isNaN(t.getTime())?"—":t.toLocaleString()}
  const setPnL=(elId,raw)=>{const el=$(elId);if(!el)return;const n=Number(raw);if(!Number.isFinite(n)){el.textContent="—";el.className="";return}el.textContent=money.format(n);el.className=n>=0?"positive":"negative"};
  setPnL("realized-pnl",portfolio.realized_pnl);setPnL("unrealized-pnl",portfolio.unrealized_pnl);
  const winEl=$("win-rate");
  if(winEl){const wins=Number(portfolio.wins_count||0),losses=Number(portfolio.losses_count||0),decided=wins+losses;
    if(decided>0){const rate=(wins/decided)*100;winEl.innerHTML=`${rate.toFixed(1)}%<small>${wins}W / ${losses}L</small>`;winEl.className=rate>=50?"positive":"negative"}
    else{winEl.textContent="N/A";winEl.className=""}}
  profileCache={tokenId:id,positions,decisions,portfolio,trader};
  renderBars(trader);renderPositions(positions,portfolio);renderDecisions(decisions);renderPortfolioChart(data);renderWatchlist();
  renderPortfolioDigest(data);renderEvalLedger(decisions);renderSafetyTheater(id);updateFollowButton(id);
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
    if(publicPrices.length){
      ingestPrices(publicPrices);
      renderPriceTape(publicPrices);
      renderMarketCards(publicPrices);
      renderWatchlist();
      return;
    }
    const response=await fetch(PRICE_API,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:"{}"});
    if(!response.ok)throw new Error("price_request_failed");
    const data=await response.json();
    const assets=Array.isArray(data.assets)?data.assets.filter(asset=>asset?.symbol&&Number.isFinite(Number(asset.price))):[];
    if(!assets.length)throw new Error("prices_unavailable");
    ingestPrices(assets);
    renderPriceTape(assets);
    renderMarketCards(assets);
    renderWatchlist();
  }catch{
    if(tape)tape.innerHTML='<span class="tape-item"><b>STOCK TOKENS</b><em>MARKET DATA TEMPORARILY UNAVAILABLE</em><i aria-hidden="true">◆</i></span>';
    renderMarketCards([]);
  }
}

function renderLeaderboard(items,{sort="gainers",metric="equity"}={}){
  const root=$("leaderboard");
  if(!root)return;
  if(!items.length){root.innerHTML='<p class="loading">No standings for this filter.</p>';return}
  const loserMode=sort==="losers";
  root.innerHTML=items.map((r,i)=>{
    const ret=r.return_pct!=null?Number(r.return_pct):(Number(r.total_value)/STARTING_BALANCE-1)*100;
    const realized=Number(r.realized_pnl||0);
    const primary=metric==="realized"
      ?`<strong class="${realized>=0?"gain":"loss"}">${money.format(realized)}</strong><b class="${realized>=0?"gain":"loss"}">${pct(ret)}</b>`
      :`<strong>${money.format(Number(r.total_value))}</strong><b class="${ret>=0?"gain":"loss"}">${pct(ret)}</b>`;
    return `<a class="leader-row ${loserMode?"loser-row":""}" href="?trader=${r.token_id}" data-token="${r.token_id}"><b>#${i+1}</b><img src="${imageUrl(r.token_id)}" alt="WST #${r.token_id}" loading="lazy"><div><strong>TRADER #${r.token_id}</strong><br><small>${title(r.archetype)} · ${r.trades_count} trades</small></div>${primary}</a>`;
  }).join("");
  document.querySelectorAll("#leaderboard [data-token]").forEach(row=>row.addEventListener("click",async event=>{
    event.preventDefault();const id=Number(row.dataset.token);$("token-input").value=id;if(await loadTrader(id))showPanel("profile");
  }));
}

function setRankingsControls(){
  document.querySelectorAll("[data-rank-sort]").forEach(btn=>btn.classList.toggle("active",btn.dataset.rankSort===rankingsState.sort));
  document.querySelectorAll("[data-rank-metric]").forEach(btn=>btn.classList.toggle("active",btn.dataset.rankMetric===rankingsState.metric));
  document.querySelectorAll("[data-rank-limit]").forEach(btn=>btn.classList.toggle("active",Number(btn.dataset.rankLimit)===rankingsState.limit));
  const metricBar=document.querySelector(".rankings-metric");
  if(metricBar)metricBar.style.opacity=rankingsState.sort==="active"?"0.55":"1";
  const title=$("rankings-title");
  if(title)title.textContent=rankingsState.sort==="gainers"?"TOP GAINERS":rankingsState.sort==="losers"?"TOP LOSERS":"MOST ACTIVE";
  const label=$("rankings-metric-label");
  if(label)label.textContent=rankingsState.metric==="realized"?"REALIZED P&L":"VIRTUAL USD";
}

async function loadRankings(){
  setRankingsControls();
  if(rankingsState.loading)return;
  rankingsState.loading=true;
  const root=$("leaderboard");
  if(root&&!rankingsState.items.length)root.innerHTML='<p class="loading">Loading standings…</p>';
  try{
    const data=await request({
      rankings:"1",
      sort:rankingsState.sort,
      metric:rankingsState.metric,
      limit:String(rankingsState.limit)
    });
    rankingsState.items=Array.isArray(data.rankings)?data.rankings:[];
    renderLeaderboard(rankingsState.items,{sort:rankingsState.sort,metric:rankingsState.metric});
  }catch{
    if(root)root.innerHTML='<p class="loading">Standings temporarily unavailable.</p>';
  }finally{rankingsState.loading=false;setRankingsControls()}
}

function renderCardsStrip(overview,activityHeadline){
  const root=$("cards-strip");if(!root)return;
  const prices=Array.isArray(overview?.prices)?overview.prices:[];
  const lb=Array.isArray(overview?.leaderboard)?overview.leaderboard:[];
  let topMover=null;
  for(const p of prices){
    const hit=priceOf(p.symbol)||{price:Number(p.price),changePct:null};
    const chg=hit.changePct;
    if(chg==null)continue;
    if(!topMover||Math.abs(chg)>Math.abs(topMover.changePct))topMover={symbol:String(p.symbol).toUpperCase(),price:Number(p.price),changePct:chg};
  }
  if(!topMover&&prices[0]){
    topMover={symbol:String(prices[0].symbol).toUpperCase(),price:Number(prices[0].price),changePct:null};
  }
  const gainer=lb[0]||null;
  let loser=overview?._loser||null;
  if(!loser&&lb.length>1){
    loser=[...lb].sort((a,b)=>Number(a.total_value)-Number(b.total_value))[0];
  }
  const cycles=overview?.cycles??"—";
  const cards=[];
  if(topMover){
    cards.push(`<article class="pulse-card"><span>TOP MOVER</span><strong>${escapeHtml(topMover.symbol)}</strong><b>${money.format(topMover.price)}</b>${topMover.changePct!=null?`<em class="${clsPnL(topMover.changePct)}">${pct(topMover.changePct)}</em>`:`<em class="muted">SPOT</em>`}</article>`);
  }
  if(gainer){
    const ret=gainer.return_pct!=null?Number(gainer.return_pct):(Number(gainer.total_value)/STARTING_BALANCE-1)*100;
    cards.push(`<button type="button" class="pulse-card" data-open-trader="${gainer.token_id}"><span>#1 GAINER DNA</span><strong>TRADER #${gainer.token_id}</strong><b>${money.format(Number(gainer.total_value))}</b><em class="${clsPnL(ret)}">${pct(ret)}</em></button>`);
  }
  if(loser&&(!gainer||loser.token_id!==gainer.token_id)){
    const ret=loser.return_pct!=null?Number(loser.return_pct):(Number(loser.total_value)/STARTING_BALANCE-1)*100;
    cards.push(`<button type="button" class="pulse-card loser" data-open-trader="${loser.token_id}"><span>#1 LOSER DNA</span><strong>TRADER #${loser.token_id}</strong><b>${money.format(Number(loser.total_value))}</b><em class="${clsPnL(ret)}">${pct(ret)}</em></button>`);
  }
  cards.push(`<article class="pulse-card"><span>ENGINE CYCLES</span><strong>${escapeHtml(String(cycles))}</strong><b>COMPLETED</b><em class="muted">BETA-1</em></article>`);
  if(activityHeadline){
    cards.push(`<button type="button" class="pulse-card" data-panel-jump="activity"><span>LATEST ACTIVITY</span><strong>${escapeHtml(activityHeadline.action)} ${escapeHtml(activityHeadline.symbol||"")}</strong><b>TRADER #${escapeHtml(String(activityHeadline.token_id))}</b><em class="muted">${escapeHtml(title(activityHeadline.reason_code)||"")}</em></button>`);
  }
  root.innerHTML=cards.join("")||'<p class="loading">Snapshot unavailable.</p>';
}

async function loadOverview(){
  try{
    const data=await getOverview();
    $("asset-count").textContent=data.assets;$("cycle-count").textContent=data.cycles;
    if(Array.isArray(data.prices)){ingestPrices(data.prices);renderMarketCards(data.prices)}
    // seed rankings from overview if still default
    if(!rankingsState.items.length&&Array.isArray(data.leaderboard)){
      rankingsState.items=data.leaderboard;
      renderLeaderboard(rankingsState.items,{sort:"gainers",metric:"equity"});
    }
    let headline=null;
    try{
      const act=await request({activity:"1",limit:"1"});
      if(Array.isArray(act.activity)&&act.activity[0])headline=act.activity[0];
    }catch{}
    // Prefer true #1 loser via rankings when cheap
    try{
      const losers=await request({rankings:"1",sort:"losers",metric:"equity",limit:"1"});
      if(Array.isArray(losers.rankings)&&losers.rankings[0]){
        data._loser=losers.rankings[0];
      }
    }catch{}
    renderCardsStrip(data,headline?{action:String(headline.action||"").toUpperCase(),symbol:headline.symbol,token_id:headline.token_id,reason_code:headline.reason_code}:null);
    renderFollowedStrip();
  }catch{
    const root=$("leaderboard");
    if(root)root.innerHTML='<p class="loading">Standings temporarily unavailable.</p>';
    const strip=$("cards-strip");
    if(strip)strip.innerHTML='<p class="loading">Snapshot temporarily unavailable.</p>';
  }
}

function sellPnLChip(row){
  const exit=row.exit_details;
  if(!exit||String(row.action||"").toLowerCase()!=="sell")return"";
  const pnl=Number(exit.realized_pnl);
  const ret=Number(exit.return_pct);
  if(!Number.isFinite(pnl))return"";
  const retTxt=Number.isFinite(ret)?` · ${pct(ret)}`:"";
  return `<span class="pnl-chip ${clsPnL(pnl)}">${money.format(pnl)}${retTxt}</span>`;
}
function renderActivity(items){
  const root=$("activity-list");root.replaceChildren();
  root.classList.toggle("compact-view",activityState.view==="compact");
  $("activity-count").textContent=`${items.length} ${items.length===1?"DECISION":"DECISIONS"} LOADED`;
  if(!items.length){const empty=document.createElement("p");empty.className="loading";empty.textContent="No decisions have been recorded yet.";root.append(empty);return}
  for(const row of items){
    const id=Number(row.token_id);
    if(!Number.isInteger(id)||id<1||id>444)continue;
    const action=String(row.action||"HOLD").toLowerCase();
    const holdLabel=action==="hold"?"CONDITION CHECKED · NO TRADE":action.toUpperCase();
    const wrap=document.createElement("div");
    wrap.className="activity-ticket-row";
    wrap.innerHTML=`
      <a class="activity-row" href="?trader=${id}">
        <img src="${imageUrl(id)}" alt="WST #${id}" loading="lazy">
        <span class="activity-trader">TRADER #${id}</span>
        <span class="activity-action ${["buy","sell","hold"].includes(action)?action:""}">${escapeHtml(action==="hold"?holdLabel:action.toUpperCase())} ${escapeHtml(safe(row.symbol,""))}</span>
        <span class="activity-reason">${escapeHtml(title(row.reason_code))}${sellPnLChip(row)}</span>
        <time class="activity-time"></time>
      </a>
      ${activityState.view==="tickets"?`<div class="activity-mini-ticket">${renderDecisionTicket(row,{compact:true})}</div>`:""}`;
    const stamp=wrap.querySelector("time");
    const date=new Date(row.decided_at);
    if(!Number.isNaN(date.getTime())){stamp.dateTime=date.toISOString();stamp.textContent=date.toLocaleString(undefined,{dateStyle:"short",timeStyle:"medium"})}
    else stamp.textContent="TIME UNAVAILABLE";
    wrap.querySelector("a").addEventListener("click",async event=>{
      event.preventDefault();$("token-input").value=id;if(await loadTrader(id))showPanel("profile");
    });
    root.append(wrap);
  }
}
function setActivityControls(){
  document.querySelectorAll("[data-activity-action]").forEach(button=>button.classList.toggle("active",button.dataset.activityAction===activityState.action));
  document.querySelectorAll("[data-activity-view]").forEach(button=>button.classList.toggle("active",button.dataset.activityView===activityState.view));
  const loadMore=$("load-more-activity");loadMore.hidden=!activityState.hasMore;loadMore.disabled=activityState.loading;loadMore.textContent=activityState.loading?"LOADING…":"LOAD MORE ↓";
}
async function loadActivity({reset=false}={}){
  if(activityState.loading||document.hidden||!$("activity").classList.contains("active-panel"))return;
  if(reset){activityState.cursor=null;activityState.hasMore=false;activityState.items=[];renderActivity([])}
  activityState.loading=true;setActivityControls();$("activity-status").textContent="LOADING…";
  try{
    const params={activity:"1",action:activityState.action,limit:String(ACTIVITY_PAGE_SIZE)};
    if(activityState.cursor)params.before=activityState.cursor;
    if(activityState.tokenId)params.token_id=String(activityState.tokenId);
    if(activityState.symbol)params.symbol=String(activityState.symbol).toUpperCase();
    const data=await request(params);
    if(!Array.isArray(data.activity))throw new Error("Invalid activity response");
    activityState.items=reset?data.activity:[...activityState.items,...data.activity];activityState.cursor=data.next_cursor||null;activityState.hasMore=Boolean(data.has_more);renderActivity(activityState.items);
    $("activity-status").textContent=`UPDATED ${new Date().toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
  }catch{
    $("activity-status").textContent="UPDATES UNAVAILABLE";
    if(!activityState.items.length)$("activity-list").innerHTML='<p class="loading">Activity is temporarily unavailable. Please try again later.</p>';
  }finally{activityState.loading=false;setActivityControls()}
}


/* ── Structured Scan of 444 ── */
function setScanControls(){
  document.querySelectorAll("[data-scan-sort]").forEach(btn=>btn.classList.toggle("active",btn.dataset.scanSort===scanState.sort));
  document.querySelectorAll("[data-scan-metric]").forEach(btn=>btn.classList.toggle("active",btn.dataset.scanMetric===scanState.metric));
  document.querySelectorAll("[data-scan-limit]").forEach(btn=>btn.classList.toggle("active",Number(btn.dataset.scanLimit)===scanState.limit));
  const status=$("scan-status");
  if(status&&!scanState.loading)status.textContent=scanState.items.length?`MATCHED ${scanState.matched}`:"READY";
}
function renderScanResults(items,{sort="gainers",metric="equity"}={}){
  const root=$("scan-results");if(!root)return;
  const count=$("scan-count");if(count)count.textContent=String(items.length);
  if(!items.length){root.innerHTML='<p class="loading">No traders matched these filters.</p>';return}
  const loserMode=sort==="losers";
  root.innerHTML=items.map((r,i)=>{
    const ret=r.return_pct!=null?Number(r.return_pct):(Number(r.total_value)/STARTING_BALANCE-1)*100;
    const realized=Number(r.realized_pnl||0);
    const primary=metric==="realized"
      ?`<strong class="${realized>=0?"gain":"loss"}">${money.format(realized)}</strong><b class="${realized>=0?"gain":"loss"}">${pct(ret)}</b>`
      :`<strong>${money.format(Number(r.total_value))}</strong><b class="${ret>=0?"gain":"loss"}">${pct(ret)}</b>`;
    return `<a class="leader-row ${loserMode?"loser-row":""}" href="?trader=${r.token_id}" data-token="${r.token_id}"><b>#${i+1}</b><img src="${imageUrl(r.token_id)}" alt="WST #${r.token_id}" loading="lazy"><div><strong>TRADER #${r.token_id}</strong><br><small>${title(r.archetype)} · ${r.trades_count} trades</small></div>${primary}</a>`;
  }).join("");
  document.querySelectorAll("#scan-results [data-token]").forEach(row=>row.addEventListener("click",async event=>{
    event.preventDefault();const id=Number(row.dataset.token);$("token-input").value=id;if(await loadTrader(id))showPanel("profile");
  }));
}
function clientFilterRankings(rows){
  let mapped=[...(rows||[])];
  const arch=(scanState.archetype||"").toLowerCase();
  if(arch)mapped=mapped.filter(r=>String(r.archetype||"").toLowerCase()===arch);
  const minR=scanState.minReturn===""?null:Number(scanState.minReturn);
  const maxR=scanState.maxReturn===""?null:Number(scanState.maxReturn);
  const minT=scanState.minTrades===""?0:Number(scanState.minTrades);
  if(Number.isFinite(minR))mapped=mapped.filter(r=>{
    const ret=r.return_pct!=null?Number(r.return_pct):(Number(r.total_value)/STARTING_BALANCE-1)*100;
    return ret>=minR;
  });
  if(Number.isFinite(maxR))mapped=mapped.filter(r=>{
    const ret=r.return_pct!=null?Number(r.return_pct):(Number(r.total_value)/STARTING_BALANCE-1)*100;
    return ret<=maxR;
  });
  if(Number.isFinite(minT)&&minT>0)mapped=mapped.filter(r=>Number(r.trades_count||0)>=minT);
  mapped.sort((a,b)=>{
    if(scanState.sort==="active"){
      const ta=Number(a.trades_count||0),tb=Number(b.trades_count||0);
      if(tb!==ta)return tb-ta;
      return Number(b.total_value||0)-Number(a.total_value||0);
    }
    if(scanState.metric==="realized"){
      const ra=Number(a.realized_pnl||0),rb=Number(b.realized_pnl||0);
      return scanState.sort==="losers"?ra-rb:rb-ra;
    }
    const ea=Number(a.total_value||0),eb=Number(b.total_value||0);
    return scanState.sort==="losers"?ea-eb:eb-ea;
  });
  return mapped;
}
async function loadScan(){
  setScanControls();
  if(scanState.loading)return;
  scanState.loading=true;
  const status=$("scan-status");
  if(status)status.textContent="SCANNING…";
  const root=$("scan-results");
  if(root)root.innerHTML='<p class="loading">Scanning paper traders…</p>';
  const archEl=$("scan-archetype");
  const minEl=$("scan-min-return");
  const maxEl=$("scan-max-return");
  const tradesEl=$("scan-min-trades");
  scanState.archetype=archEl?.value||"";
  scanState.minReturn=minEl?.value?.trim()||"";
  scanState.maxReturn=maxEl?.value?.trim()||"";
  scanState.minTrades=tradesEl?.value?.trim()||"";
  try{
    const params={scan:"1",sort:scanState.sort,metric:scanState.metric,limit:String(scanState.limit)};
    if(scanState.archetype)params.archetype=scanState.archetype;
    if(scanState.minReturn!=="")params.min_return_pct=scanState.minReturn;
    if(scanState.maxReturn!=="")params.max_return_pct=scanState.maxReturn;
    if(scanState.minTrades!=="")params.min_trades=scanState.minTrades;
    const data=await request(params);
    scanState.backend=true;
    scanState.items=Array.isArray(data.rankings)?data.rankings:[];
    scanState.matched=Number(data.total_matched??scanState.items.length);
    renderScanResults(scanState.items,{sort:scanState.sort,metric:scanState.metric});
    if(status)status.textContent=`MATCHED ${scanState.matched} · SHOWING ${scanState.items.length}`;
  }catch{
    // Fallback: client filter on rankings=50
    scanState.backend=false;
    try{
      const data=await request({rankings:"1",sort:scanState.sort,metric:scanState.metric,limit:"50"});
      const filtered=clientFilterRankings(Array.isArray(data.rankings)?data.rankings:[]);
      scanState.matched=filtered.length;
      scanState.items=filtered.slice(0,scanState.limit);
      renderScanResults(scanState.items,{sort:scanState.sort,metric:scanState.metric});
      if(status)status.textContent=`CLIENT FILTER · ${scanState.matched} (backend scan follow-up)`;
    }catch{
      if(root)root.innerHTML='<p class="loading">Scan temporarily unavailable.</p>';
      if(status)status.textContent="UNAVAILABLE";
    }
  }finally{scanState.loading=false;setScanControls()}
}

const navButtons=[...document.querySelectorAll(".autonomous-nav button")];
function showPanel(id){
  document.querySelectorAll(".workspace-content>.page-panel").forEach(panel=>panel.classList.toggle("active-panel",panel.id===id));
  navButtons.forEach(button=>button.setAttribute("aria-selected",String(button.dataset.panel===id)));
  if(id==="activity"&&!activityState.items.length)loadActivity({reset:true});
  if(id==="rankings")loadRankings();
  if(id==="scan"&&!scanState.items.length)loadScan();
  window.scrollTo({top:$("main-content").offsetTop,behavior:"smooth"});
}
navButtons.forEach(button=>button.addEventListener("click",()=>showPanel(button.dataset.panel)));

$("search-form").addEventListener("submit",async event=>{event.preventDefault();const id=Number($("token-input").value);if(id>=1&&id<=444){if(await loadTrader(id))showPanel("profile")}else $("status").textContent="Enter a token ID between 1 and 444."});
const initial=new URLSearchParams(location.search).get("trader");
if(initial&&Number(initial)>=1&&Number(initial)<=444){$("token-input").value=initial;loadTrader(initial,{updateUrl:false}).then(success=>{if(success)showPanel("profile")})}
else loadTrader(DEFAULT_TRADER_ID,{updateUrl:false,scroll:false,keepVisible:true});
loadPrices();
loadOverview();
renderWatchlist();
setInterval(()=>{if(activityState.items.length<=ACTIVITY_PAGE_SIZE)loadActivity({reset:true})},30000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&activityState.items.length<=ACTIVITY_PAGE_SIZE)loadActivity({reset:true})});
document.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>{if(historyState.loading)return;historyState.action=button.dataset.action;loadDecisionHistory({reset:true})}));
$("load-more-decisions").addEventListener("click",()=>loadDecisionHistory());
document.querySelectorAll("[data-activity-action]").forEach(button=>button.addEventListener("click",()=>{if(activityState.loading)return;activityState.action=button.dataset.activityAction;loadActivity({reset:true})}));
$("load-more-activity").addEventListener("click",()=>loadActivity());

/* Delegated clicks: watch, asset drawer, market cards, compare */
document.addEventListener("click",async e=>{
  const unwatch=e.target.closest("[data-unwatch]");
  if(unwatch){e.preventDefault();e.stopPropagation();toggleWatch(unwatch.dataset.unwatch);return}
  const unfollow=e.target.closest("[data-unfollow]");
  if(unfollow){e.preventDefault();e.stopPropagation();toggleFollowDna(Number(unfollow.dataset.unfollow));return}
  const jump=e.target.closest("[data-panel-jump]");
  if(jump){e.preventDefault();showPanel(jump.dataset.panelJump);return}
  const watchBtn=e.target.closest("[data-watch-symbol]");
  if(watchBtn){e.preventDefault();e.stopPropagation();toggleWatch(watchBtn.dataset.watchSymbol);return}
  const openAsset=e.target.closest("[data-open-asset]");
  if(openAsset){e.preventDefault();openAssetDrawer(openAsset.dataset.openAsset);return}
  const market=e.target.closest("[data-market-symbol]");
  if(market){
    e.preventDefault();
    const sym=market.dataset.marketSymbol;
    showPanel("activity");
    activityState.action="all";
    await loadActivity({reset:true});
    openAssetDrawer(sym);
    return;
  }
  const openTrader=e.target.closest("[data-open-trader]");
  if(openTrader){
    e.preventDefault();
    const id=Number(openTrader.dataset.openTrader);
    closeCompare();
    $("token-input").value=id;
    if(await loadTrader(id))showPanel("profile");
  }
});

$("drawer-close")?.addEventListener("click",closeAssetDrawer);
$("drawer-backdrop")?.addEventListener("click",closeAssetDrawer);
$("drawer-watch-btn")?.addEventListener("click",()=>{const sym=$("drawer-watch-btn").dataset.symbol;if(sym)toggleWatch(sym)});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeAssetDrawer();closeCompare()}});

$("compare-from-profile")?.addEventListener("click",()=>openCompare(profileCache.tokenId?[profileCache.tokenId]:[]));
$("compare-from-rankings")?.addEventListener("click",()=>openCompare([]));
$("compare-close")?.addEventListener("click",closeCompare);
$("compare-backdrop")?.addEventListener("click",closeCompare);
$("compare-form")?.addEventListener("submit",e=>{
  e.preventDefault();
  const ids=[$("compare-a").value,$("compare-b").value,$("compare-c").value]
    .map(v=>Number(v)).filter(n=>Number.isInteger(n)&&n>=1&&n<=444);
  if(!ids.length){$("compare-grid").innerHTML='<p class="loading">Enter at least one token ID (1–444).</p>';return}
  runCompare(ids);
});

/* Wave 1+ rankings / activity / follow / spectator */
document.querySelectorAll("[data-rank-sort]").forEach(btn=>btn.addEventListener("click",()=>{
  if(rankingsState.loading)return;
  rankingsState.sort=btn.dataset.rankSort;
  loadRankings();
}));
document.querySelectorAll("[data-rank-metric]").forEach(btn=>btn.addEventListener("click",()=>{
  if(rankingsState.loading)return;
  rankingsState.metric=btn.dataset.rankMetric;
  loadRankings();
}));
document.querySelectorAll("[data-rank-limit]").forEach(btn=>btn.addEventListener("click",()=>{
  if(rankingsState.loading)return;
  rankingsState.limit=Number(btn.dataset.rankLimit)||10;
  loadRankings();
}));
document.querySelectorAll("[data-activity-view]").forEach(btn=>btn.addEventListener("click",()=>{
  activityState.view=btn.dataset.activityView==="compact"?"compact":"tickets";
  setActivityControls();
  renderActivity(activityState.items);
}));
$("activity-apply-filters")?.addEventListener("click",()=>{
  const tokenRaw=$("activity-token-filter")?.value?.trim()||"";
  const symRaw=$("activity-symbol-filter")?.value?.trim()||"";
  let tokenId="";
  if(tokenRaw){
    const n=Number(tokenRaw);
    if(!Number.isInteger(n)||n<1||n>444){$("activity-status").textContent="TOKEN ID MUST BE 1–444";return}
    tokenId=String(n);
  }
  const symbol=symRaw.toUpperCase().replace(/[^A-Z0-9.\-]/g,"").slice(0,16);
  activityState.tokenId=tokenId;
  activityState.symbol=symbol;
  loadActivity({reset:true});
});
$("follow-dna-btn")?.addEventListener("click",()=>{
  const id=Number($("follow-dna-btn").dataset.tokenId||profileCache.tokenId);
  if(id)toggleFollowDna(id);
});
$("spectator-pause-btn")?.addEventListener("click",()=>{
  const id=profileCache.tokenId;if(id)setAgentPaused(id,true);
});
$("spectator-resume-btn")?.addEventListener("click",()=>{
  const id=profileCache.tokenId;if(id)setAgentPaused(id,false);
});
renderFollowedStrip();
setRankingsControls();
setScanControls();

/* Wave 2: chart holds toggle, DCA, scan */
$("show-holds-toggle")?.addEventListener("change",e=>{
  showHoldsMarkers=!!e.target.checked;
  renderEquityChart(equityState.span||"ALL");
});
document.querySelectorAll("[data-dca-mode]").forEach(btn=>btn.addEventListener("click",()=>{
  const id=profileCache.tokenId;if(id)setDcaMode(id,btn.dataset.dcaMode);
}));
document.querySelectorAll("[data-scan-sort]").forEach(btn=>btn.addEventListener("click",()=>{
  if(scanState.loading)return;
  scanState.sort=btn.dataset.scanSort;
  setScanControls();
}));
document.querySelectorAll("[data-scan-metric]").forEach(btn=>btn.addEventListener("click",()=>{
  if(scanState.loading)return;
  scanState.metric=btn.dataset.scanMetric;
  setScanControls();
}));
document.querySelectorAll("[data-scan-limit]").forEach(btn=>btn.addEventListener("click",()=>{
  if(scanState.loading)return;
  scanState.limit=Number(btn.dataset.scanLimit)||25;
  setScanControls();
}));
$("scan-run-btn")?.addEventListener("click",()=>loadScan());
