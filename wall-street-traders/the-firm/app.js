const META_URL = "../trading-floor/data/metadata.csv";
const IMAGE_ROOT = "../trading-floor/traders/";
const PROFILE_ROOT = "../trading-floor/trader/";
const VISIBLE_DESKS = 12;
const CYCLE_MS = 15 * 60 * 1000;
const assets = ["HOOD","NVDA","AAPL","TSLA","QQQ","SPY","AMZN","META","MSFT","GOOGL"];
const roles = ["Tech Trader","Equity Analyst","Market Maker","Portfolio Manager","Risk Officer","Macro Trader","ETF Specialist","Contrarian Trader"];
const actions = ["researching","buying","holding","selling","calling","celebrating"];
const moods = ["Focused","Confident","Cautious","Patient","Alert","Convicted"];
const quotes = ["Watching tech…","Solid volume today.","Patience pays.","Risk first.","Let it run.","Checking the tape.","No trade is a trade.","Position secured."];
let records = [];

function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rand(seed,min=0,max=1){const x=Math.sin(seed*12.9898+78.233)*43758.5453;return min+(x-Math.floor(x))*(max-min)}
function pick(list,seed){return list[Math.floor(rand(seed,0,list.length))%list.length]}
function cycle(){return Math.floor(Date.now()/CYCLE_MS)}
function dayKey(){const d=new Date();return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`}
function parseCSV(text){const rows=[];let row=[],cell="",quoted=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&quoted&&n==='"'){cell+='"';i++}else if(c==='"'){quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=""}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=""}else cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}const headers=rows.shift();return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]||""])))}
function agentFor(record,key=cycle()){
  const id=Number(record.tokenID),base=hash(`${id}:${key}`),day=hash(`${id}:${dayKey()}`);
  const focus=pick(assets,hash(`${id}:focus`));
  const pnl=rand(day,-5.8,9.4);
  const action=pick(actions,base);
  return {id,record,focus,pnl,action,role:pick(roles,hash(`${id}:${record["attributes[Rarity Tier]"]}`)),mood:pick(moods,base+7),quote:pick(quotes,base+19),balance:10000*(1+pnl/100),holdings:[focus,pick(assets,base+31),pick(assets,base+67)].filter((v,i,a)=>a.indexOf(v)===i)};
}
function fmtPct(n){return `${n>=0?"+":""}${n.toFixed(2)}%`}
function renderTicker(){const ticks=[["SPY",534.21,1.26],["QQQ",456.03,1.12],["AAPL",189.32,.84],["TSLA",176.21,-1.08],["NVDA",902.14,2.31]];const html=ticks.map(([s,p,c])=>`<span class="ticker-item"><b>${s}</b>${p.toFixed(2)} <em class="${c>=0?"up":"down"}">${c>=0?"▲":"▼"} ${fmtPct(c)}</em></span>`).join("");document.querySelector("#tickerTrack").innerHTML=html+html}
function visibleAgents(){const start=hash(String(cycle()))%records.length;return Array.from({length:VISIBLE_DESKS},(_,i)=>agentFor(records[(start+i*17)%records.length]))}
function renderDesks(){const agents=visibleAgents();const grid=document.querySelector("#deskGrid");grid.innerHTML=agents.map((a,i)=>`<article class="desk action-${a.action}" data-id="${a.id}" tabindex="0" aria-label="Open WST #${a.id}">${i%3===0?`<span class="bubble">${a.quote}</span>`:""}<span class="action-dot">${a.pnl>=0?"↗":"↘"}</span><div class="agent"><div class="body"></div><div class="tie"></div><div class="head-window"><img src="${IMAGE_ROOT}${a.id}.png" alt="WST #${a.id}"></div></div><div class="screen"></div><div class="counter"><b>#${a.id}</b></div></article>`).join("");grid.querySelectorAll(".desk").forEach(el=>{const open=()=>selectAgent(agentFor(records.find(r=>Number(r.tokenID)===Number(el.dataset.id))));el.addEventListener("click",open);el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}})});selectAgent(agents[0])}
function selectAgent(a){document.querySelectorAll(".desk").forEach(d=>d.classList.toggle("active",Number(d.dataset.id)===a.id));document.querySelector("#selectedId").textContent=`WST #${a.id}`;document.querySelector("#selectedRole").textContent=a.role.toUpperCase();document.querySelector("#selectedMood").textContent=a.mood;document.querySelector("#selectedBalance").textContent=a.balance.toLocaleString("en-US",{style:"currency",currency:"USD"});const p=document.querySelector("#selectedPnl");p.textContent=fmtPct(a.pnl);p.className=a.pnl>=0?"up":"down";document.querySelector("#selectedFocus").textContent=a.focus;document.querySelector("#selectedHoldings").innerHTML=a.holdings.map(x=>`<i>${x}</i>`).join("");document.querySelector("#selectedProfile").href=`${PROFILE_ROOT}${a.id}/`}
function dailyBoard(){return records.map(r=>agentFor(r)).sort((a,b)=>b.pnl-a.pnl).slice(0,5)}
function renderBoard(){document.querySelector("#leaderboardList").innerHTML=dailyBoard().map((a,i)=>`<li><b>${i+1}</b><span>WST #${a.id}</span><b>${fmtPct(a.pnl)}</b></li>`).join("")}
function renderEvents(){const agents=visibleAgents().slice(0,6);document.querySelector("#eventCycle").textContent=`CYCLE ${String(cycle()%1000).padStart(3,"0")}`;document.querySelector("#eventList").innerHTML=agents.map((a,i)=>{const m=new Date(Date.now()-i*3*60000).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:false});const verb=a.action==="selling"?"trimmed":a.action==="buying"?"added":a.action==="celebrating"?"locked a gain in":"reviewed";return `<li class="${a.pnl<0?"loss":""}"><time>${m}</time><i>${a.pnl>=0?"▲":"▽"}</i><span>WST #${a.id} ${verb} ${a.focus}</span></li>`}).join("")}
function tick(){const now=new Date();document.querySelector("#marketClock").textContent=now.toLocaleString("en-US",{timeZone:"America/New_York",weekday:"short",hour:"2-digit",minute:"2-digit",second:"2-digit"})+" ET";const remain=CYCLE_MS-Date.now()%CYCLE_MS,m=Math.floor(remain/60000),s=Math.floor(remain%60000/1000);document.querySelector("#cycleLabel").textContent=`NEXT DECISION IN ${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
async function init(){renderTicker();tick();setInterval(tick,1000);try{const res=await fetch(META_URL);if(!res.ok)throw new Error("Metadata unavailable");records=parseCSV(await res.text()).filter(r=>r.tokenID);renderDesks();renderBoard();renderEvents();let last=cycle();setInterval(()=>{if(cycle()!==last){last=cycle();renderDesks();renderBoard();renderEvents()}},5000)}catch(err){document.querySelector("#deskGrid").innerHTML=`<p style="padding:30px">Unable to load WST metadata. Run this page through GitHub Pages or a local web server.</p>`}}
init();
