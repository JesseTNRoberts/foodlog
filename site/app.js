(() => {
"use strict";
const app = document.getElementById("app");
const MEALS = [["breakfast","Breakfast","--m4"],["lunch","Lunch","--m1"],["dinner","Dinner","--m2"],["snacks","Snacks","--m3"]];
const NUMS = ["kcal","lo","hi","protein","carbs","fat","satfat","fiber","sugar","addedSugar","sodium","cholesterol"];
const MICRO = [["vitA","Vitamin A","mcg",900],["vitC","Vitamin C","mg",90],["vitD","Vitamin D","mcg",20],["vitE","Vitamin E","mg",15],
  ["vitK","Vitamin K","mcg",120],["b6","Vitamin B6","mg",1.7],["b12","Vitamin B12","mcg",2.4],["folate","Folate","mcg",400],
  ["calcium","Calcium","mg",1300],["iron","Iron","mg",18],["magnesium","Magnesium","mg",420],["potassium","Potassium","mg",4700],["zinc","Zinc","mg",11]];
const METRICS = [["kcal","Calories","kcal"],["protein","Protein","g"],["carbs","Carbs","g"],["fat","Fat","g"],["fiber","Fiber","g"],
  ["sugar","Sugar","g"],["addedSugar","Added sugar","g"],["satfat","Saturated fat","g"],["sodium","Sodium","mg"],["cholesterol","Cholesterol","mg"],
  ...MICRO.map(([k,l,u])=>["m:"+k,l,u])];
const COMP_COLORS = ["#14a38b","#4a7fe0","#c25bb0","#e3a22c","#5aa14a","#d9653f","#7f6fe0","#2fa9c9","#a0884a","#d24f78"];

let DATA = { settings:{}, days:[], recipes:[] };
let byDate = new Map();
let charts = [];

const pad = n => String(n).padStart(2,"0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dateOf = k => { const [y,m,d]=k.split("-").map(Number); return new Date(y,m-1,d); };
const addDays = (k,n) => { const d=dateOf(k); d.setDate(d.getDate()+n); return keyOf(d); };
const todayKey = () => keyOf(new Date());
const num = v => Number.isFinite(+v) ? +v : 0;
const fmt = (n,dp=0) => (Math.round(num(n)*10**dp)/10**dp).toLocaleString(undefined,{maximumFractionDigits:dp});
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const prettyDate = (k,opts={weekday:"long",month:"long",day:"numeric"}) => dateOf(k).toLocaleDateString(undefined,opts);

/* ---------- math ---------- */
function totals(entries){
  const t={micros:{},n:entries.length}; NUM_FIELDS_INIT(t);
  for(const e of entries){ const s=num(e.servings||1);
    for(const f of NUMS) t[f]+=num(e[f] ?? (f==="lo"||f==="hi"?e.kcal:0))*s;
    for(const k in (e.micros||{})) t.micros[k]=(t.micros[k]||0)+num(e.micros[k])*s; }
  return t;
}
function NUM_FIELDS_INIT(t){ for(const f of NUMS) t[f]=0; }
const dayEntries = k => byDate.get(k)?.entries || [];
const metricVal = (t,m) => m.startsWith("m:") ? num(t.micros[m.slice(2)]) : num(t[m]);
function loggedBefore(k,n){ return DATA.days.filter(d=>d.date<k && d.entries.length).slice(-n); }

/* ---------- shared pieces ---------- */
function destroyCharts(){ charts.forEach(c=>c.destroy()); charts=[]; }
function chartDefaults(){
  if(!window.Chart) return false;
  Chart.defaults.font.family = css("--body"); Chart.defaults.font.size = 12;
  Chart.defaults.color = css("--muted"); Chart.defaults.borderColor = css("--line");
  Chart.defaults.plugins.legend.labels.boxWidth = 10; Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.tooltip.backgroundColor = css("--ink"); Chart.defaults.plugins.tooltip.titleColor = css("--surface");
  Chart.defaults.plugins.tooltip.bodyColor = css("--surface"); Chart.defaults.maintainAspectRatio = false;
  return true;
}
function toast(msg){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); }
function editUrl(date){ const repo=DATA.settings.repo; return repo?`https://github.com/${repo}/edit/main/entries/${date.slice(0,4)}/${date}.json`:null; }
function kpi(label,value,unit,target,opts={}){
  const pct = target? Math.min(100, value/target*100):0;
  const color = opts.color || (opts.limit ? (value>target?"var(--over)":"var(--accent)") : "var(--accent)");
  return `<div class="kpi"><div class="l">${label}</div>
    <div class="v">${fmt(value)}<small> ${unit}${target?` / ${fmt(target)}`:""}</small></div>
    ${target?`<div class="meter"><i style="width:${pct}%;background:${color}"></i></div>`:""}
    <div class="foot"><span>${opts.foot||""}</span>${opts.delta??""}</div></div>`;
}
function deltaPill(cur,avg,higherIsGood){
  if(!avg) return `<span class="pill">no history</span>`;
  const d=(cur-avg)/avg*100; if(Math.abs(d)<3) return `<span class="pill">≈ 7-day avg</span>`;
  const good = higherIsGood==null?null:(d>0)===higherIsGood;
  return `<span class="pill ${good==null?"":good?"good":"warn"}">${d>0?"▲":"▼"} ${Math.abs(Math.round(d))}% vs 7-day avg</span>`;
}
function microRows(micros, scale=1){
  return MICRO.map(([k,l,u,dv])=>{
    const v=num(micros[k])/scale; const p=v/dv*100;
    const col = p>=100?"var(--good)":p>=50?"var(--accent)":p>=25?"var(--warn)":"var(--over)";
    return `<div class="mrow"><span>${l}</span><div class="bar" title="${fmt(v,1)} ${u} of ${dv} ${u}"><i style="width:${Math.min(100,p/1.5)}%;background:${col}"></i></div><span class="pct num">${fmt(p)}%</span></div>`;
  }).join("");
}

/* ---------- day view ---------- */
function renderDay(k){
  destroyCharts();
  const ents=dayEntries(k), t=totals(ents), S=DATA.settings;
  const B=num(S.budget)||1900, PG=num(S.proteinGoal)||100, FG=num(S.fiberGoal)||30, NA=num(S.sodiumLimit)||2300;
  const hist=loggedBefore(k,7).map(d=>totals(d.entries)); const avg=f=>hist.length?hist.reduce((a,x)=>a+x[f],0)/hist.length:0;
  const isToday=k===todayKey(); const firstDay=DATA.days[0]?.date;
  const left=B-t.kcal; const cal=t.protein*4+t.carbs*4+t.fat*9||1;
  const byMeal=MEALS.map(([m,l,c])=>{ const list=ents.filter(e=>e.meal===m); return {m,l,c,list,t:totals(list)}; });
  const day=byDate.get(k);

  app.innerHTML=`
  <div class="toolbar">
    <div><h1>${isToday?"Today":esc(prettyDate(k))}</h1><div class="sub">${isToday?esc(prettyDate(k)):""}${ents.length?`${isToday?" · ":""}${ents.length} entries · likely ${fmt(t.lo)}–${fmt(t.hi)} kcal`:""}</div></div>
    <div class="btns">
      <a class="btn" href="#/day/${addDays(k,-1)}" ${firstDay&&k<=firstDay?'aria-disabled="true"':""} aria-label="Previous day">‹ Prev</a>
      ${isToday?"":`<a class="btn" href="#/">Today</a>`}
      <a class="btn" href="#/day/${addDays(k,1)}" ${isToday?'aria-disabled="true"':""} aria-label="Next day">Next ›</a>
    </div>
  </div>
  ${day?.note?`<div class="daynote">${esc(day.note)}</div>`:""}
  ${!ents.length?(()=>{const last=DATA.days.filter(d=>d.entries.length&&d.date!==k).map(d=>d.date).filter(d=>d<k).pop(); return `<div class="daynote">Nothing logged for this day yet.${last?` Last logged day: <a href="#/day/${last}">${esc(prettyDate(last,{weekday:"long",month:"short",day:"numeric"}))}</a>.`:""}</div>`;})():""}
  <div class="kpis">
    ${kpi("Calories",t.kcal,"kcal",B,{limit:true,foot:left>=0?`${fmt(left)} left`:`<span style="color:var(--over)">${fmt(-left)} over</span>`,delta:deltaPill(t.kcal,avg("kcal"),null)})}
    ${kpi("Protein",t.protein,"g",PG,{color:"var(--p)",foot:`${Math.round(t.protein*4/cal*100)}% of kcal`,delta:deltaPill(t.protein,avg("protein"),true)})}
    ${kpi("Fiber",t.fiber,"g",FG,{color:"var(--fib)",foot:`${fmt(t.fiber/Math.max(1,t.kcal)*1000,1)} g / 1000 kcal`,delta:deltaPill(t.fiber,avg("fiber"),true)})}
    ${kpi("Sodium",t.sodium,"mg",NA,{limit:true,foot:`sat fat ${fmt(t.satfat)} g`,delta:deltaPill(t.sodium,avg("sodium"),false)})}
  </div>
  <div class="grid32">
    <section class="card"><div class="card-h"><h2>Where the calories came from</h2><span class="sub">by meal and entry</span></div>
      <div class="stack lg" aria-label="Calories by meal">${byMeal.filter(x=>x.t.kcal).map(x=>`<span style="width:${x.t.kcal/Math.max(1,t.kcal)*100}%;background:var(${x.c})" title="${x.l}: ${fmt(x.t.kcal)} kcal"></span>`).join("")}</div>
      <div class="legend">${byMeal.map(x=>`<span><i style="background:var(${x.c})"></i>${x.l} <b class="num">${fmt(x.t.kcal)}</b></span>`).join("")}</div>
      <div class="chartbox sm"><canvas id="cEntries"></canvas></div>
    </section>
    <section class="card"><div class="card-h"><h2>Macro split</h2><span class="sub">% of calories</span></div>
      <div class="chartbox sm"><canvas id="cMacro"></canvas></div>
      <div class="legend"><span><i style="background:var(--p)"></i>Protein <b class="num">${fmt(t.protein)} g</b></span><span><i style="background:var(--c)"></i>Carbs <b class="num">${fmt(t.carbs)} g</b></span><span><i style="background:var(--f)"></i>Fat <b class="num">${fmt(t.fat)} g</b></span><span>Sugar <b class="num">${fmt(t.sugar)} g</b></span></div>
    </section>
  </div>
  <h2 style="font-size:16px;font-weight:600;margin-top:4px">Meals</h2>
  ${byMeal.map(x=>mealCard(x,k)).join("")}
  <section class="card"><div class="card-h"><h2>Vitamins & minerals</h2><span class="sub">% of daily value · tick marks 100%</span></div>
    ${Object.keys(t.micros).length?`<div class="mlist">${microRows(t.micros)}</div>`:`<div class="muted">No micronutrient estimates for this day.</div>`}
  </section>
  <section class="card"><div class="card-h"><h2>Last 7 days</h2><span class="sub">calories vs ${fmt(B)} budget · tap a day</span></div>${weekStrip(k,B)}</section>`;

  app.querySelectorAll("[data-copy]").forEach(b=>b.onclick=async()=>{
    const txt=b.dataset.copy;
    try{ await navigator.clipboard.writeText(txt); toast("Copied. Paste it to Claude with your change."); }
    catch{ prompt("Copy this and send it to Claude with your change:",txt); }
  });

  if(!chartDefaults()) return;
  if(ents.length){
    const sorted=[...ents].sort((a,b)=>num(b.kcal)*num(b.servings||1)-num(a.kcal)*num(a.servings||1));
    const mealColor=Object.fromEntries(MEALS.map(([m,,c])=>[m,css(c)]));
    charts.push(new Chart(document.getElementById("cEntries"),{type:"bar",
      data:{labels:sorted.map(e=>e.name.length>26?e.name.slice(0,25)+"…":e.name),
        datasets:[{data:sorted.map(e=>num(e.kcal)*num(e.servings||1)),backgroundColor:sorted.map(e=>mealColor[e.meal]),borderRadius:4,barThickness:14}]},
      options:{indexAxis:"y",plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${fmt(c.raw)} kcal`}}},
        scales:{x:{grid:{color:css("--line")},ticks:{callback:v=>fmt(v)}},y:{grid:{display:false},ticks:{color:css("--ink")}}}}}));
    charts.push(new Chart(document.getElementById("cMacro"),{type:"doughnut",
      data:{labels:["Protein","Carbs","Fat"],datasets:[{data:[t.protein*4,t.carbs*4,t.fat*9].map(v=>Math.round(v/cal*100)),backgroundColor:[css("--p"),css("--c"),css("--f")],borderColor:css("--surface"),borderWidth:2}]},
      options:{cutout:"68%",plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.label}: ${c.raw}%`}}}},
      plugins:[{id:"center",afterDraw(ch){const {ctx,chartArea:a}=ch; ctx.save(); ctx.textAlign="center"; ctx.fillStyle=css("--ink"); ctx.font=`600 22px ${css("--body")}`; ctx.fillText(fmt(t.kcal),(a.left+a.right)/2,(a.top+a.bottom)/2+4); ctx.fillStyle=css("--muted"); ctx.font=`12px ${css("--body")}`; ctx.fillText("kcal",(a.left+a.right)/2,(a.top+a.bottom)/2+20); ctx.restore();}}]}));
  }
}

function mealCard(x,k){
  const url=editUrl(k);
  return `<section class="card meal"><div class="meal-h"><h2><i style="background:var(${x.c})"></i>${x.l}</h2>
    ${x.list.length?`<div class="totals"><b class="num">${fmt(x.t.kcal)}</b> kcal · P <b class="num">${fmt(x.t.protein)}</b> · C <b class="num">${fmt(x.t.carbs)}</b> · F <b class="num">${fmt(x.t.fat)}</b> g</div>`:""}</div>
    ${x.list.length?x.list.map(e=>entryBlock(e,k,url)).join(""):`<div class="empty">Nothing logged</div>`}</section>`;
}
function entryBlock(e,k,url){
  const sv=num(e.servings||1); const comps=(e.components||[]).filter(c=>num(c.kcal)>0||c.name);
  const ek=num(e.kcal)*sv; const ctot=comps.reduce((a,c)=>a+num(c.kcal),0)||1;
  const conf=e.confidence||"medium";
  const rows=comps.map((c,i)=>`<tr><td><i style="background:${COMP_COLORS[i%COMP_COLORS.length]}"></i>${esc(c.name)} <span class="por">${esc(c.portion||"")}</span></td>
    <td class="num">${fmt(num(c.kcal)*sv)}</td><td class="num">${fmt(num(c.kcal)/ctot*100)}%</td><td class="num">${fmt(num(c.protein)*sv)}</td><td class="num">${fmt(num(c.carbs)*sv)}</td><td class="num">${fmt(num(c.fat)*sv)}</td></tr>`).join("");
  const copy=`Plate Log edit, ${k}, ${e.meal}, "${e.name}" (${fmt(ek)} kcal): `;
  return `<div class="entry">
    <div class="entry-h"><div><div class="name">${esc(e.name)}</div><div class="por">${esc(e.portion||"")}${sv!==1?` · ×${sv} servings`:""}</div></div>
      <div class="kc"><b>${fmt(ek)}</b> kcal<div>${fmt(num(e.lo??e.kcal)*sv)}–${fmt(num(e.hi??e.kcal)*sv)}</div></div></div>
    ${(e.photos||[]).length?`<div class="photos">${e.photos.map(p=>`<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="Photo of ${esc(e.name)}" loading="lazy"></a>`).join("")}</div>`:""}
    ${comps.length>1?`<div class="stack" aria-label="Components by calories">${comps.map((c,i)=>`<span style="width:${num(c.kcal)/ctot*100}%;background:${COMP_COLORS[i%COMP_COLORS.length]}" title="${esc(c.name)}: ${fmt(num(c.kcal)*sv)} kcal"></span>`).join("")}</div>`:""}
    ${comps.length?`<div class="tblwrap"><table class="comps"><thead><tr><th>Component</th><th>kcal</th><th>share</th><th>P</th><th>C</th><th>F</th></tr></thead><tbody>${rows}</tbody></table></div>`:""}
    <div class="entry-f"><span><span class="pill ${conf==="low"?"warn":conf==="high"?"good":""}">${esc(conf)} confidence</span> fiber ${fmt(num(e.fiber)*sv)} g · sodium ${fmt(num(e.sodium)*sv)} mg${e.notes?` · ${esc(e.notes)}`:""}</span>
      <span class="btns"><button class="btn sm" data-copy="${esc(copy)}">Ask Claude to edit</button>${url?`<a class="btn sm" href="${url}" target="_blank" rel="noopener">Edit file</a>`:""}</span></div>
  </div>`;
}
function weekStrip(k,B){
  const end = k>addDays(todayKey(),-3)?todayKey():addDays(k,3);
  const keys=[...Array(7)].map((_,i)=>addDays(end,i-6)); const vals=keys.map(d=>totals(dayEntries(d)).kcal); const max=Math.max(B*1.15,...vals);
  return `<div class="week">${keys.map((d,i)=>{const v=vals[i];return `<a href="#/day/${d}" class="${d===k?"sel":""}" aria-label="${d}: ${fmt(v)} kcal"><span class="kv">${v?fmt(v):""}</span><span class="col ${v?(v>B?"over":"has"):""}" style="height:${v?Math.max(6,v/max*62):4}px"></span><span class="lbl">${dateOf(d).toLocaleDateString(undefined,{weekday:"short"})}</span></a>`;}).join("")}</div>`;
}

/* ---------- trends ---------- */
let trendState = { range: 30, metric: "kcal" };
function renderTrends(){
  destroyCharts();
  const S=DATA.settings, B=num(S.budget)||1900;
  const end=todayKey();
  const start = trendState.range==="all" ? (DATA.days[0]?.date||end) : addDays(end,-(trendState.range-1));
  const keys=[]; for(let d=start; d<=end; d=addDays(d,1)) keys.push(d);
  const T=keys.map(d=>totals(dayEntries(d)));
  const logged=T.map((t,i)=>({t,d:keys[i]})).filter(x=>x.t.n);
  const avg=f=>logged.length?logged.reduce((a,x)=>a+x.t[f],0)/logged.length:0;
  const microAvg={}; for(const [k] of MICRO) microAvg[k]=logged.length?logged.reduce((a,x)=>a+num(x.t.micros[k]),0)/logged.length:0;
  const under=logged.filter(x=>x.t.kcal<=B).length;
  const [mk,ml,mu]=METRICS.find(m=>m[0]===trendState.metric);
  const target = mk==="kcal"?B: mk==="protein"?num(S.proteinGoal): mk==="fiber"?num(S.fiberGoal): mk==="sodium"?num(S.sodiumLimit): mk.startsWith("m:")?MICRO.find(m=>"m:"+m[0]===mk)[3]:null;

  app.innerHTML=`
  <div class="toolbar"><div><h1>Trends</h1><div class="sub">${logged.length} logged days · ${esc(prettyDate(start,{month:"short",day:"numeric"}))} – ${esc(prettyDate(end,{month:"short",day:"numeric"}))}</div></div>
    <div class="seg" role="group" aria-label="Range">${[[7,"7D"],[30,"30D"],[90,"90D"],["all","All"]].map(([v,l])=>`<button data-range="${v}" class="${trendState.range==v?"on":""}">${l}</button>`).join("")}</div></div>
  <div class="kpis">
    ${kpi("Avg calories",avg("kcal"),"kcal",B,{limit:true,foot:`${under}/${logged.length} days within budget`})}
    ${kpi("Avg protein",avg("protein"),"g",num(S.proteinGoal),{color:"var(--p)"})}
    ${kpi("Avg fiber",avg("fiber"),"g",num(S.fiberGoal),{color:"var(--fib)"})}
    ${kpi("Avg sodium",avg("sodium"),"mg",num(S.sodiumLimit),{limit:true})}
  </div>
  <section class="card"><div class="card-h"><h2>Daily ${esc(ml.toLowerCase())}</h2>
    <select class="sel" id="metric" aria-label="Metric">${METRICS.map(([v,l])=>`<option value="${v}"${v===mk?" selected":""}>${l}</option>`).join("")}</select></div>
    <div class="chartbox"><canvas id="cMetric"></canvas></div></section>
  <div class="grid2">
    <section class="card"><div class="card-h"><h2>Calories by macro</h2><span class="sub">kcal from P / C / F</span></div><div class="chartbox"><canvas id="cMacros"></canvas></div></section>
    <section class="card"><div class="card-h"><h2>Calories by meal</h2><span class="sub">stacked per day</span></div><div class="chartbox"><canvas id="cMeals"></canvas></div></section>
  </div>
  <section class="card"><div class="card-h"><h2>Average vitamins & minerals</h2><span class="sub">% of daily value across logged days</span></div>
    ${logged.length?`<div class="mlist">${microRows(microAvg)}</div>`:`<div class="muted">Nothing logged in this range.</div>`}</section>
  <section class="card"><div class="card-h"><h2>Daily totals</h2><span class="sub">tap a row to open the day</span></div>
    <div class="tblwrap"><table class="dtable"><thead><tr><th>Date</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fiber</th><th>Sodium</th><th>Entries</th></tr></thead>
    <tbody>${[...logged].reverse().map(({t,d})=>`<tr class="link" data-day="${d}"><td>${esc(prettyDate(d,{weekday:"short",month:"short",day:"numeric"}))}</td><td class="num ${t.kcal>B?"over":""}">${fmt(t.kcal)}</td><td class="num">${fmt(t.protein)}</td><td class="num">${fmt(t.carbs)}</td><td class="num">${fmt(t.fat)}</td><td class="num">${fmt(t.fiber)}</td><td class="num ${t.sodium>num(S.sodiumLimit)?"over":""}">${fmt(t.sodium)}</td><td class="num">${t.n}</td></tr>`).join("")||`<tr><td colspan="8" class="muted">Nothing logged in this range.</td></tr>`}</tbody></table></div></section>`;

  app.querySelectorAll("[data-range]").forEach(b=>b.onclick=()=>{ const v=b.dataset.range; trendState.range=v==="all"?"all":+v; renderTrends(); });
  document.getElementById("metric").onchange=ev=>{ trendState.metric=ev.target.value; renderTrends(); };
  app.querySelectorAll("tr[data-day]").forEach(r=>r.onclick=()=>{ location.hash="#/day/"+r.dataset.day; });

  if(!chartDefaults()) return;
  const labels=keys.map(d=>dateOf(d).toLocaleDateString(undefined,{month:"short",day:"numeric"}));
  const vals=T.map(t=>t.n?metricVal(t,mk):null);
  const roll=vals.map((_,i)=>{ const w=vals.slice(Math.max(0,i-6),i+1).filter(v=>v!=null); return w.length?w.reduce((a,b)=>a+b,0)/w.length:null; });
  const acc=css("--accent"), over=css("--over");
  const isLimit = ["kcal","sodium","sugar","addedSugar","satfat","cholesterol"].includes(mk);
  const ds=[{type:"bar",label:ml,data:vals,backgroundColor:vals.map(v=>target&&isLimit&&v>target?over:acc),borderRadius:4,maxBarThickness:28,order:2},
    {type:"line",label:"7-day average",data:roll,borderColor:css("--ink"),borderWidth:2,pointRadius:0,tension:.35,spanGaps:true,order:1}];
  if(target) ds.push({type:"line",label:isLimit?"Limit":"Target",data:keys.map(()=>target),borderColor:css("--muted"),borderDash:[5,4],borderWidth:1.5,pointRadius:0,order:0});
  const grid={color:css("--line")};
  charts.push(new Chart(document.getElementById("cMetric"),{data:{labels,datasets:ds},
    options:{interaction:{mode:"index",intersect:false},plugins:{tooltip:{callbacks:{label:c=>c.raw==null?null:` ${c.dataset.label}: ${fmt(c.raw,mu==="mcg"||mu==="mg"&&c.raw<20?1:0)} ${mu}`}}},
      scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:true,grid,ticks:{callback:v=>fmt(v)}}},
      onClick:(ev,els)=>{ if(els[0]) location.hash="#/day/"+keys[els[0].index]; }}}));
  charts.push(new Chart(document.getElementById("cMacros"),{type:"bar",
    data:{labels,datasets:[["Protein","protein",4,"--p"],["Carbs","carbs",4,"--c"],["Fat","fat",9,"--f"]].map(([l,f,m,c])=>({label:l,data:T.map(t=>t.n?Math.round(t[f]*m):null),backgroundColor:css(c),maxBarThickness:28}))},
    options:{interaction:{mode:"index",intersect:false},scales:{x:{stacked:true,grid:{display:false},ticks:{maxTicksLimit:8}},y:{stacked:true,grid,ticks:{callback:v=>fmt(v)}}}}}));
  charts.push(new Chart(document.getElementById("cMeals"),{type:"bar",
    data:{labels,datasets:MEALS.map(([m,l,c])=>({label:l,data:keys.map(d=>{const L=dayEntries(d).filter(e=>e.meal===m); return L.length?Math.round(totals(L).kcal):null;}),backgroundColor:css(c),maxBarThickness:28}))},
    options:{interaction:{mode:"index",intersect:false},scales:{x:{stacked:true,grid:{display:false},ticks:{maxTicksLimit:8}},y:{stacked:true,grid,ticks:{callback:v=>fmt(v)}}}}}));
}

/* ---------- recipes ---------- */
function creditOf(text){
  const m=text.match(/^\*(?:Source|From):\s*([^*]+)\*\s*$/mi); if(!m) return null;
  const full=m[1].trim(); const cut=full.search(/\.\s/);
  const who=(cut<0?full:full.slice(0,cut)).replace(/\.$/,"").trim();
  return {line:m[0], who, rest:cut<0?"":full.slice(cut+1).trim()};
}
function renderRecipes(slug,idx){
  destroyCharts();
  if(slug){
    const r=DATA.recipes.find(x=>x.slug===slug);
    if(!r){ app.innerHTML=`<p>Recipe not found. <a href="#/recipes">All recipes</a></p>`; return; }
    const parts=r.md.split(/^##\s+/m).slice(1);
    const i=Math.max(0,Math.min(parts.length-1,idx??0));
    const sec=parts.length?parts[i]:r.md.replace(/^#\s+.*$/m,"");
    const title=parts.length?sec.split("\n")[0].trim():r.title;
    let body=(parts.length?sec.split("\n").slice(1).join("\n"):sec).replace(/^---\s*$/gm,"");
    const cr=creditOf(body); if(cr) body=body.replace(cr.line,cr.rest?`*${cr.rest}*`:"");
    const md=s=>window.marked?marked.parse(s):`<pre>${esc(s)}</pre>`;
    // Split into ingredients (everything before the first numbered step) and method (from it on).
    const lines=body.split("\n"); const first=lines.findIndex(l=>/^\s*1\.\s/.test(l));
    const ingMd=first<0?body:lines.slice(0,first).join("\n");
    const methMd=first<0?"":lines.slice(first).join("\n");
    const prev=parts.length&&i>0?i-1:null, next=parts.length&&i<parts.length-1?i+1:null;
    const nav=(j,l)=>j==null?"":`<a class="btn" href="#/recipes/${encodeURIComponent(slug)}/${j}">${l}</a>`;
    app.innerHTML=`<div class="toolbar"><a class="btn" href="#/recipes">‹ All recipes</a>
        <div class="btns"><button class="btn" id="cook" aria-pressed="false">Cook mode</button><button class="btn" id="reset">Clear checks</button></div></div>
      <header class="rhead"><div class="sub">${esc(r.title)}</div><h1>${esc(title)}</h1>${cr?`<div class="credit">Recipe from <b>${esc(cr.who)}</b></div>`:""}</header>
      <div class="recipe ${methMd?"":"single"}">
        <section class="card rcol ing"><h2>${methMd?"Ingredients":"Recipe"}</h2><div class="prose">${md(ingMd)}</div></section>
        ${methMd?`<section class="card rcol meth"><h2>Method</h2><div class="prose">${md(methMd)}</div></section>`:""}
      </div>
      <div class="toolbar">${nav(prev,"‹ "+esc((parts[prev]||"").split("\n")[0]))}<span></span>${nav(next,esc((parts[next]||"").split("\n")[0])+" ›")}</div>`;
    app.querySelectorAll(".ing li").forEach(li=>{ li.classList.add("check"); li.tabIndex=0; li.setAttribute("role","checkbox"); li.setAttribute("aria-checked","false"); });
    app.querySelectorAll(".meth ol > li").forEach(li=>{ li.classList.add("step"); li.tabIndex=0; });
    const toggle=li=>{ const on=li.classList.toggle("done"); if(li.classList.contains("check")) li.setAttribute("aria-checked",on); };
    app.querySelectorAll("li.check, li.step").forEach(li=>{ li.onclick=ev=>{ if(ev.target.closest("a")) return; ev.stopPropagation(); toggle(li); }; li.onkeydown=ev=>{ if(ev.key===" "||ev.key==="Enter"){ ev.preventDefault(); toggle(li); } }; });
    document.getElementById("reset").onclick=()=>app.querySelectorAll("li.done").forEach(li=>toggle(li));
    let lock=null; const cook=document.getElementById("cook");
    cook.onclick=async()=>{ const on=!document.body.classList.contains("cooking"); document.body.classList.toggle("cooking",on); cook.setAttribute("aria-pressed",on); cook.textContent=on?"Exit cook mode":"Cook mode";
      try{ if(on&&navigator.wakeLock) lock=await navigator.wakeLock.request("screen"); else { await lock?.release(); lock=null; } }catch{} };
    return;
  }
  const count=md=>(md.match(/^##\s+/gm)||[]).length;
  app.innerHTML=`<div class="toolbar"><div><h1>Recipes</h1><div class="sub">${DATA.recipes.reduce((a,r)=>a+Math.max(1,count(r.md)),0)} recipes in ${DATA.recipes.length} collections</div></div></div>
    <input class="search" id="q" placeholder="Search recipes and ingredients" aria-label="Search recipes">
    <div class="recipe-list" id="rl"></div>`;
  const list=document.getElementById("rl");
  const draw=q=>{
    q=q.trim().toLowerCase();
    const items=DATA.recipes.flatMap(r=>{
      const parts=r.md.split(/^##\s+/m).slice(1);
      if(!parts.length) return [{r,name:r.title,body:r.md}];
      return parts.map((p,i)=>({r,i,name:p.split("\n")[0].trim(),body:p}));
    }).filter(x=>!q||x.name.toLowerCase().includes(q)||x.body.toLowerCase().includes(q));
    list.innerHTML=items.map(x=>`<a href="#/recipes/${encodeURIComponent(x.r.slug)}${x.i!=null?"/"+x.i:""}"><b>${esc(x.name)}</b><span>${esc(x.r.title)}${(c=>c?" · from "+esc(c.who):"")(creditOf(x.body))}</span></a>`).join("")||`<p class="muted">No matches.</p>`;
  };
  document.getElementById("q").oninput=ev=>draw(ev.target.value); draw("");
}

/* ---------- router ---------- */
function route(){
  document.body.classList.remove("cooking");
  const h=location.hash.replace(/^#\/?/,""); const [a,b,c]=h.split("/");
  document.querySelectorAll("[data-nav]").forEach(n=>n.classList.toggle("on",(n.dataset.nav==="day"&&(a===""||a==="day"))||n.dataset.nav===a));
  if(a==="trends") renderTrends();
  else if(a==="recipes") renderRecipes(b&&decodeURIComponent(b), c!=null&&c!==""?+c:null);
  else renderDay(a==="day"&&/^\d{4}-\d{2}-\d{2}$/.test(b||"")?b:todayKey());
  if(!(a==="recipes"&&c)) window.scrollTo(0,0);
}
window.addEventListener("hashchange",route);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change",route);

fetch("data.json",{cache:"no-store"}).then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }).then(d=>{
  DATA=d; DATA.days.sort((a,b)=>a.date<b.date?-1:1); byDate=new Map(DATA.days.map(x=>[x.date,x]));
  const g=document.getElementById("gen"); if(g&&d.generated) g.textContent=`Updated ${new Date(d.generated).toLocaleString()} · estimates are typically within 20–30%`;
  route();
}).catch(()=>{ app.innerHTML=`<p>Couldn't load the log data. Reload the page to try again.</p>`; });
})();
