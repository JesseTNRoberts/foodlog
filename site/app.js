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

let DATA = { settings:{}, days:[], recipes:[], cards:[] };
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
// Whole-food share: calorie-weighted average of each ingredient's "whole" score (0-1). Ingredients without a score are left out.
function wholePct(entries){
  let w=0,k=0;
  for(const e of entries){ const s=num(e.servings||1);
    for(const c of (e.components||[])){ if(c.whole==null) continue; const v=num(c.kcal)*s; if(v<=0) continue; w+=v*num(c.whole); k+=v; } }
  return k?w/k*100:null;
}
const wholeTitle="Whole-food share: each ingredient is scored from 0 (ultra-processed) to 1 (whole food), weighted by calories";
const dayEntries = k => byDate.get(k)?.entries || [];
const metricVal = (t,m) => m.startsWith("m:") ? num(t.micros[m.slice(2)]) : num(t[m]);
// Days off logging (offDay: true in the day file) stay visible but are left out of every average.
const isOff = k => !!byDate.get(k)?.offDay;
function loggedBefore(k,n){ return DATA.days.filter(d=>d.date<k && d.entries.length && !d.offDay).slice(-n); }

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
  return `<div class="kpi"${opts.nutr?` data-nutr="${opts.nutr}" title="Tap to see which foods it came from"`:""}><div class="l">${label}</div>
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
    return `<div class="mrow" data-nutr="${k}" title="Tap to see which foods it came from"><span>${l}</span><div class="bar" title="${fmt(v,1)} ${u} of ${dv} ${u}"><i style="width:${Math.min(100,p/1.5)}%;background:${col}"></i></div><span class="pct num">${fmt(p)}%</span></div>`;
  }).join("");
}

/* ---------- nutrient breakdown (click a nutrient) ---------- */
function nutrientInfo(m){
  const base={kcal:["Calories","kcal"],protein:["Protein","g"],carbs:["Carbs","g"],fat:["Fat","g"],fiber:["Fiber","g"],sugar:["Sugar","g"],
    addedSugar:["Added sugar","g"],satfat:["Saturated fat","g"],sodium:["Sodium","mg"],cholesterol:["Cholesterol","mg"]};
  if(base[m]) return base[m];
  const mi=MICRO.find(x=>x[0]===m); return mi?[mi[1],mi[2]]:[m,""];
}
// Daily target or limit for a nutrient, when there is one: [value, "target"|"limit"].
function targetOf(m){
  const S=DATA.settings||{}; const mi=MICRO.find(x=>x[0]===m); if(mi) return [mi[3],"target"];
  const t={kcal:[num(S.budget),"limit"],protein:[num(S.proteinGoal),"target"],fiber:[num(S.fiberGoal),"target"],
    sodium:[num(S.sodiumLimit),"limit"],satfat:[num(S.satfatLimit)||20,"limit"],addedSugar:[num(S.addedSugarLimit)||36,"limit"]}[m];
  return t&&t[0]>0?t:null;
}
function compVal(c,m){ return c.micros&&m in c.micros ? c.micros[m] : c[m]; }
// For ranges, "Olive oil (in the spaghetti)" and "Olive oil" count as one food.
const foodKey = n => n.replace(/\s*\((?:in|on) the [^)]*\)\s*$/i,"").trim();
function contributions(entries,m,merge=false){
  const map=new Map(), label=new Map(), wsum=new Map(), wv=new Map();
  const add=(n,v,w)=>{ if(!(v>0)) return; const k=merge?foodKey(n).toLowerCase():n; if(!label.has(k)) label.set(k,merge?foodKey(n):n); map.set(k,(map.get(k)||0)+v);
    if(w!=null){ wsum.set(k,(wsum.get(k)||0)+v*num(w)); wv.set(k,(wv.get(k)||0)+v); } };
  for(const e of entries){ const s=num(e.servings||1); const comps=e.components||[];
    const ev = m in (e.micros||{}) ? num(e.micros[m])*s : num(e[m])*s;
    // Per-ingredient numbers when the ingredients carry this nutrient; otherwise the whole dish.
    if(comps.length && comps.every(c=>compVal(c,m)!=null)){ comps.forEach(c=>add(c.name, num(compVal(c,m))*s, c.whole)); continue; }
    add(e.name, ev);
  }
  return [...map].map(([k,v])=>[label.get(k),v,wv.get(k)?wsum.get(k)/wv.get(k):null]).sort((a,b)=>b[1]-a[1]);
}

/* Squarified treemap: lays rows of boxes so each stays close to square. */
function squarify(vals,W,H){
  const out=[]; const total=vals.reduce((a,b)=>a+b,0); if(!total) return out;
  const scale=W*H/total; const areas=vals.map(v=>v*scale);
  let x=0,y=0,w=W,h=H,i=0;
  const worst=(row,side)=>{ const s=row.reduce((a,b)=>a+b,0); const mx=Math.max(...row), mn=Math.min(...row); return Math.max(side*side*mx/(s*s), (s*s)/(side*side*mn)); };
  while(i<areas.length){
    const side=Math.min(w,h); let row=[areas[i]], j=i+1;
    while(j<areas.length && worst([...row,areas[j]],side)<=worst(row,side)){ row.push(areas[j]); j++; }
    const s=row.reduce((a,b)=>a+b,0);
    if(w>=h){ const cw=s/h; let cy=y; row.forEach(a=>{ const ch=a/cw; out.push({x,y:cy,w:cw,h:ch}); cy+=ch; }); x+=cw; w-=cw; }
    else { const rh=s/w; let cx=x; row.forEach(a=>{ const cw=a/rh; out.push({x:cx,y,w:cw,h:rh}); cx+=cw; }); y+=rh; h-=rh; }
    i=j;
  }
  return out;
}
// Box size = share of the nutrient; color = whole-food score (red processed -> grey -> green whole).
function wholeColor(w){
  if(w==null) return "var(--tm-none)";
  return w<0.5 ? `color-mix(in srgb,var(--tm-mid) ${Math.round(w/0.5*100)}%,var(--tm-low))` : `color-mix(in srgb,var(--tm-high) ${Math.round((w-0.5)/0.5*100)}%,var(--tm-mid))`;
}
function treemapHTML(rows,total,unit,dp,W,H){
  return squarify(rows.map(r=>r[1]),W,H).map((b,i)=>{
    const [n,v,w]=rows[i]; const pct=v/total*100;
    const big=b.w>=70&&b.h>=38, mid=!big&&b.w>=40&&b.h>=18; const short=esc(n.split(",")[0]);
    const val=b.w>=120?`${fmt(v,dp)} ${unit} · ${fmt(pct,pct<1?1:0)}%`:`${fmt(pct,pct<1?1:0)}%`;
    return `<div class="tm-b${w==null?" nw":""}" data-i="${i}" style="left:${b.x.toFixed(1)}px;top:${b.y.toFixed(1)}px;width:${b.w.toFixed(1)}px;height:${b.h.toFixed(1)}px;background:${wholeColor(w)}" title="${esc(n)}: ${fmt(v,dp)} ${unit} (${fmt(pct,pct<1?1:0)}%)${w==null?"":` · ${fmt(w*100)}% whole`}">${big?`<span class="tm-n">${short}</span><span class="tm-v">${val}</span>`:mid?`<span class="tm-n${b.h>=30?"":" one"}">${short}</span>`:""}</div>`;
  }).join("");
}
let bdChart=null;
function showBreakdown(m, entries, scope, perDay=1, view="pie"){
  if(typeof perDay==="function") perDay=perDay(m);
  const [label,unit]=nutrientInfo(m);
  let rows=contributions(entries,m,view==="treemap").map(([n,v,w])=>[n,v/perDay,w]);
  const total=rows.reduce((a,r)=>a+r[1],0);
  if(view==="treemap") return showTreemap(label,unit,rows,total,scope,perDay);
  if(rows.length>8){ const rest=rows.slice(7).reduce((a,r)=>a+r[1],0); rows=[...rows.slice(0,7),["Everything else",rest]]; }
  const dp = total<20?1:0;
  const tg=targetOf(m), pctOf=v=>tg?v/tg[0]*100:v/total*100, pdp=v=>pctOf(v)<10&&pctOf(v)>0?1:0;
  const dlg=bdDialog(false);
  dlg.innerHTML=`<div class="bd"><div class="bd-h"><div><h2>${esc(label)}</h2><div class="sub">${esc(scope)} · ${bdTotalLine(total,unit,dp,tg,perDay)}</div></div>
    <button class="btn sm" data-close aria-label="Close">Close</button></div>
    ${total>0?`<div class="bd-chart"><canvas id="cBd"></canvas></div>
    <table class="bd-t"><tr class="bd-th"><td>Food</td><td class="num">Amount</td><td class="num">${tg?"of "+tg[1]:"share"}</td></tr>${rows.map(([n,v],i)=>`<tr><td><i style="background:${COMP_COLORS[i%COMP_COLORS.length]}"></i>${esc(n)}</td><td class="num">${fmt(v,dp)} ${unit}</td><td class="num">${fmt(pctOf(v),pdp(v))}%</td></tr>`).join("")}
    <tr class="bd-tot"><td>Total</td><td class="num">${fmt(total,dp)} ${unit}</td><td class="num">${fmt(pctOf(total))}%</td></tr></table>`
    :`<div class="muted">No ${esc(label.toLowerCase())} estimated for these foods.</div>`}</div>`;
  dlg.querySelector("[data-close]").onclick=()=>dlg.close();
  dlg.showModal();
  if(total>0 && chartDefaults()){
    bdChart=new Chart(document.getElementById("cBd"),{type:"doughnut",
      data:{labels:rows.map(r=>r[0]),datasets:[{data:rows.map(r=>r[1]),backgroundColor:rows.map((_,i)=>COMP_COLORS[i%COMP_COLORS.length]),borderColor:css("--surface"),borderWidth:2}]},
      options:{cutout:"58%",plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${fmt(c.raw,dp)} ${unit} (${fmt(c.raw/total*100)}%)`}}}}});
  }
}
function bdTotalLine(total,unit,dp,tg,perDay){
  const per=perDay>1?" per day":"";
  if(!tg) return `${fmt(total,dp)} ${unit}${per}`;
  return `${fmt(total,dp)} of ${fmt(tg[0],tg[0]<20?1:0)} ${unit} ${tg[1]}${per} (${fmt(total/tg[0]*100)}%)`;
}
function bdDialog(wide){
  let dlg=document.getElementById("bd");
  if(!dlg){ dlg=document.createElement("dialog"); dlg.id="bd"; document.body.appendChild(dlg);
    dlg.addEventListener("click",ev=>{ if(ev.target===dlg) dlg.close(); }); dlg.addEventListener("close",()=>{ bdChart?.destroy(); bdChart=null; }); }
  dlg.classList.toggle("wide",!!wide); return dlg;
}
function showTreemap(label,unit,rows,total,scope,perDay){
  const dp = total<20?1:0;
  const m=MICRO.find(x=>x[1]===label)?.[0]||Object.entries({kcal:"Calories",protein:"Protein",fiber:"Fiber",sodium:"Sodium",satfat:"Saturated fat",addedSugar:"Added sugar"}).find(([,l])=>l===label)?.[0];
  const tg=m?targetOf(m):null, pctOf=v=>tg?v/tg[0]*100:v/total*100;
  const dlg=bdDialog(true);
  dlg.innerHTML=`<div class="bd"><div class="bd-h"><div><h2>${esc(label)}</h2><div class="sub">${esc(scope)} · ${bdTotalLine(total,unit,dp,tg,perDay)} · ${rows.length} foods</div></div>
    <button class="btn sm" data-close aria-label="Close">Close</button></div>
    ${total>0?`<div class="tm-key"><span>Box size = share</span><span class="tm-scale"><i style="background:${wholeColor(0)}"></i>processed<i style="background:${wholeColor(.5)}"></i><i style="background:${wholeColor(1)}"></i>whole</span></div><div class="tm" role="img" aria-label="${esc(label)} by food, ${rows.length} foods"></div>
    <div class="bd-scroll"><table class="bd-t">${rows.map(([n,v],i)=>`<tr data-r="${i}"><td><span class="rk">${i+1}</span><i style="background:${wholeColor(rows[i][2])}"></i>${esc(n)}</td><td class="num">${fmt(v,dp)} ${unit}</td><td class="num">${fmt(pctOf(v),pctOf(v)<10?1:0)}%</td></tr>`).join("")}
      <tr class="bd-tot"><td>Total</td><td class="num">${fmt(total,dp)} ${unit}</td><td class="num">${fmt(pctOf(total))}%</td></tr></table></div>
    <div class="hint">Percent column is ${tg?`each food's share of your daily ${tg[1]} (${fmt(tg[0],tg[0]<20?1:0)} ${unit})`:"each food's share of the total"}.</div>`
    :`<div class="muted">No ${esc(label.toLowerCase())} estimated for these foods.</div>`}</div>`;
  dlg.querySelector("[data-close]").onclick=()=>dlg.close();
  dlg.showModal();
  const tm=dlg.querySelector(".tm"); if(!tm) return;
  const draw=()=>{ const W=tm.clientWidth, H=tm.clientHeight; tm.innerHTML=treemapHTML(rows,tg?tg[0]:total,unit,dp,W,H); };
  draw(); dlg._ro?.disconnect(); dlg._ro=new ResizeObserver(draw); dlg._ro.observe(tm);
  // Tap a box: highlight it and jump to its row in the list (touch screens have no hover tooltip).
  tm.onclick=ev=>{ const b=ev.target.closest(".tm-b"); if(!b) return;
    tm.querySelectorAll(".tm-b.on").forEach(x=>x.classList.remove("on")); b.classList.add("on");
    dlg.querySelectorAll("tr.on").forEach(x=>x.classList.remove("on"));
    const r=dlg.querySelector(`tr[data-r="${b.dataset.i}"]`); if(r){ r.classList.add("on"); const box=dlg.querySelector(".bd-scroll"); box.scrollTo({top:r.offsetTop-box.clientHeight/2+r.offsetHeight/2,behavior:"smooth"}); } };
}
function wireBreakdown(root, getEntries, scope, perDay=1, view="pie"){
  root.querySelectorAll("[data-nutr]").forEach(el=>{
    el.classList.add("clickable"); el.setAttribute("role","button"); el.tabIndex=0;
    const go=()=>showBreakdown(el.dataset.nutr, getEntries(), scope, perDay, view);
    el.onclick=go; el.onkeydown=ev=>{ if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); go(); } };
  });
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
    <div><h1>${isToday?"Today":esc(prettyDate(k))}</h1><div class="sub">${isToday?esc(prettyDate(k)):""}${day?.weight?`${isToday?" · ":""}<b class="num">${fmt(day.weight,1)} lb</b>${ents.length?"":""}`:""}${ents.length?`${isToday?" · ":""}${ents.length} entries · likely ${fmt(t.lo)}–${fmt(t.hi)} kcal`:""}${ents.length?(w=>` · <span class="whole" title="${wholeTitle}">${w==null?"whole food not scored (no foods named)":fmt(w)+"% whole food"}</span>`)(wholePct(ents)):""}</div></div>
    <div class="btns">
      <a class="btn" href="#/day/${addDays(k,-1)}" ${firstDay&&k<=firstDay?'aria-disabled="true"':""} aria-label="Previous day">‹ Prev</a>
      ${isToday?"":`<a class="btn" href="#/">Today</a>`}
      <a class="btn" href="#/day/${addDays(k,1)}" ${isToday?'aria-disabled="true"':""} aria-label="Next day">Next ›</a>
    </div>
  </div>
  ${day?.offDay?`<div class="daynote off"><b>Day off logging.</b> What's here is kept, but this day is left out of averages and trends. <button class="btn sm" data-copy="Plate Log edit, ${k}: count this day again (remove day off)">Count it again</button></div>`:""}
  ${day?.note?`<div class="daynote">${esc(day.note)}</div>`:""}
  ${!ents.length?(()=>{const last=DATA.days.filter(d=>d.entries.length&&d.date!==k).map(d=>d.date).filter(d=>d<k).pop(); return `<div class="daynote">Nothing logged for this day yet.${last?` Last logged day: <a href="#/day/${last}">${esc(prettyDate(last,{weekday:"long",month:"short",day:"numeric"}))}</a>.`:""}</div>`;})():""}
  <div class="kpis">
    ${kpi("Calories",t.kcal,"kcal",B,{nutr:"kcal",limit:true,foot:left>=0?`${fmt(left)} left`:`<span style="color:var(--over)">${fmt(-left)} over</span>`,delta:deltaPill(t.kcal,avg("kcal"),null)})}
    ${kpi("Protein",t.protein,"g",PG,{nutr:"protein",color:"var(--p)",foot:`${Math.round(t.protein*4/cal*100)}% of kcal`,delta:deltaPill(t.protein,avg("protein"),true)})}
    ${kpi("Fiber",t.fiber,"g",FG,{nutr:"fiber",color:"var(--fib)",foot:`${fmt(t.fiber/Math.max(1,t.kcal)*1000,1)} g / 1000 kcal`,delta:deltaPill(t.fiber,avg("fiber"),true)})}
    ${kpi("Sodium",t.sodium,"mg",NA,{nutr:"sodium",limit:true,foot:`sat fat ${fmt(t.satfat)} g`,delta:deltaPill(t.sodium,avg("sodium"),false)})}
  </div>
  <div class="grid32">
    <section class="card"><div class="card-h"><h2>Where the calories came from</h2><span class="sub">by meal and ingredient</span></div>
      <div class="stack lg" aria-label="Calories by meal">${byMeal.filter(x=>x.t.kcal).map(x=>`<span style="width:${x.t.kcal/Math.max(1,t.kcal)*100}%;background:var(${x.c})" title="${x.l}: ${fmt(x.t.kcal)} kcal"></span>`).join("")}</div>
      <div class="legend">${byMeal.map(x=>`<span><i style="background:var(${x.c})"></i>${x.l} <b class="num">${fmt(x.t.kcal)}</b></span>`).join("")}</div>
      <div class="chartbox" style="height:${Math.max(200,ingredientKcal(ents).length*22+30)}px"><canvas id="cEntries"></canvas></div>
    </section>
    <section class="card"><div class="card-h"><h2>Macro split</h2><span class="sub">% of calories</span></div>
      <div class="chartbox sm"><canvas id="cMacro"></canvas></div>
      <div class="legend"><span data-nutr="protein"><i style="background:var(--p)"></i>Protein <b class="num">${fmt(t.protein)} g</b></span><span data-nutr="carbs"><i style="background:var(--c)"></i>Carbs <b class="num">${fmt(t.carbs)} g</b></span><span data-nutr="fat"><i style="background:var(--f)"></i>Fat <b class="num">${fmt(t.fat)} g</b></span><span data-nutr="sugar">Sugar <b class="num">${fmt(t.sugar)} g</b></span><span data-nutr="satfat">Sat fat <b class="num">${fmt(t.satfat)} g</b></span></div><div class="hint">Tap any nutrient to see which foods it came from.</div>
    </section>
  </div>
  <h2 style="font-size:16px;font-weight:600;margin-top:4px">Meals</h2>
  ${byMeal.map(x=>mealCard(x,k)).join("")}
  <section class="card"><div class="card-h"><h2>Vitamins & minerals</h2><span class="sub">% of your daily target · tick marks 100%</span></div>
    ${Object.keys(t.micros).length?`<div class="mlist">${microRows(t.micros)}</div>`:`<div class="muted">No micronutrient estimates for this day.</div>`}
  </section>
  <section class="card"><div class="card-h"><h2>Last 7 days</h2><span class="sub">calories vs ${fmt(B)} budget · tap a day</span></div>${weekStrip(k,B)}</section>
  ${day?.offDay?"":`<div class="dayoff-row"><span>Didn't really log this day?</span><button class="linkbtn" data-copy="Plate Log edit, ${k}: mark as a day off logging (leave out of averages)" title="Copies a note to paste to Claude">Mark it as a day off</button><span>It'll be left out of averages.</span></div>`}`;

  wireBreakdown(app, ()=>ents, prettyDate(k,{weekday:"long",month:"short",day:"numeric"}));
  app.querySelectorAll("[data-copy]").forEach(b=>b.onclick=async()=>{
    const txt=b.dataset.copy;
    try{ await navigator.clipboard.writeText(txt); toast("Copied. Paste it to Claude with your change."); }
    catch{ prompt("Copy this and send it to Claude with your change:",txt); }
  });

  if(!chartDefaults()) return;
  if(ents.length){
    const ing=ingredientKcal(ents);
    const mealColor=Object.fromEntries(MEALS.map(([m,,c])=>[m,css(c)]));
    const mealName=Object.fromEntries(MEALS.map(([m,l])=>[m,l]));
    charts.push(new Chart(document.getElementById("cEntries"),{type:"bar",
      data:{labels:ing.map(x=>x.name.length>28?x.name.slice(0,27)+"…":x.name),
        datasets:[{data:ing.map(x=>x.kcal),backgroundColor:ing.map(x=>x.meal?mealColor[x.meal]:css("--muted")),borderRadius:4,barThickness:14}]},
      options:{indexAxis:"y",plugins:{legend:{display:false},tooltip:{callbacks:{
        title:c=>ing[c[0].dataIndex].name,
        label:c=>` ${fmt(c.raw)} kcal`,
        afterLabel:c=>{const x=ing[c.dataIndex]; return x.from?` ${x.from}`:Object.entries(x.byMeal).filter(([,v])=>v>0).map(([m,v])=>` ${mealName[m]}: ${fmt(v)} kcal`);}}}},
        scales:{x:{grid:{color:css("--line")},ticks:{callback:v=>fmt(v)}},y:{grid:{display:false},ticks:{color:css("--ink")}}}}}));
    charts.push(new Chart(document.getElementById("cMacro"),{type:"doughnut",
      data:{labels:["Protein","Carbs","Fat"],datasets:[{data:[t.protein*4,t.carbs*4,t.fat*9].map(v=>Math.round(v/cal*100)),backgroundColor:[css("--p"),css("--c"),css("--f")],borderColor:css("--surface"),borderWidth:2}]},
      options:{cutout:"68%",plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.label}: ${c.raw}%`}}}},
      plugins:[{id:"center",afterDraw(ch){const {ctx,chartArea:a}=ch; ctx.save(); ctx.textAlign="center"; ctx.fillStyle=css("--ink"); ctx.font=`600 22px ${css("--body")}`; ctx.fillText(fmt(t.kcal),(a.left+a.right)/2,(a.top+a.bottom)/2+4); ctx.fillStyle=css("--muted"); ctx.font=`12px ${css("--body")}`; ctx.fillText("kcal",(a.left+a.right)/2,(a.top+a.bottom)/2+20); ctx.restore();}}]}));
  }
}

// Calories per ingredient for a set of entries: components are merged by name across dishes and meals
// (an entry without components counts as one ingredient). Top 15, the rest grouped.
function ingredientKcal(entries){
  const map=new Map();
  for(const e of entries){ const s=num(e.servings||1); const comps=(e.components||[]).length?e.components:[{name:e.name,kcal:e.kcal}];
    for(const c of comps){ const v=num(c.kcal)*s; if(v<=0) continue; const key=String(c.name).trim();
      const x=map.get(key)||{name:key,kcal:0,byMeal:{}}; x.kcal+=v; x.byMeal[e.meal]=(x.byMeal[e.meal]||0)+v; map.set(key,x); } }
  let list=[...map.values()].sort((a,b)=>b.kcal-a.kcal);
  list.forEach(x=>x.meal=Object.entries(x.byMeal).sort((a,b)=>b[1]-a[1])[0][0]);
  if(list.length>16){ const rest=list.slice(15); list=[...list.slice(0,15),{name:`${rest.length} other ingredients`,kcal:rest.reduce((a,x)=>a+x.kcal,0),byMeal:{},meal:null,
    from:rest.slice(0,6).map(x=>x.name).join(", ")+(rest.length>6?"…":"")}]; }
  return list;
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
    ${e.eaten||(e.ingredients||[]).length?`<div class="eaten">${e.eaten?`<div><b>Ate ${fmt(num(e.eaten.pct))}%</b>${e.eaten.of?` of ${esc(e.eaten.of)}`:""}</div>`:""}${(e.ingredients||[]).length?`<div><span class="lbl">${e.ingredientsFrom==="menu"?"Ingredients (from the menu)":e.ingredientsFrom==="recipe"?"Ingredients (from your recipe)":"Likely ingredients (guessed)"}:</span> ${e.ingredients.map(esc).join(", ")}</div>`:""}</div>`:""}
    ${e.recipeCard&&cardHref(e.recipeCard)?`<div class="eaten"><a href="${cardHref(e.recipeCard)}">From your recipe card ›</a></div>`:""}
    ${(e.photos||[]).length?`<div class="photos">${e.photos.map(p=>`<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="Photo of ${esc(e.name)}" loading="lazy"></a>`).join("")}</div>`:""}
    ${comps.length>1?`<div class="stack" aria-label="Components by calories">${comps.map((c,i)=>`<span style="width:${num(c.kcal)/ctot*100}%;background:${COMP_COLORS[i%COMP_COLORS.length]}" title="${esc(c.name)}: ${fmt(num(c.kcal)*sv)} kcal"></span>`).join("")}</div>`:""}
    ${comps.length?`<div class="tblwrap"><table class="comps"><thead><tr><th>Component</th><th>kcal</th><th>share</th><th>P</th><th>C</th><th>F</th></tr></thead><tbody>${rows}</tbody></table></div>`:""}
    <div class="entry-f"><span><span class="pill ${conf==="low"?"warn":conf==="high"?"good":""}">${esc(conf)} confidence</span> fiber ${fmt(num(e.fiber)*sv)} g · sodium ${fmt(num(e.sodium)*sv)} mg${(w=>w==null?"":` · <span title="${wholeTitle}">${fmt(w)}% whole food</span>`)(wholePct([e]))}${e.notes?` · ${esc(e.notes)}`:""}</span>
      <span class="btns"><button class="btn sm" data-copy="${esc(copy)}">Ask Claude to edit</button>${url?`<a class="btn sm" href="${url}" target="_blank" rel="noopener">Edit file</a>`:""}</span></div>
  </div>`;
}
function weekStrip(k,B){
  const end = k>addDays(todayKey(),-3)?todayKey():addDays(k,3);
  const keys=[...Array(7)].map((_,i)=>addDays(end,i-6)); const vals=keys.map(d=>totals(dayEntries(d)).kcal); const max=Math.max(B*1.15,...vals);
  const H=64, bh=v=>Math.max(6,v/max*H);
  return `<div class="week" style="--budget:${(B/max*H).toFixed(1)}px">${keys.map((d,i)=>{const v=vals[i];const w=wholePct(dayEntries(d));return `<a href="#/day/${d}" class="${d===k?"sel":""}" aria-label="${d}: ${fmt(v)} kcal${w==null?"":`, ${fmt(w)}% whole food`}"><span class="kv">${v?fmt(v):""}</span><span class="bar"><span class="col ${isOff(d)?"off":v?(v>B?"over":"has"):""}" style="height:${v?bh(v):4}px"></span></span><span class="lbl">${dateOf(d).toLocaleDateString(undefined,{weekday:"short"})}</span><span class="wh" title="${isOff(d)?"Day off logging":wholeTitle}">${isOff(d)?"off":w==null?"&nbsp;":fmt(w)+"%"}</span></a>`;}).join("")}</div><div class="week-key"><span><i class="bl"></i>${fmt(B)} budget</span><span>bottom row: % whole food${keys.some(isOff)?" · grey = day off":""}</span></div>`;
}

/* ---------- trends ---------- */
let trendState = { range: 30, metric: "kcal", top: "sodium" };
function renderTrends(){
  destroyCharts();
  const S=DATA.settings, B=num(S.budget)||1900;
  const end=todayKey();
  const start = trendState.range==="all" ? (DATA.days[0]?.date||end) : addDays(end,-(trendState.range-1));
  const keys=[]; for(let d=start; d<=end; d=addDays(d,1)) keys.push(d);
  const T=keys.map(d=>totals(dayEntries(d)));
  const rows=T.map((t,i)=>({t,d:keys[i]})).filter(x=>x.t.n||isOff(x.d));
  const logged=rows.filter(x=>!isOff(x.d)); const offN=rows.length-logged.length;
  const avg=f=>logged.length?logged.reduce((a,x)=>a+x.t[f],0)/logged.length:0;
  // Imported Lose It days have no vitamin data, so average only over days that do.
  const withMicros=logged.filter(x=>Object.keys(x.t.micros).length);
  const microAvg={}; for(const [k] of MICRO) microAvg[k]=withMicros.length?withMicros.reduce((a,x)=>a+num(x.t.micros[k]),0)/withMicros.length:0;
  const under=logged.filter(x=>x.t.kcal<=B).length;
  // Fields some old (Lose It) days never recorded: average only over days that have them.
  const hasF=(d,f)=>dayEntries(d).some(e=>e[f]!=null);
  const avgOf=(list,f)=>{ const L=list.filter(x=>hasF(x.d,f)); return L.length?L.reduce((a,x)=>a+x.t[f],0)/L.length:null; };
  const SF=num(S.satfatLimit)||20, AS=num(S.addedSugarLimit)||36;
  // Previous period of the same length, for "vs prior N days" arrows.
  const N=trendState.range==="all"?0:trendState.range;
  const prev=[]; if(N) for(let d=addDays(start,-N); d<start; d=addDays(d,1)){ const t=totals(dayEntries(d)); if(t.n&&!isOff(d)) prev.push({t,d}); }
  const vsPrior=(f,higherIsGood,unit,dp=0)=>{
    if(!N||prev.length<3) return "";
    const c=avgOf(logged,f), p=avgOf(prev,f); if(c==null||p==null||!p) return "";
    const d=c-p; if(Math.abs(d)/p<.03) return `<span class="pill" title="Previous ${N} days: ${fmt(p,dp)} ${unit}">≈ prior ${N}d</span>`;
    const good=higherIsGood==null?null:(d>0)===higherIsGood;
    return `<span class="pill ${good==null?"":good?"good":"warn"}" title="Previous ${N} days: ${fmt(p,dp)} ${unit}">${d>0?"▲":"▼"} ${fmt(Math.abs(d),dp)} ${unit} vs prior ${N}d</span>`;
  };
  const wholeOf=list=>{ const v=list.map(x=>wholePct(dayEntries(x.d))).filter(v=>v!=null); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; };
  const wAvg=wholeOf(logged), wPrev=N&&prev.length>=3?wholeOf(prev):null;
  const wDelta=wAvg==null||wPrev==null?"":Math.abs(wAvg-wPrev)<1.5?`<span class="pill">≈ prior ${N}d</span>`:`<span class="pill ${wAvg>wPrev?"good":"warn"}">${wAvg>wPrev?"▲":"▼"} ${fmt(Math.abs(wAvg-wPrev))} pts vs prior ${N}d</span>`;
  const loggedEntries=()=>logged.flatMap(x=>dayEntries(x.d));
  // Protein by meal, averaged over logged days.
  const protMeal=MEALS.map(([m,l,c])=>({m,l,c,v:logged.length?logged.reduce((a,x)=>a+totals(dayEntries(x.d).filter(e=>e.meal===m)).protein,0)/logged.length:0}));
  const [mk,ml,mu]=METRICS.find(m=>m[0]===trendState.metric);
  const target = mk==="kcal"?B: mk==="protein"?num(S.proteinGoal): mk==="fiber"?num(S.fiberGoal): mk==="sodium"?num(S.sodiumLimit): mk.startsWith("m:")?MICRO.find(m=>"m:"+m[0]===mk)[3]:null;

  app.innerHTML=`
  <div class="toolbar"><div><h1>Trends</h1><div class="sub">${logged.length} logged days${offN?` · ${offN} day${offN===1?"":"s"} off, not averaged`:""} · ${esc(prettyDate(start,{month:"short",day:"numeric"}))} – ${esc(prettyDate(end,{month:"short",day:"numeric"}))}</div></div>
    <div class="seg" role="group" aria-label="Range">${[[7,"7D"],[30,"30D"],[90,"90D"],["all","All"]].map(([v,l])=>`<button data-range="${v}" class="${trendState.range==v?"on":""}">${l}</button>`).join("")}</div></div>
  <div class="kpis six">
    ${kpi("Avg calories",avg("kcal"),"kcal",B,{nutr:"kcal",limit:true,foot:`${under}/${logged.length} days within budget`,delta:vsPrior("kcal",null,"kcal")})}
    ${kpi("Avg protein",avg("protein"),"g",num(S.proteinGoal),{nutr:"protein",color:"var(--p)",delta:vsPrior("protein",true,"g")})}
    ${kpi("Avg fiber",avg("fiber"),"g",num(S.fiberGoal),{nutr:"fiber",color:"var(--fib)",delta:vsPrior("fiber",true,"g")})}
    ${kpi("Avg sodium",avg("sodium"),"mg",num(S.sodiumLimit),{nutr:"sodium",limit:true,delta:vsPrior("sodium",false,"mg")})}
    ${kpi("Avg saturated fat",avgOf(logged,"satfat")??0,"g",SF,{nutr:"satfat",limit:true,delta:vsPrior("satfat",false,"g",1)})}
    ${kpi("Avg added sugar",avgOf(logged,"addedSugar")??0,"g",AS,{nutr:"addedSugar",limit:true,delta:vsPrior("addedSugar",false,"g",1)})}
  </div>
  <section class="card"><div class="card-h"><h2>Daily ${esc(ml.toLowerCase())}</h2>
    <select class="sel" id="metric" aria-label="Metric">${METRICS.map(([v,l])=>`<option value="${v}"${v===mk?" selected":""}>${l}</option>`).join("")}</select></div>
    <div class="chartbox"><canvas id="cMetric"></canvas></div></section>
  ${(()=>{ const all=DATA.days.filter(d=>d.weight); if(!all.length) return "";
    let pts=all.filter(d=>d.date>=start&&d.date<=end); if(pts.length<2) pts=all;
    const last=pts[pts.length-1], first=pts[0], ch=last.weight-first.weight;
    return `<section class="card"><div class="card-h"><h2>Weight</h2><span class="sub">${pts.length>1?`${ch<=0?"▼":"▲"} ${fmt(Math.abs(ch),1)} lb since ${esc(prettyDate(first.date,{month:"short",day:"numeric"}))} · ${pts.length} weigh-ins`:"1 weigh-in"}</span></div>
      <div class="wt-now"><b class="num">${fmt(last.weight,1)}</b> lb <span class="sub">${esc(prettyDate(last.date,{weekday:"short",month:"short",day:"numeric"}))}</span></div>
      ${pts.length>1?`<div class="chartbox sm"><canvas id="cWeight"></canvas></div>`:""}</section>`; })()}
  <div class="grid2">
    <section class="card"><div class="card-h"><h2>Calories by macro</h2><span class="sub">kcal from P / C / F</span></div><div class="chartbox"><canvas id="cMacros"></canvas></div></section>
    <section class="card"><div class="card-h"><h2>Calories by meal</h2><span class="sub">stacked per day</span></div><div class="chartbox"><canvas id="cMeals"></canvas></div></section>
  </div>
  <div class="grid2">
    <section class="card"><div class="card-h"><h2>Whole food</h2><span class="sub">${wAvg==null?"no scored days":`avg ${fmt(wAvg)}% ${wDelta}`}</span></div><div class="chartbox"><canvas id="cWhole"></canvas></div></section>
    <section class="card"><div class="card-h"><h2>Protein by meal</h2><span class="sub">avg per day</span></div>
      <div class="legend">${protMeal.map(x=>`<span><i style="background:var(${x.c})"></i>${x.l} <b class="num">${fmt(x.v)} g</b></span>`).join("")}</div>
      <div class="chartbox sm"><canvas id="cProtMeal"></canvas></div></section>
  </div>
  <div class="grid2">
    <section class="card"><div class="card-h"><h2>Top sources</h2>
      <select class="sel" id="topSel" aria-label="Nutrient">${[["sodium", "Sodium"], ["satfat", "Saturated fat"], ["addedSugar", "Added sugar"], ["protein", "Protein"], ["fiber", "Fiber"]].map(([v,l])=>`<option value="${v}"${v===trendState.top?" selected":""}>${l}</option>`).join("")}</select></div>
      ${topSources(loggedEntries(),trendState.top,Math.max(1,logged.length))}</section>
    <section class="card"><div class="card-h"><h2>Nutrient gaps</h2><span class="sub">under 50% of your target, and foods you already eat that have the most</span></div>
      ${nutrientGaps(microAvg,withMicros.length)}</section>
  </div>
  <section class="card"><div class="card-h"><h2>Average vitamins & minerals</h2><span class="sub">% of your daily target · ${withMicros.length} day${withMicros.length===1?"":"s"} with vitamin estimates</span></div>
    ${withMicros.length?`<div class="mlist">${microRows(microAvg)}</div>`:`<div class="muted">No vitamin estimates in this range (Lose It imports don't include them).</div>`}</section>
  <section class="card"><div class="card-h"><h2>Daily totals</h2><span class="sub">tap a row to open the day</span></div>
    <div class="tblwrap"><table class="dtable"><thead><tr><th>Date</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fiber</th><th>Sodium</th><th title="${wholeTitle}">Whole</th><th>Entries</th></tr></thead>
    <tbody>${[...rows].reverse().map(({t,d})=>isOff(d)?`<tr class="link off" data-day="${d}"><td>${esc(prettyDate(d,{weekday:"short",month:"short",day:"numeric"}))}</td><td colspan="8" class="muted">day off logging, not averaged</td></tr>`:`<tr class="link" data-day="${d}"><td>${esc(prettyDate(d,{weekday:"short",month:"short",day:"numeric"}))}</td><td class="num ${t.kcal>B?"over":""}">${fmt(t.kcal)}</td><td class="num">${fmt(t.protein)}</td><td class="num">${fmt(t.carbs)}</td><td class="num">${fmt(t.fat)}</td><td class="num">${fmt(t.fiber)}</td><td class="num ${t.sodium>num(S.sodiumLimit)?"over":""}">${fmt(t.sodium)}</td><td class="num">${(w=>w==null?"–":fmt(w)+"%")(wholePct(dayEntries(d)))}</td><td class="num">${t.n}</td></tr>`).join("")||`<tr><td colspan="9" class="muted">Nothing logged in this range.</td></tr>`}</tbody></table></div></section>`;

  wireBreakdown(app, ()=>logged.flatMap(x=>dayEntries(x.d)), `${trendState.range==="all"?"All time":"Last "+trendState.range+" days"}`, m=>Math.max(1,MICRO.some(x=>x[0]===m)?withMicros.length:logged.length), "treemap");
  app.querySelectorAll("[data-range]").forEach(b=>b.onclick=()=>{ const v=b.dataset.range; trendState.range=v==="all"?"all":+v; renderTrends(); });
  document.getElementById("metric").onchange=ev=>{ trendState.metric=ev.target.value; renderTrends(); };
  document.getElementById("topSel").onchange=ev=>{ trendState.top=ev.target.value; renderTrends(); };
  app.querySelectorAll("tr[data-day]").forEach(r=>r.onclick=()=>{ location.hash="#/day/"+r.dataset.day; });

  if(!chartDefaults()) return;
  const labels=keys.map(d=>dateOf(d).toLocaleDateString(undefined,{month:"short",day:"numeric"}));
  const vals=T.map((t,i)=>t.n&&!isOff(keys[i])?metricVal(t,mk):null);
  const roll=vals.map((_,i)=>{ const w=vals.slice(Math.max(0,i-6),i+1).filter(v=>v!=null); return w.length?w.reduce((a,b)=>a+b,0)/w.length:null; });
  const acc=css("--accent"), over=css("--over");
  const isLimit = ["kcal","sodium","sugar","addedSugar","satfat","cholesterol"].includes(mk);
  const ds=[{type:"bar",label:ml,data:vals,backgroundColor:vals.map(v=>target&&isLimit&&v>target?over:acc),borderRadius:4,maxBarThickness:28,order:2},
    {type:"line",label:"7-day average",data:roll,borderColor:css("--ink"),borderWidth:2,pointRadius:0,tension:.35,spanGaps:true,order:1}];
  if(target) ds.push({type:"line",label:isLimit?"Limit":"Target",data:keys.map(()=>target),borderColor:css("--muted"),borderDash:[5,4],borderWidth:1.5,pointRadius:0,order:0});
  const grid={color:css("--line")};
  { const all=DATA.days.filter(d=>d.weight); let pts=all.filter(d=>d.date>=start&&d.date<=end); if(pts.length<2) pts=all;
    const el=document.getElementById("cWeight");
    if(el&&pts.length>1){ const ws=pts.map(d=>d.weight);
      charts.push(new Chart(el,{type:"line",data:{labels:pts.map(d=>dateOf(d.date).toLocaleDateString(undefined,{month:"short",day:"numeric"})),
        datasets:[{label:"Weight",data:ws,borderColor:css("--accent"),backgroundColor:css("--accent"),borderWidth:2,pointRadius:3,tension:.25}]},
        options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${fmt(c.raw,1)} lb`}}},
          scales:{x:{grid:{display:false}},y:{suggestedMin:Math.floor(Math.min(...ws)-2),suggestedMax:Math.ceil(Math.max(...ws)+2),grid:{color:css("--line")},ticks:{callback:v=>fmt(v)+" lb"}}},
          onClick:(ev,els)=>{ if(els[0]) location.hash="#/day/"+pts[els[0].index].date; }}})); } }
  charts.push(new Chart(document.getElementById("cMetric"),{data:{labels,datasets:ds},
    options:{interaction:{mode:"index",intersect:false},plugins:{tooltip:{callbacks:{label:c=>c.raw==null?null:` ${c.dataset.label}: ${fmt(c.raw,mu==="mcg"||mu==="mg"&&c.raw<20?1:0)} ${mu}`}}},
      scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:true,grid,ticks:{callback:v=>fmt(v)}}},
      onClick:(ev,els)=>{ if(els[0]) location.hash="#/day/"+keys[els[0].index]; }}}));
  charts.push(new Chart(document.getElementById("cMacros"),{type:"bar",
    data:{labels,datasets:[["Protein","protein",4,"--p"],["Carbs","carbs",4,"--c"],["Fat","fat",9,"--f"]].map(([l,f,m,c])=>({label:l,data:T.map((t,i)=>t.n&&!isOff(keys[i])?Math.round(t[f]*m):null),backgroundColor:css(c),maxBarThickness:28}))},
    options:{interaction:{mode:"index",intersect:false},scales:{x:{stacked:true,grid:{display:false},ticks:{maxTicksLimit:8}},y:{stacked:true,grid,ticks:{callback:v=>fmt(v)}}}}}));
  charts.push(new Chart(document.getElementById("cMeals"),{type:"bar",
    data:{labels,datasets:MEALS.map(([m,l,c])=>({label:l,data:keys.map(d=>{const L=dayEntries(d).filter(e=>e.meal===m); return L.length?Math.round(totals(L).kcal):null;}),backgroundColor:css(c),maxBarThickness:28}))},
    options:{interaction:{mode:"index",intersect:false},scales:{x:{stacked:true,grid:{display:false},ticks:{maxTicksLimit:8}},y:{stacked:true,grid,ticks:{callback:v=>fmt(v)}}}}}));
  { const wv=keys.map(d=>isOff(d)?null:wholePct(dayEntries(d)));
    const wr=wv.map((_,i)=>{ const w=wv.slice(Math.max(0,i-6),i+1).filter(v=>v!=null); return w.length?w.reduce((a,b)=>a+b,0)/w.length:null; });
    charts.push(new Chart(document.getElementById("cWhole"),{data:{labels,datasets:[
      {type:"bar",label:"Whole food",data:wv,backgroundColor:wv.map(v=>v==null?"transparent":resolveColor(wholeColor(v/100))),borderRadius:4,maxBarThickness:28,order:2},
      {type:"line",label:"7-day average",data:wr,borderColor:css("--ink"),borderWidth:2,pointRadius:0,tension:.35,spanGaps:true,order:1}]},
      options:{interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw==null?null:` ${c.dataset.label}: ${fmt(c.raw)}%`}}},
        scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8}},y:{min:0,max:100,grid,ticks:{callback:v=>v+"%"}}},
        onClick:(ev,els)=>{ if(els[0]) location.hash="#/day/"+keys[els[0].index]; }}})); }
  charts.push(new Chart(document.getElementById("cProtMeal"),{type:"bar",
    data:{labels,datasets:MEALS.map(([m,l,c])=>({label:l,data:keys.map(d=>{ if(isOff(d)) return null; const L=dayEntries(d).filter(e=>e.meal===m); return L.length?Math.round(totals(L).protein):null;}),backgroundColor:css(c),maxBarThickness:28}))},
    options:{interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw==null?null:` ${c.dataset.label}: ${fmt(c.raw)} g`}}},
      scales:{x:{stacked:true,grid:{display:false},ticks:{maxTicksLimit:8}},y:{stacked:true,grid,ticks:{callback:v=>fmt(v)+" g"}}},
      onClick:(ev,els)=>{ if(els[0]) location.hash="#/day/"+keys[els[0].index]; }}}));
}
// Canvas can't paint color-mix(); resolve a CSS color expression to rgb via a probe element.
function resolveColor(expr){ const p=document.createElement("i"); p.style.color=expr; p.style.display="none"; document.body.appendChild(p); const c=getComputedStyle(p).color; p.remove(); return c; }
// Top foods for one nutrient over a range, per logged day, colored by whole-food score.
function topSources(entries,m,perDay){
  const [label,unit]=nutrientInfo(m);
  const rows=contributions(entries,m,true).map(([n,v,w])=>[n,v/perDay,w]); const total=rows.reduce((a,r)=>a+r[1],0);
  if(!total) return `<div class="muted">No ${esc(label.toLowerCase())} estimated in this range.</div>`;
  const dp=total<20?1:0, top=rows.slice(0,6), max=top[0][1];
  return `<div class="sub" style="margin-bottom:8px">${fmt(total,dp)} ${unit} per logged day · top 6 of ${rows.length} foods</div>
    <div class="toplist">${top.map(([n,v,w])=>`<div class="trow"><span class="tn" title="${esc(n)}">${esc(n)}</span><div class="bar"><i style="width:${v/max*100}%;background:${wholeColor(w)}"></i></div><span class="num">${fmt(v,dp)} ${unit}</span><span class="num muted">${fmt(v/total*100)}%</span></div>`).join("")}</div>
    <button class="linkbtn" data-nutr="${m}">See all foods ›</button>`;
}
// Vitamins and minerals averaging under 50% DV, with the logged foods that carry the most of each per usual portion.
function nutrientGaps(microAvg,nDays){
  if(!nDays) return `<div class="muted">No vitamin estimates in this range.</div>`;
  const skip=DATA.settings.gapExclude||[]; const gaps=MICRO.filter(([k,,,dv])=>!skip.includes(k)&&num(microAvg[k])/dv<.5);
  if(!gaps.length) return `<div class="muted">Every vitamin and mineral${skip.length?" you track from food":""} averages at least 50% of your target. Nice.</div>`;
  // Each food's average amount per logged portion, across all logged history.
  const foods=new Map();
  for(const d of DATA.days){ if(d.offDay) continue; for(const e of d.entries){ const s=num(e.servings||1);
    for(const c of (e.components||[])){ if(!c.micros||num(c.kcal)<=0) continue; if(c.whole!=null&&c.whole<.5) continue;
      const nm=foodKey(c.name).split(",")[0].trim(); const key=nm.toLowerCase(); const f=foods.get(key)||{name:nm,n:0,sum:{}}; f.n++;
      for(const [k] of MICRO) f.sum[k]=(f.sum[k]||0)+num(c.micros[k])*s; foods.set(key,f); } } }
  const list=[...foods.values()];
  return `<div class="gaps">${gaps.map(([k,l,u,dv])=>{ const p=num(microAvg[k])/dv*100;
    const best=list.map(f=>[f.name,f.sum[k]/f.n,f.n]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,3);
    return `<div class="gap"><div class="gap-h" data-nutr="${k}"><b>${esc(l)}</b><span class="pill ${p<25?"bad":"warn"}">${fmt(p)}% of target</span></div>
      <div class="sub">${best.length?best.map(([n,v,c])=>`${esc(n)} <span class="num">~${fmt(v/dv*100)}%</span>`).join(" · "):"No logged food has much of this yet."}</div></div>`; }).join("")}</div>
    <div class="hint">Percent after each food is its share of your daily target in the portion you usually log.</div>`;
}

/* ---------- recipes ---------- */
/* ---------- recipe cards ---------- */
const UNIT_CUPS={cup:1,tbsp:1/16,tsp:1/48,"fl oz":1/8,ml:1/236.588};
function cardHref(id){
  const c=(DATA.cards||[]).find(x=>x.id===id); if(!c||!c.recipe) return null;
  const r=DATA.recipes.find(x=>x.slug===c.recipe.file); if(!r) return null;
  const i=r.md.split(/^##\s+/m).slice(1).findIndex(p=>p.split("\n")[0].trim()===c.recipe.heading);
  return `#/recipes/${encodeURIComponent(r.slug)}/${Math.max(0,i)}`;
}
const fracText=x=>{ const w=Math.floor(x+1e-9), f=x-w; const F=[[0,""],[1/4,"1/4"],[1/3,"1/3"],[1/2,"1/2"],[2/3,"2/3"],[3/4,"3/4"]];
  const best=F.reduce((a,b)=>Math.abs(b[0]-f)<Math.abs(a[0]-f)?b:a); if(Math.abs(best[0]-f)>0.02) return fmt(x,2);
  if(Math.abs(f-1)<0.02) return String(w+1); return [w||"",best[1]].filter(Boolean).join(" ")||"0"; };
function cardSection(c){
  const yu=c.yield.unit, byServing=yu==="serving";
  const units=byServing?["serving","%","batch"]:["cup","tbsp","tsp","fl oz","ml","%","batch"];
  const hr=new Date().getHours(), meal=hr<11?"breakfast":hr<15?"lunch":hr<20?"dinner":"snacks";
  return `<section class="card rcard" id="rcard">
    <div class="card-h"><h2>Recipe card</h2><span class="sub">Makes ${fmt(c.yield.amount,2)} ${esc(yu)}${c.yield.amount===1?"":"s"} · ${fmt(c.batch.kcal/c.yield.amount)} kcal per ${esc(yu)} · ${fmt(c.batch.kcal)} kcal per batch</span></div>
    <div class="rc-form">
      <label>Portion <input id="rc-amt" type="number" min="0" step="0.25" value="1" inputmode="decimal"></label>
      <select id="rc-unit" aria-label="Unit">${units.map(u=>`<option${u===(byServing?"serving":"cup")?" selected":""}>${u}</option>`).join("")}</select>
      <select id="rc-meal" aria-label="Meal">${MEALS.map(([m,l])=>`<option value="${m}"${m===meal?" selected":""}>${l}</option>`).join("")}</select>
      <button class="btn" id="rc-copy">Copy for Claude</button>
    </div>
    <div class="rc-sum" id="rc-sum"></div>
    <div class="tblwrap"><table class="comps"><thead><tr><th>Ingredient</th><th>In batch</th><th>g</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr></thead><tbody id="rc-rows"></tbody></table></div>
    ${c.notes?`<div class="sub">${esc(c.notes)}</div>`:""}
  </section>`;
}
function wireCard(c){
  const amt=document.getElementById("rc-amt"), unit=document.getElementById("rc-unit"), mealSel=document.getElementById("rc-meal");
  const frac=()=>{ const a=num(amt.value), u=unit.value;
    if(u==="%") return a/100; if(u==="batch") return a; if(u==="serving") return a/c.yield.amount;
    return a*UNIT_CUPS[u]/(c.yield.amount*(UNIT_CUPS[c.yield.unit]||1)); };
  const label=()=>`${fracText(num(amt.value))}${unit.value==="%"?"%":" "+unit.value}`;
  const draw=()=>{ const f=frac(); const cs=c.batchComponents;
    const T=k=>cs.reduce((a,x)=>a+num(x[k]),0)*f;
    document.getElementById("rc-rows").innerHTML=cs.map((x,i)=>`<tr><td><i style="background:${COMP_COLORS[i%COMP_COLORS.length]}"></i>${esc(c.ingredients[i].name)}</td><td class="por">${esc(c.ingredients[i].amount)}</td>
      <td class="num">${fmt(x.grams*f,1)}</td><td class="num">${fmt(x.kcal*f)}</td><td class="num">${fmt(x.protein*f,1)}</td><td class="num">${fmt(x.carbs*f,1)}</td><td class="num">${fmt(x.fat*f,1)}</td></tr>`).join("")
      +`<tr class="tot"><td>Total</td><td></td><td class="num">${fmt(T("grams"))}</td><td class="num">${fmt(T("kcal"))}</td><td class="num">${fmt(T("protein"),1)}</td><td class="num">${fmt(T("carbs"),1)}</td><td class="num">${fmt(T("fat"),1)}</td></tr>`;
    const w=cs.reduce((a,x)=>a+num(x.kcal)*num(x.whole),0)/(cs.reduce((a,x)=>a+num(x.kcal),0)||1)*100;
    document.getElementById("rc-sum").innerHTML=`<b>${label()}</b> = ${fmt(f*100,1)}% of the batch: <b>${fmt(T("kcal"))} kcal</b> · ${fmt(T("protein"))} g protein · ${fmt(T("carbs"))} g carbs · ${fmt(T("fat"))} g fat · ${fmt(T("fiber"),1)} g fiber · ${fmt(T("sodium"))} mg sodium · ${fmt(w)}% whole food`;
  };
  amt.oninput=draw; unit.onchange=draw; draw();
  document.getElementById("rc-copy").onclick=async()=>{
    const txt=`Plate Log recipe, ${c.id}, ${label()}, ${mealSel.value}, ${todayKey()}: `;
    try{ await navigator.clipboard.writeText(txt); toast("Copied. Paste it to Claude to log it."); }
    catch{ prompt("Copy this and send it to Claude to log it:",txt); }
  };
}

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
    const rc=(DATA.cards||[]).find(c=>c.recipe&&c.recipe.file===slug&&c.recipe.heading===title);
    app.innerHTML=`<div class="toolbar"><a class="btn" href="#/recipes">‹ All recipes</a>
        <div class="btns"><button class="btn" id="cook" aria-pressed="false">Cook mode</button><button class="btn" id="reset">Clear checks</button></div></div>
      <header class="rhead"><div class="sub">${esc(r.title)}</div><h1>${esc(title)}</h1>${cr?`<div class="credit">Recipe from <b>${esc(cr.who)}</b></div>`:""}</header>
      ${rc?cardSection(rc):""}
      <div class="recipe ${methMd?"":"single"}">
        <section class="card rcol ing"><h2>${methMd?"Ingredients":"Recipe"}</h2><div class="prose">${md(ingMd)}</div></section>
        ${methMd?`<section class="card rcol meth"><h2>Method</h2><div class="prose">${md(methMd)}</div></section>`:""}
      </div>
      <div class="toolbar">${nav(prev,"‹ "+esc((parts[prev]||"").split("\n")[0]))}<span></span>${nav(next,esc((parts[next]||"").split("\n")[0])+" ›")}</div>`;
    if(rc) wireCard(rc);
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
    list.innerHTML=items.map(x=>`<a href="#/recipes/${encodeURIComponent(x.r.slug)}${x.i!=null?"/"+x.i:""}"><b>${esc(x.name)}</b><span>${esc(x.r.title)}${(c=>c?" · from "+esc(c.who):"")(creditOf(x.body))}${(DATA.cards||[]).some(c=>c.recipe&&c.recipe.file===x.r.slug&&c.recipe.heading===x.name)?" · recipe card":""}</span></a>`).join("")||`<p class="muted">No matches.</p>`;
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
  DATA=d; { const T=(d.settings||{}).microTargets||{}; for(const m of MICRO) if(T[m[0]]>0) m[3]=T[m[0]]; }
  DATA.days.sort((a,b)=>a.date<b.date?-1:1); byDate=new Map(DATA.days.map(x=>[x.date,x]));
  const g=document.getElementById("gen"); if(g&&d.generated) g.textContent=`Updated ${new Date(d.generated).toLocaleString()} · estimates are typically within 20–30%`;
  route();
}).catch(()=>{ app.innerHTML=`<p>Couldn't load the log data. Reload the page to try again.</p>`; });
})();
