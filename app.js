/* =========================================================
   状態
   ========================================================= */
const S = {
  kmMode:"direct", annualKm:8000, monthlySpend:10000, curFe:15,
  gasKey:"", evKey:"",
  gc_price:2500000, gc_fe:18, gc_tax:30500, gc_wt:7500,
  ec_price:4000000, ec_sub:0, ec_wh:150, ec_kwh:50, ec_tax:25000, ec_wt:0,
  homeCharge:true, homeShare:80, years:7,
  evAdj:0, gasAdj:0, evFees:0, gasFees:0,
  pGas:170, pHome:31, pPub:60, charger:150000, mGas:40000, mEv:25000, insGas:60000, insEv:60000,
  cSum:0.9, cWin:0.7, rGas:0.85, rEv:0.9, usable:70, scen:"mid",
  seenCost:false,
  city:"utsunomiya",          // 住んでいる市町（市町の補助金）
  rivalType:"gas", gFe:"",   // gFe：燃費を書き換えたとき（空なら車種のカタログ値）         // 比べる相手：gas（ガソリン車）/ hv（ハイブリッド車）
  // ---- 今日の走り（レンタカー返却時） ----
  dCar:"n-one-e", dKm:"", dSoc0:"", dSoc1:"", dSeason:"", dUse:false,
  // ---- 相談メモ ----
  memoAsks:{}, memoNote:"", memoInit:false, memoExt:null, fromLink:false,
  // ---- マップ機能（生活圏・旅行） ----
  pDest:0,                 // 目的地の充電単価（施設データに price がないとき）
  home:null, work:null, places:[],   // {lat,lng,label,detail} / work:+days / place:+cat,freq
  pickTarget:"home", searchQ:"", searchResults:[], searchMsg:"",
  layers:{quick:true, normal:true, merit:true, honda:true},
  chgFilter:"all", chgQ:"", chgShow:60,
  selPlace:null, selFac:null,
  trip:{dest:null, overnight:true, stayH:3, season:"win", startSoc:100, destCharge:true, reserve:20},
  tripQ:"", tripResults:[], tripMsg:"",
  area:null, tripRes:null, kmApplied:false
};
/* 自動で確かめた補助金の情報（subsidy.js）があれば、cars.js の値を置き換える */
(function applySubsidyAuto(){
  const a = window.SUBSIDY_AUTO; if (!a) return;
  Object.entries(a.subsidy || {}).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== "") SUBSIDY[k] = v; });
  if (a.checkedAt) SUBSIDY.checkedAt = a.checkedAt;
  Object.entries(a.amounts || {}).forEach(([k, v]) => { if (EVS[k] && v > 0) EVS[k].sub = v; });
})();
const n = k => { const v = parseFloat(S[k]); return isFinite(v) ? v : 0; };
const yen = v => (v<0?"−":"") + "¥" + Math.round(Math.abs(v)).toLocaleString("ja-JP");
const man = v => (v<0?"−":"") + (Math.abs(v)/10000).toFixed(1).replace(/\.0$/,"") + "万円";
const sman = v => (v>0?"+":v<0?"−":"±") + (Math.abs(v)/10000).toFixed(1).replace(/\.0$/,"") + "万円";

function gasCar(){ const d=GASES[S.gasKey]; if(!d) return null;
  if (d.custom) return {name:d.name, price:n("gc_price"), fe:n("gc_fe"), tax:n("gc_tax"), wt:n("gc_wt")};
  const fe = parseFloat(S.gFe); return {...d, fe: fe > 0 ? fe : d.fe}; }
function evCar(){ const d=EVS[S.evKey]; if(!d) return null;
  return d.custom ? {name:d.name, price:n("ec_price"), sub:SUBSIDY.closed?0:n("ec_sub"), wh:n("ec_wh"), kwh:n("ec_kwh"), tax:n("ec_tax"), wt:n("ec_wt")} : {...d, sub:subOf(d)}; }
function rivalType(){ const d=GASES[S.gasKey]; return d && !d.custom ? d.type : S.rivalType; }
const rivalShort = () => RIVAL_SHORT[rivalType()] || "ガソリン車";
const rivalLong = () => RIVAL_LABEL[rivalType()] || "ガソリン車";
/* 市町の補助金。計算に入れるのは受付中（open / soon）のときだけ */
function localSub(E){
  const L = (window.LOCAL_SUBSIDY||[]).find(x => x.id===S.city) || null;
  if (!L) return {L:null, shown:0, counted:0};
  const shown = E && E.kei && L.amountKei ? L.amountKei : (L.amount||0);
  return {L, shown, counted: ["open","soon"].includes(L.status) ? shown : 0};
}
function annualKm(){ return false ? n("monthlySpend")*12/Math.max(n("pGas"),1)*n("curFe") : n("annualKm"); }
const doneB = () => !!(S.gasKey && S.evKey && S.seenCost);

/* =========================================================
   計算（コスト比較）
   ========================================================= */
function calc(){
  const G = gasCar(), E = evCar(); if(!G||!E) return null;
  const km = annualKm(), N = n("years");
  const share = S.homeCharge ? n("homeShare")/100 : 0;
  const pGas=n("pGas"), pHome=n("pHome"), pPub=n("pPub");
  const cSum=n("cSum")||1, cWin=n("cWin")||1, rGas=n("rGas")||1, rEv=n("rEv")||1;

  const gPrice = G.price + n("gasAdj"), ePrice = E.price + n("evAdj");
  const charger = S.homeCharge ? n("charger") : 0;
  const gInit = gPrice + n("gasFees");
  const LS = localSub(E);
  const eInit = ePrice - E.sub - LS.counted + n("evFees") + charger;

  const feReal = Math.max(G.fe,0.1)*rGas;
  const gasEnergy = km/feReal*pGas;
  const dr = driveForCalc();
  const whReal = dr ? dr.whBase : E.wh/rEv;
  const kWhYear = [1,cSum,1,cWin].reduce((s,c)=> s + (km/4)*whReal/1000/c, 0);
  const avgElec = share*pHome + (1-share)*pPub;
  const evEnergy = kWhYear*avgElec;

  const gAnnual = gasEnergy + G.tax + G.wt + n("mGas") + n("insGas");
  const eAnnual = evEnergy + E.tax + E.wt + n("mEv") + n("insEv");
  const resid = (p,r) => p*Math.pow(1-r,N);
  const gRes = resid(G.price, DEP.gas[S.scen]), eRes = resid(E.price, DEP.ev[S.scen]);
  const gTotal = gInit + gAnnual*N - gRes, eTotal = eInit + eAnnual*N - eRes;

  const dInit = eInit-gInit, dAnnual = gAnnual-eAnnual;
  let cross, crossT=null;
  if (dInit<=0 && dAnnual>=0) cross = "購入時からEVが安い";
  else if (dAnnual<=0) cross = "この条件では逆転しない";
  else { crossT = dInit/dAnnual; cross = crossT>30 ? "30年超" : `約${crossT.toFixed(1)}年目`; }

  const usable = n("usable")/100, weekKm = km/52;
  const rangeAt = c => E.kwh*usable*1000/(whReal/c);
  const freq = c => { const pw = weekKm/Math.max(rangeAt(c),1); if(pw<=0) return "―"; const d=7/pw; return `週 ${pw.toFixed(1)} 回（約${d>=1?Math.round(d):d.toFixed(1)}日に1回）`; };
  const eKwhKm = kWhYear/Math.max(km,1);

  const scen = ["hi","mid","lo"].map(s => {
    const gr=resid(G.price,DEP.gas[s]), er=resid(E.price,DEP.ev[s]);
    return {s, gr, er, d:(eInit+eAnnual*N-er)-(gInit+gAnnual*N-gr)};
  });
  return {G,E,km,N,gPrice,ePrice,charger,gInit,eInit,gasEnergy,evEnergy,gAnnual,eAnnual,gRes,eRes,gTotal,eTotal,
    diff:eTotal-gTotal, dInit, dAnnual, cross, crossT,
    k100g:100/(pGas/feReal), k100h:S.homeCharge?100/(eKwhKm*pHome):null, k100a:100/(eKwhKm*avgElec),
    fq:{mid:freq(1), sum:freq(cSum), win:freq(cWin)}, rangeMid:rangeAt(1), rangeWin:rangeAt(cWin), usable, scen, drive:dr, local:LS, subTotal:E.sub+LS.counted};
}

/* =========================================================
   UI部品
   ========================================================= */
const CHEV_L='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
const CHEV_R='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';
const header = (title, back, tag) => `<header class="hd">${back?`<button class="back" data-go="${back}" aria-label="戻る">${CHEV_L}</button>`:'<div style="width:8px"></div>'}<h1 class="ttl">${title}</h1><span class="tag">${tag}</span></header>`;
const footer = (...b) => `<footer class="ft">${b.join("")}</footer>`;
const btn = (to,t,dis) => `<button class="btn" data-go="${to}"${dis?' disabled aria-disabled="true" style="opacity:.45;cursor:not-allowed"':""}>${t}</button>`;
const btn2 = (to,t) => `<button class="btn2" data-go="${to}">${t}</button>`;
const numIn = (k,label,step=1,flag=false) => `<label class="f">${label}${flag?' <span class="flag">要確認</span>':""}<input type="number" inputmode="decimal" data-k="${k}" value="${S[k]}" step="${step}"></label>`;
const slider = (k,label,min,max,step,fmt,lo,hi,id) => `<div class="slider"><div class="top"><label for="${k}" style="font-size:14px">${label}</label><span class="val num" id="${id}">${fmt(S[k])}</span></div><input type="range" id="${k}" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"><div class="rg"><span>${lo}</span><span>${hi}</span></div></div>`;
/* イラスト（images.js）。写真があれば photo を優先 */
const pic = (k, s=48, cls="") => (window.IMG && IMG[k]) ? `<img class="pic ${cls}" src="${IMG[k]}" width="${s}" height="${s}" alt="" decoding="async">` : "";
const carPic = (d, s=64) => d.photo ? `<img class="pic carphoto" src="${d.photo}" width="${Math.round(s*1.5)}" height="${s}" alt="">` : pic(d.pic||"car", s);
/* 車の「使い方の印象」（価格は出さない） */
const SEAT_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>';
const feel = d => `<span class="feel"><span class="seat">${SEAT_SVG}${d.seats||"―"}</span><span>${d.size||d.cat||""}</span><span>${d.use||""}</span>${d.range?`<span>${pic("battery",18)}満充電で約${d.range}km</span>`:""}</span>`;
const spec = items => `<dl class="spec">${items.map(([t,v])=>`<div><dt>${t}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

/* =========================================================
   画面
   ========================================================= */
const screens = {};

screens.home = () => header("EV Life Simulator",null,"ホーム") + `<main class="main home1">
    <div class="hero"><div class="herorow" aria-hidden="true">${pic("house",72)}${pic("plug",56)}${pic("car",96)}</div>
      <h1>EVに買い替えたら、<br>お金はどう変わる？</h1>
      <p>今の車とEVを比べて、<b>補助金</b>と<b>燃料代</b>でいくら変わるかを計算します。</p></div>
    <button class="startcard" data-go="ev"><span class="sc-tx"><span class="k">約3分</span><span class="t">シミュレーションを始める</span><span class="sc-chips"><span>${pic("tag",22)}補助金</span><span>${pic("fuel",22)}燃料代</span></span></span><span class="sc-pic">${pic("yen",76)}</span></button>
  </main>`;

screens.gas = () => {
  const G = GASES[S.gasKey], E = EVS[S.evKey];
  const presets = [5000, 8000, 10000, 15000];
  return header("使い方を入れる","ev","入力 2/2") + `<main class="main">
    ${E && G ? `<div class="vsrow">${carPic(E,48)}<span class="vs-t"><b>${E.name}</b><span>と、同じクラスのガソリン車（${G.name}）を比べます</span></span>${carPic(G,40)}</div>` : ""}
    <section class="sec"><h2>${pic("road",28)} 1年に走る距離</h2>
      <div class="kmrow"><input type="number" inputmode="numeric" data-k="annualKm" value="${S.annualKm}" step="500" min="0" aria-label="1年に走る距離（km）"><span>km / 年</span></div>
      <div class="chips">${presets.map(v=>`<button type="button" class="chip" aria-pressed="${+S.annualKm===v}" data-act="setKm:${v}">${v.toLocaleString("ja-JP")}km</button>`).join("")}</div>
      <p class="hint" style="margin:0">分からなければ 8,000km（月に約670km）で計算できます</p>
    </section>
    <section class="sec"><h2>${pic("fuel",28)} 燃費とガソリン代</h2>
      <div class="row2">
        <label class="f">ガソリン車の燃費（km/L）<input type="number" inputmode="decimal" data-k="gFe" value="${S.gFe!==""?S.gFe:(G?.fe??"")}" step="0.1" min="0"></label>
        <label class="f">ガソリン代（円/L）<input type="number" inputmode="numeric" data-k="pGas" value="${S.pGas}" step="1" min="0"></label>
      </div>
      <p class="hint" style="margin:0">燃費は同じクラスの新車のカタログ値（仮）です。今の車の燃費に変えてもOK。実際はカタログの約85%として計算します</p>
    </section>
  </main>` + footer(btn("cost","結果を見る", !S.evKey));
};
screens.gas.update = () => document.querySelectorAll('[data-act^="setKm:"]').forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.act.split(":")[1] === +S.annualKm)));

screens.ev = () => {
  const G = GASES[S.gasKey];
  const cards = Object.entries(EVS).filter(([k,d]) => !d.custom).map(([k,d]) => `<label class="carc"><input type="radio" name="evKey" data-k="evKey" value="${k}"${S.evKey===k?" checked":""}>
    <span class="cpic">${carPic(d,56)}<span class="plugbadge">${pic("plug",22)}</span></span><span class="b"><span class="nm">${d.name}</span>${feel(d)}</span></label>`).join("");
  const custom = "";
  return header("気になるEV","home","入力 1/2") + `<main class="main">
    <section class="sec"><h2>EVを選ぶ</h2><div class="cars" role="radiogroup" aria-label="EV新車">${cards}</div>${custom}</section>
  </main>` + footer(btn("gas","次へ：使い方を入れる", !S.evKey));
};

screens.cost = () => {
  S.seenCost = true;
  return header("コスト比較","gas","結果") + `<main class="main" style="gap:16px">
    <div class="pair"><section class="pillar" id="p2" aria-labelledby="p2t"></section>
    <section class="pillar" id="p1" aria-labelledby="p1t"></section></div>
    <section class="p3">
      <div class="pillar-kick">ガソリン車とトータルで比べると</div>
      <section class="sumtop" id="sumtop" aria-live="polite"></section>
      ${slider("years","保有予定年数",1,15,1,v=>v+"年","1年","15年","yearsOut")}
      <svg id="chart" viewBox="0 0 520 260" width="100%" role="img" aria-label="累計コストの推移"></svg>
      <div class="legend"><span><i class="sw g"></i><span id="lgG">ガソリン車</span></span><span><i class="sw e"></i>EV</span><span>最終年の右の点は残価を差し引いた総額</span></div>
      <p class="hint" id="p3note" style="margin:0"></p>
      <div class="warnbox" id="clawback" hidden></div>
    </section>
    <section class="evlife" id="evlife"></section>
    <button class="mapguide" data-go="map"><span class="mg-pic">${pic("map",56)}<span class="mg-plug">${pic("plug",26)}</span></span>
      <span class="mg-tx"><b>充電する場所は？ 地図でくわしく</b><span>家の近く・いつもの場所・旅行先までの充電スポットと、夏・冬で行けるかが分かります</span></span>
      <span class="mg-go">地図を見る${CHEV_R}</span></button>
    <div class="cond" id="cond"></div>
    <details id="more"><summary>内訳と条件を詳しく見る</summary><div class="body" style="gap:20px">
      <section class="sec"><h2 id="tblTitle">内訳</h2><div class="tablewrap"><table class="num"><thead><tr><th>項目</th><th class="g" id="thG">ガソリン車</th><th class="e">EV</th><th>差</th></tr></thead><tbody id="tbody"></tbody></table></div></section>
      <section class="sec"><h2>充電の頻度（目安）</h2><div class="kv" id="freq"></div><p class="hint" id="freqNote"></p></section>
      <section class="sec"><h2>売却時の残価による違い</h2><div class="tablewrap"><table class="num"><thead><tr><th>シナリオ <span class="flag">要確認</span></th><th class="g">比べる車の残価</th><th class="e">EV残価</th><th>総額の差</th></tr></thead><tbody id="scBody"></tbody></table></div></section>
    </div></details>
    <details><summary>単価・係数の設定</summary><div class="body">
      <label class="chk"><input type="checkbox" data-k="homeCharge"${S.homeCharge?" checked":""}>自宅で充電できる</label>
      <div id="shareWrap"${S.homeCharge?"":" hidden"}>${slider("homeShare","自宅で充電する割合",0,100,5,v=>v+"%","すべて外で","すべて自宅","shareOut")}</div>
      <div class="row2">
      ${numIn("pGas","ガソリン（円/L）",1)}${numIn("pHome","自宅の電気（円/kWh）",1)}
      ${numIn("pPub","公共充電（円/kWh換算）",1,true)}${numIn("charger","充電器の設置費（円）",10000,true)}
      ${numIn("mGas","メンテ・車検 比べる車（円/年）",1000,true)}${numIn("mEv","メンテ・車検 EV（円/年）",1000,true)}
      ${numIn("insGas","保険 比べる車（円/年）",1000,true)}${numIn("insEv","保険 EV（円/年）",1000,true)}
      ${numIn("cSum","夏の電費係数",0.05,true)}${numIn("cWin","冬の電費係数",0.05,true)}
      ${numIn("rGas","実燃費／カタログ",0.05,true)}${numIn("rEv","実電費／カタログ",0.05,true)}
      ${numIn("usable","日常で使う充電幅（%）",5)}
      <label class="f">残価シナリオ<select data-k="scen">${["hi","mid","lo"].map(s=>`<option value="${s}"${S.scen===s?" selected":""}>${SCEN_LABEL[s]}</option>`).join("")}</select></label>
    </div></div></details>
  </main>` + footer(btn("memo","相談メモを作る"), btn2("total","暮らし・おでかけも見る"));
};

/* 補助金の受付期限（次世代自動車振興センターの発表。cars.js の SUBSIDY） */
function subsidyBox(){
  const st = subsidyStatus();
  const main = st.state==="open"||st.state==="near" ? `${SUBSIDY.endText}まで（見込み）・あと約${st.days}日` : st.text;
  return `<div class="deadline ${st.state}"><b>${pic("hourglass",24)}補助金の受付期限</b><span>${main}</span>
    ${st.state==="closed" ? "" : `<span class="dl-sub">登録から1か月以内に申請。納車が間に合うか確認を（${jpDate(SUBSIDY.noticeDate)}発表）</span>`}
    <a href="${SUBSIDY.url}" target="_blank" rel="noopener">最新の情報を見る（次世代自動車振興センター）</a></div>`;
}

/* 横棒1本（①②で共通） */
function barRow(label, value, pct, color, opts={}){
  const hatch = opts.hatchPct ? `<span class="hatch" style="left:${pct}%;width:${opts.hatchPct}%"></span><span class="subtag" style="left:min(${pct}%, calc(100% - 7em))">${opts.hatchLabel}</span>` : "";
  return `<div class="br${opts.big?" big":""}"><span class="lb"${opts.big?' style="color:var(--ev);font-weight:700"':""}>${label}</span>
    <span class="tr"><span class="fill" style="width:${pct}%;background:${color}"></span>${hatch}</span>
    <span class="v num"${opts.vColor?` style="color:${opts.vColor}"`:""}>${value}</span></div>`;
}
const man0 = v => `${Math.round(Math.abs(v)/10000).toLocaleString("ja-JP")}万円`;
const yen100 = v => `${(Math.round(Math.abs(v)/100)*100).toLocaleString("ja-JP")}円`;

screens.cost.update = () => {
  const r = calc(); if(!r) return;
  const share = S.homeCharge ? Math.round(n("homeShare")) : 0;
  const km = Math.round(r.km);
  const rv = rivalShort();
  const drTxt = r.drive ? `<br><span style="color:var(--ev);font-weight:700">電費：今日の走り（${r.drive.kmPerKwh.toFixed(1)}km/kWh）</span> <button class="lk" data-act="driveOff" style="min-height:32px;margin:0;padding:0 6px;font-size:12px">カタログ値に戻す</button>` : "";
  document.getElementById("cond").innerHTML = `<div><b>${r.E.name} と ${r.G.name}（${rv}）</b><br>年${km.toLocaleString("ja-JP")}km・${r.N}年・${S.homeCharge?`自宅充電${share}%`:"自宅充電なし"}${drTxt}</div><button class="lk" data-go="gas" style="margin:0;white-space:nowrap">条件を変える</button>`;
  document.getElementById("lgG").textContent = `${r.G.name}（${rv}）`;
  document.getElementById("thG").textContent = rv;

  /* 結論（一番上） */
  const runDiff = r.gAnnual - r.eAnnual;
  const cheaperFrom = r.dInit<=0 && r.dAnnual>=0 ? "買った時から" : (r.crossT!==null && r.crossT<=30 ? `約${r.crossT.toFixed(1)}年目から` : "この条件では安くならない");
  document.getElementById("sumtop").innerHTML = `
    ${r.diff < 0
      ? `<div class="st-big">${r.N}年で <span class="who ev">EV</span> が<br><em class="num">約${man(-r.diff)}</em> 安い</div>`
      : `<div class="st-big bad">${r.N}年で <span class="who gas">${rv}</span> が<br><em class="num">約${man(r.diff)}</em> 安い</div>`}
    <div class="st-grid">
      <div><span>${pic("plug",20)} 維持費/年</span><b class="num">${runDiff>=0?"−":"+"}${man(Math.abs(runDiff))}</b></div>
      <div><span>${pic("tag",20)} 補助金</span><b class="num">${r.subTotal>0?`−${man0(r.subTotal)}`:"―"}</b></div>
      <div><span>${pic("hourglass",20)} ${rv}より安くなるのは</span><b class="num">${cheaperFrom}</b></div>
    </div>`;

  /* 買うとき：補助金（国＋市町） */
  const LS = r.local, L = LS.L;
  const sub = r.subTotal, eList = r.ePrice, eReal = r.ePrice - sub, gP = r.gPrice;
  const maxP = Math.max(eList, gP, 1), pc = v => Math.max(0, v / maxP * 100);
  const st = subsidyStatus();
  const natUntil = st.state==="open"||st.state==="near" ? `${SUBSIDY.endText}まで（見込み）・あと約${st.days}日` : st.text;
  const LBL = window.LOCAL_STATUS_LABEL || {};
  const cityOpts = (window.LOCAL_SUBSIDY||[]).map(x => `<option value="${x.id}"${x.id===S.city?" selected":""}>${x.name}</option>`).join("");
  const localAmt = !L ? "―" : L.status==="none" ? "補助なし" : LS.shown ? `−${man0(LS.shown)}` : "金額は確認中";
  const p1title = sub > 0
    ? `<h2 class="ttl" id="p1t">補助金で<br><em class="num">${man0(sub)}</em> <span class="nw">安く買える</span></h2>`
    : `<h2 class="ttl" id="p1t">いま使える補助金は<br><em style="font-size:28px">見つかりません</em></h2>`;
  document.getElementById("p1").innerHTML = `<span class="pillpic">${pic("tag",72)}</span><div class="kick">買うとき</div>${p1title}
    <label class="cityrow"><span>${pic("pin",22)}お住まいの市町</span><select data-k="city" aria-label="お住まいの市町">${cityOpts}</select></label>
    <div class="subrows">
      <div class="subrow"><div class="sr-h"><b>国のCEV補助金</b><span class="sbadge ${SUBSIDY.closed?"closed":st.state==="near"||st.state==="now"?"soon":"open"}">${SUBSIDY.closed?"受付終了":"受付中"}</span><em class="num">${r.E.sub>0?`−${man0(r.E.sub)}`:"―"}</em></div>
        <div class="sr-d">${pic("hourglass",18)}${natUntil}</div></div>
      ${L ? `<div class="subrow"><div class="sr-h"><b>${L.name}の補助金</b><span class="sbadge ${L.status}">${LBL[L.status]||""}</span><em class="num${LS.shown&&!LS.counted?" off":""}${!LS.shown?" na":""}">${localAmt}</em></div>
        <div class="sr-d">${pic("hourglass",18)}${esc(L.until)}</div>
        ${L.note?`<div class="sr-n">${esc(L.note)}</div>`:""}
        ${LS.shown && !LS.counted ? `<div class="sr-n warn">受付が終わっているため、計算には入れていません</div>` : ""}
        ${L.url?`<a class="sr-l" href="${L.url}" target="_blank" rel="noopener">${L.name}のページで確かめる</a>`:""}</div>` : ""}
    </div>
    <div class="bars">
      ${barRow("車両価格", man0(eList), pc(eReal), "var(--evl)", sub>0?{hatchPct:pc(sub), hatchLabel:`補助金 −${man0(sub)}`}:{})}
      ${barRow("実質の価格", man0(eReal), pc(eReal), "var(--ev)", {big:true})}
      ${barRow(rv, man0(gP), pc(gP), "var(--gas)", {vColor:"var(--gas)"})}
    </div>
    <details class="mini"><summary>補助金について</summary><p class="hint" style="margin:0">${subsidyNote()}　登録から1か月以内に申請。納車が間に合うか確認を（${jpDate(SUBSIDY.noticeDate)}発表）。市町の補助は${jpDate(window.LOCAL_SUBSIDY_CHECKED||"2026-10-18")}時点で各市町のページを確認したもの。 <a href="${SUBSIDY.url}" target="_blank" rel="noopener">国の補助金の最新情報</a></p></details>`;

  /* 乗るとき：100円で走れる距離 → ランニングコスト（1年あたり） */
  const gParts = [r.gasEnergy, r.G.tax+r.G.wt, n("mGas"), n("insGas")];
  const eParts = [r.evEnergy, r.E.tax+r.E.wt, n("mEv"), n("insEv")];
  const gM = gParts.reduce((a,b)=>a+b,0), eM = eParts.reduce((a,b)=>a+b,0), dM = gM - eM;
  const maxM = Math.max(gM, eM, 1);
  const RC = [["燃料・電気代",null],["税金","var(--rc2)"],["メンテ・車検","var(--rc3)"],["保険","var(--rc4)"]];
  const stack = (parts, main) => `<span class="stk">${parts.map((v,k)=>`<i style="width:${v/maxM*100}%;background:${k===0?main:RC[k][1]}"></i>`).join("")}</span>`;
  const yen1000 = v => `${(Math.round(Math.abs(v)/1000)*1000).toLocaleString("ja-JP")}円`;
  const diffRow = (label, k, note) => { const d = gParts[k]-eParts[k]; return `<div class="rcd"><span>${label}</span><b class="num">${Math.abs(d)<500?"ほぼ同じ":`年 ${d>0?"−":"+"}${yen1000(d)}`}</b>${note?`<small>${note}</small>`:""}</div>`; };
  const kmax = Math.max(r.k100g, r.k100a, 1);
  const road = (cls, img, label, v, sub) => `<div class="road ${cls}"><div class="rd-l">${pic(img,26)}<span>${label}</span></div>
      <div class="rd-track"><span class="rd-fill" style="width:${v/kmax*100}%"><span class="rd-car">${pic("car",34)}</span></span></div>
      <div class="rd-v"><b class="num">${v.toFixed(1)}</b><span>km</span></div><small>${sub}</small></div>`;
  document.getElementById("p2").innerHTML = `<div class="k100hero">
      <h2 class="k100h">${pic("coin",34)}100円で走れる距離</h2>
      ${road("g","fuel",rv,r.k100g,`ガソリン ${n("pGas")}円/L・燃費${r.G.fe}km/L`)}
      ${road("e","plug","EV",r.k100a,S.homeCharge?`自宅${Math.round(n("homeShare"))}%・外で充電`:"外で充電")}
    </div>
    <h3 class="ttl2" id="p2t">${dM >= 0 ? `ランニングコストが<br>年 <em class="num">約${man(dM)}</em> <span class="nw">安い</span>` : `ランニングコストが 年 約${man(-dM)} 高い`}</h3>
    <div class="bars">
      <div class="br"><span class="lb">${pic("fuel",26)}<span>${rv}</span></span>${stack(gParts,"var(--gas)")}<span class="v num" style="color:var(--gas)">年${man(gM)}</span></div>
      <div class="br big"><span class="lb" style="color:var(--ev);font-weight:700">${pic("plug",26)}<span>EV</span></span>${stack(eParts,"var(--ev)")}<span class="v num">年${man(eM)}</span></div>
    </div>
    <div class="rclg">${RC.map(([l,c],k)=>`<span><i style="background:${k===0?"linear-gradient(90deg,var(--gas) 50%,var(--ev) 50%)":c}"></i>${l}</span>`).join("")}</div>
    <div class="rcds">
      ${diffRow(`${pic("fuel",22)}燃料・電気代`,0, `${rv}は燃費${r.G.fe}km/L（実際は約${(r.G.fe*(n("rGas")||1)).toFixed(1)}km/L）で計算`)}
      ${diffRow(`${pic("yen",22)}税金`,1, `自動車税 年${(r.G.tax-r.E.tax).toLocaleString("ja-JP")}円・重量税 年${(r.G.wt-r.E.wt).toLocaleString("ja-JP")}円の差`)}
      ${diffRow(`${pic("check",22)}メンテ・車検`,2, "エンジンオイル交換などがない（目安）")}
      ${diffRow(`${pic("clipboard",22)}保険`,3, "同じ金額で計算（目安）")}
    </div>
    <p class="note">※ 金額は1年あたり（年${km.toLocaleString("ja-JP")}km${r.drive?"・電費は今日の走りから":""}）。メンテ・保険は目安です</p>`;

  /* ③ 合わせると（見出しは上の sumtop） */
  document.getElementById("p3note").textContent = `${r.charger?`充電器の設置費${man(r.charger)}・`:""}税・メンテナンス・売却時の価値（残価${SCEN_LABEL[S.scen]}）を含めた総額で計算`;
  document.getElementById("yearsOut").textContent = r.N+"年";

  /* 詳しく */
  document.getElementById("tblTitle").textContent = `内訳（${r.N}年）`;
  const rows = [
    ["車両価格",r.gPrice,r.ePrice],["補助金（国）",0,-r.E.sub],["補助金（市町）",0,-r.local.counted],["購入時の税・諸費用",n("gasFees"),n("evFees")],["充電器の設置費",0,r.charger],
    ["燃料・電気代",r.gasEnergy*r.N,r.evEnergy*r.N],["自動車税・重量税",(r.G.tax+r.G.wt)*r.N,(r.E.tax+r.E.wt)*r.N],
    ["メンテナンス",n("mGas")*r.N,n("mEv")*r.N],["売却時の残価",-r.gRes,-r.eRes]];
  document.getElementById("tbody").innerHTML = rows.map(([l,g,e])=>`<tr><td>${l}</td><td class="g">${yen(g)}</td><td class="e">${yen(e)}</td><td>${sman(e-g)}</td></tr>`).join("")
    + `<tr class="total"><td>合計</td><td class="g">${yen(r.gTotal)}</td><td class="e">${yen(r.eTotal)}</td><td>${sman(r.diff)}</td></tr>`;
  document.getElementById("freq").innerHTML =
    `<div class="c"><span class="l">春・秋</span><span class="v num" style="font-size:15px">${r.fq.mid}</span></div>`+
    `<div class="c"><span class="l">夏</span><span class="v num" style="font-size:15px">${r.fq.sum}</span></div>`+
    `<div class="c" style="grid-column:1/-1"><span class="l">冬（暖房使用）</span><span class="v num" style="font-size:15px">${r.fq.win}</span></div>`;
  document.getElementById("freqNote").textContent = `1回の充電で使う範囲の目安：春秋 約${Math.round(r.rangeMid)}km／冬 約${Math.round(r.rangeWin)}km（容量の${Math.round(r.usable*100)}%を使う想定）`;
  document.getElementById("scBody").innerHTML = r.scen.map(x=>`<tr><td>${SCEN_LABEL[x.s]}${x.s===S.scen?"（選択中）":""}</td><td class="g">${yen(x.gr)}</td><td class="e">${yen(x.er)}</td><td>${sman(x.d)}</td></tr>`).join("");
  const cb = document.getElementById("clawback");
  if (r.N < SUBSIDY_HOLD_YEARS && r.E.sub > 0){ cb.hidden=false; cb.innerHTML=`<strong>補助金の返納に注意：</strong>補助金を受けた車は一定期間（目安${SUBSIDY_HOLD_YEARS}年）内に手放すと、一部返納が必要になる場合があります。この試算には含めていません。`; }
  else cb.hidden = true;
  drawChart(r);
  const ev = document.getElementById("evlife"); if (ev && typeof evLifeHtml === "function") ev.innerHTML = evLifeHtml();
};

screens.total = () => {
  const r = doneB() ? calc() : null;
  const tileB = r ? `<div class="tile"><div class="h">${pic("coin",32)}<span class="ht">コスト</span></div>
      <div class="big num" style="color:${r.diff<0?"var(--ev)":"var(--gas)"}">${r.diff<0?`${r.N}年で EVが ${man(-r.diff)} 安い`:`${r.N}年で ${rivalShort()}が ${man(r.diff)} 安い`}</div>
      <div class="badges" style="font-size:12px">${r.E.sub>0?`<span class="bdg ok">補助金 −${Math.round(r.E.sub/10000)}万円</span>`:""}${r.gAnnual>r.eAnnual?`<span class="bdg ok">維持費 年約${man(r.gAnnual-r.eAnnual)}安い</span>`:""}</div>
      <div class="s">${r.G.name}（${rivalShort()}）との比較・逆転：${r.cross}</div>
      <div class="links"><button class="lk" data-go="cost">詳しく見る</button><button class="lk" data-go="gas">条件を変える</button></div></div>`
    : `<div class="tile"><div class="h">${pic("coin",32)}<span class="ht">コスト</span></div><div class="big">まだ入力されていません</div><div class="links"><button class="lk" data-go="gas">車両を選んで比較する</button></div></div>`;
  const stubTile = (l,t,to1,to2) => `<div class="tile"><div class="h"><span class="lt">${l}</span><span class="ht">${t}</span><span class="pill soon">準備中</span></div><div class="s">この項目の結果は今後表示されます</div><div class="links"><button class="lk" data-go="${to1}">結果を見る</button><button class="lk" data-go="${to2}">入力する</button></div></div>`;
  const E = evCar();
  return header("診断結果","home","トータル") + `<main class="main">
    <div style="display:flex;flex-direction:column;gap:4px"><span class="hint">あなたが選んだEV</span><h2 style="font-size:24px">${E?E.name:"未選択"}</h2></div>
    <div class="tiles">${tileB}
    ${tileC()}
    ${tileA()}</div>
  </main>` + footer(btn("memo","相談メモを作る"), btn2("rental","このEVを1日試してみる"));
};

const stub = (title,back,tag,heading,items,next) => () => header(title,back,tag) + `<main class="main">
  <div class="stub"><span class="pill soon" style="align-self:flex-start">準備中</span><h2>${heading}</h2><ul>${items.map(i=>`<li>${i}</li>`).join("")}</ul></div>
</main>` + footer(...next);
screens.rental = () => { const E=evCar(); return header("レンタカーで試す","total","次の一歩") + `<main class="main">
  <div class="hero"><h1>数字の次は、<br>乗り心地を確かめる</h1><p>静かさや加速は、乗ってみるのが一番です。</p></div>
  <div class="stub"><span class="pill soon" style="align-self:flex-start">レンタカーアプリと連携予定</span><h2>${E?E.name:"選んだEV"} を予約</h2><ul><li>ゆいの杜店で借りて、ゆいの杜店で返す</li><li>診断結果（車種・よく行く場所）を引き継いで予約画面を開く</li></ul></div>
  <div class="info"><b>返却するときに</b><br>走った距離と電池の残量を入れると、今日の走りからあなたの電費を出して、コストを計算し直します。</div>
</main>` + footer(btn("rental-go","レンタカーを予約する（準備中）"), btn2("drive","返却した：今日の走りを入れる")); };
screens.share = () => header("結果を共有","memo","共有") + `<main class="main"><div class="stub"><span class="pill soon" style="align-self:flex-start">準備中</span><h2>家族に見せる1枚サマリー</h2><ul><li>節約額・行ける範囲・おすすめ車種を1枚に</li><li>リンクを送ると同じ結果を開ける</li></ul></div></main>` + footer(btn2("total","診断結果に戻る"));

/* =========================================================
   グラフ
   ========================================================= */
function drawChart(r){
  const svg = document.getElementById("chart"); if(!svg) return;
  const W=520,H=260,L=56,R=96,T=24,B=34, N=r.N;
  const cs = getComputedStyle(document.documentElement), c = k => cs.getPropertyValue(k).trim();
  const g=[],e=[]; for(let i=0;i<=N;i++){ g.push(r.gInit+r.gAnnual*i); e.push(r.eInit+r.eAnnual*i); }
  const fg=g[N]-r.gRes, fe=e[N]-r.eRes;
  const top=Math.ceil(Math.max(...g,...e)/1e6)*1e6||1e6, bot=Math.floor(Math.min(0,fg,fe)/1e6)*1e6;
  const x=i=>L+(W-L-R)*i/Math.max(N,1), y=v=>T+(H-T-B)*(1-(v-bot)/(top-bot));
  const step=(top-bot)>6e6?2e6:1e6; let s="";
  for(let v=bot;v<=top+1;v+=step){ s+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="${c("--line")}"/><text x="${L-6}" y="${y(v)+4}" font-size="11" fill="${c("--sub")}" text-anchor="end">${v/10000}万</text>`; }
  const ls=N>8?2:1; for(let i=0;i<=N;i+=ls) s+=`<text x="${x(i)}" y="${H-B+18}" font-size="11" fill="${c("--sub")}" text-anchor="middle">${i?i+"年":"購入時"}</text>`;
  const p=a=>a.map((v,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  s+=`<path d="${p(g)}" fill="none" stroke="${c("--gas")}" stroke-width="2.5" stroke-dasharray="7 5"/><path d="${p(e)}" fill="none" stroke="${c("--ev")}" stroke-width="3.5"/>`;
  // 最終年の総額（残価を引いた点）。2つの数字が近いときは、文字が重ならないよう上下にずらす
  const ends = [{a:g[N], b:fg, k:"--gas", t:"ガソリン"}, {a:e[N], b:fe, k:"--ev", t:"EV"}].map(o => ({...o, ty:y(o.b)}));
  const GAP = 30;
  if (Math.abs(ends[0].ty - ends[1].ty) < GAP) {
    const [hi, lo] = ends[0].ty <= ends[1].ty ? [ends[0], ends[1]] : [ends[1], ends[0]];
    const mid = (hi.ty + lo.ty) / 2; hi.ty = mid - GAP/2; lo.ty = mid + GAP/2;
  }
  ends.forEach(o => { const px = x(N)+20;
    s+=`<line x1="${x(N)}" y1="${y(o.a)}" x2="${px}" y2="${y(o.b)}" stroke="${c(o.k)}" stroke-width="1.5" stroke-dasharray="2 4"/><circle cx="${px}" cy="${y(o.b)}" r="4" fill="${c(o.k)}"/>`;
    if (Math.abs(o.ty - y(o.b)) > 1) s+=`<line x1="${px+4}" y1="${y(o.b)}" x2="${px+10}" y2="${o.ty}" stroke="${c(o.k)}" stroke-width="1"/>`;
    s+=`<text x="${px+12}" y="${o.ty-2}" font-size="10" fill="${c(o.k)}">${o.t}</text><text x="${px+12}" y="${o.ty+11}" font-size="12" font-weight="700" fill="${c(o.k)}">${man(o.b)}</text>`; });
  if(r.crossT!==null && r.crossT<=N){ const v=r.gInit+r.gAnnual*r.crossT, cx=L+(W-L-R)*r.crossT/Math.max(N,1);
    s+=`<circle cx="${cx}" cy="${y(v)}" r="6" fill="${c("--panel")}" stroke="${c("--ink")}" stroke-width="2"/><text x="${cx}" y="${Math.max(14, y(v)-14)}" font-size="12" font-weight="700" fill="${c("--ink")}" text-anchor="${cx > W-R-50 ? "end" : cx < L+50 ? "start" : "middle"}">約${r.crossT.toFixed(1)}年で逆転</text>`; }
  svg.innerHTML=s;
}

/* =========================================================
   ルーティングとイベント
   ========================================================= */
const app = document.getElementById("app");
let current = "home";
const WIDE = ["cost","memo","total"];   // PCで横に広げる画面（商談用）
function render(keepScroll){
  const y = window.scrollY;
  const [path, query] = location.hash.replace(/^#\/?/,"").split("?");
  if (query && typeof restoreFromLink === "function" && restoreFromLink(query)) { history.replaceState(null, "", "#/"+(path||"memo")); }
  const route = path || "home";
  current = screens[route] ? route : "home";
  if (WIDE.includes(current)) app.dataset.wide = ""; else delete app.dataset.wide;
  destroyMaps();
  app.innerHTML = screens[current]();
  screens[current].update?.();
  window.scrollTo(0, keepScroll ? y : 0);
  if(!keepScroll){ const h = app.querySelector(".ttl"); document.title = (h?h.textContent+"｜":"") + "EV Life Simulator"; }
}
function go(to){
  if(to==="rental-go"){ return; }
  if(("#/"+to)===location.hash) render(false); else location.hash = "/"+to;
}
window.addEventListener("hashchange", () => render(false));
app.addEventListener("click", e => {
  const a = e.target.closest("[data-act]");
  if (a && !a.disabled) { const [name, arg] = a.dataset.act.split(":"); ACT[name]?.(arg, a); return; }
  const b = e.target.closest("[data-go]"); if(!b || b.disabled) return; go(b.dataset.go);
});
app.addEventListener("submit", e => { e.preventDefault(); const f = e.target.dataset.form; ACT[f]?.(null, e.target); });
app.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.chg) { const [name, arg] = el.dataset.chg.split(":"); ACT[name]?.(arg, el); }
});
app.addEventListener("input", e => {
  if (e.target.dataset.t) { onTripInput(e.target); return; }
  if (e.target.dataset.q) { S[e.target.dataset.q] = e.target.value; return; }
  const k = e.target.dataset.k; if(!k) return;
  S[k] = e.target.type==="checkbox" ? e.target.checked : e.target.value;
  // 表示構造が変わる入力は再描画、それ以外は結果だけ更新
  if (k==="gasKey") S.gFe = "";
  if (k==="evKey") { S.gasKey = EVS[S.evKey]?.rival || "n-one"; S.gFe = ""; S.rivalType = "gas"; }
  if (["gasKey","evKey","kmMode","rivalType"].includes(k)) { if(k==="rivalType" && GASES[S.gasKey] && !GASES[S.gasKey].custom && GASES[S.gasKey].type!==S.rivalType) S.gasKey=""; render(true); return; }
  if (k==="homeCharge"){ const w=document.getElementById("shareWrap"); if(w) w.hidden=!S.homeCharge; if(current==="area"){ render(true); return; } }
  if (k==="homeShare"){ const o=document.getElementById("shareOut"); if(o) o.textContent=S.homeShare+"%"; }
  const ko = document.getElementById("kmOut"); if(ko) ko.textContent = `年間 約${Math.round(annualKm()).toLocaleString("ja-JP")}km として計算します`;
  screens[current].update?.();
});
if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => screens[current].update?.());
// 起動は js/maps.js の最後で行う
