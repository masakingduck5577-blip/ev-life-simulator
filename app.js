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
  pGas:170, pHome:31, pPub:60, charger:150000, mGas:40000, mEv:25000,
  cSum:0.9, cWin:0.7, rGas:0.85, rEv:0.9, usable:70, scen:"mid",
  seenCost:false,
  rivalType:"gas",         // 比べる相手：gas（ガソリン車）/ hv（ハイブリッド車）
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
  return d.custom ? {name:d.name, price:n("gc_price"), fe:n("gc_fe"), tax:n("gc_tax"), wt:n("gc_wt")} : d; }
function evCar(){ const d=EVS[S.evKey]; if(!d) return null;
  return d.custom ? {name:d.name, price:n("ec_price"), sub:SUBSIDY.closed?0:n("ec_sub"), wh:n("ec_wh"), kwh:n("ec_kwh"), tax:n("ec_tax"), wt:n("ec_wt")} : {...d, sub:subOf(d)}; }
function rivalType(){ const d=GASES[S.gasKey]; return d && !d.custom ? d.type : S.rivalType; }
const rivalShort = () => RIVAL_SHORT[rivalType()] || "ガソリン車";
const rivalLong = () => RIVAL_LABEL[rivalType()] || "ガソリン車";
function annualKm(){ return S.kmMode==="spend" ? n("monthlySpend")*12/Math.max(n("pGas"),1)*n("curFe") : n("annualKm"); }
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
  const eInit = ePrice - E.sub + n("evFees") + charger;

  const feReal = Math.max(G.fe,0.1)*rGas;
  const gasEnergy = km/feReal*pGas;
  const dr = driveForCalc();
  const whReal = dr ? dr.whBase : E.wh/rEv;
  const kWhYear = [1,cSum,1,cWin].reduce((s,c)=> s + (km/4)*whReal/1000/c, 0);
  const avgElec = share*pHome + (1-share)*pPub;
  const evEnergy = kWhYear*avgElec;

  const gAnnual = gasEnergy + G.tax + G.wt + n("mGas");
  const eAnnual = evEnergy + E.tax + E.wt + n("mEv");
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
    fq:{mid:freq(1), sum:freq(cSum), win:freq(cWin)}, rangeMid:rangeAt(1), rangeWin:rangeAt(cWin), usable, scen, drive:dr};
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
const spec = items => `<dl class="spec">${items.map(([t,v])=>`<div><dt>${t}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

/* =========================================================
   画面
   ========================================================= */
const screens = {};

screens.home = () => {
  const card = (img,t,d,to,st) => `<button class="hcard" data-go="${to}"><span class="hpic">${pic(img,44)}</span><span class="tx"><span class="t">${t}${st}</span><span class="d">${d}</span></span><span style="color:var(--sub)">${CHEV_R}</span></button>`;
  const pill = ok => ok ? '<span class="pill done">済み</span>' : "";
  return header("EV Life Simulator",null,"ホーム") + `<main class="main">
    <div class="hero"><div class="herorow" aria-hidden="true">${pic("house",72)}${pic("plug",56)}${pic("car",96)}</div><h1>EVに買い替えたら、<br>お金はどう変わる？</h1></div>
    <button class="startcard" data-go="gas"><span class="sc-tx"><span class="k">約3分</span><span class="t">コストを比べる</span><span class="sc-chips"><span>${pic("tag",22)}補助金</span><span>${pic("fuel",22)}燃料代</span></span></span><span class="sc-pic">${pic("yen",76)}</span>${doneB()?'<span class="pill done sc-done">比較済み</span>':""}</button>
    ${(()=>{ const st=subsidyStatus(); return `<p class="deadline-line ${st.state}">${pic("hourglass",22)}${st.state==="over"||st.state==="closed"?st.text:`補助金の受付は${SUBSIDY.endText}まで（見込み）${st.days>0?`・あと約${st.days}日`:""}`}</p>`; })()}
    ${card("key","レンタカーを返した方","今日の走りで計算","drive", pill(S.dUse))}
    <section class="sec"><h2>気になることがあれば</h2>
    ${card("map","充電して行ける？","いつもの場所・旅行先","map", pill((S.area&&S.area.status==="done")||(S.tripRes&&S.tripRes.status==="done")))}
    ${card("camp","暮らしはどう変わる？","場面から使い方を提案","lifestyle", pill(S.ls&&S.ls.seen))}
    </section>
  </main>` + (doneB() ? footer(btn("memo","相談メモを作る"), btn2("total","結果をまとめて見る")) : "");
};

screens.gas = () => {
  const rt = S.rivalType;
  const cards = Object.entries(GASES).filter(([k,d]) => d.custom || d.type===rt).map(([k,d]) => `<label class="carc gas"><input type="radio" name="gasKey" data-k="gasKey" value="${k}"${S.gasKey===k?" checked":""}>
    <span class="cpic">${carPic(d,56)}</span><span class="b"><span class="nm">${d.name}</span><span class="cat">${d.cat}</span>${d.custom?"":spec([["車両価格",man(d.price)],["燃費",d.fe+" km/L"]])}</span></label>`).join("");
  const custom = GASES[S.gasKey]?.custom ? `<div class="custom"><strong style="font-size:14px">スペックを入力</strong><div class="row2">${numIn("gc_price","車両価格（円）",10000)}${numIn("gc_fe","燃費（km/L）",0.1)}${numIn("gc_tax","自動車税（円/年）",100)}${numIn("gc_wt","重量税（円/年換算）",100)}</div></div>` : "";
  return header("比べる車と走行距離","home","入力 1/2") + `<main class="main">
    <section class="sec"><h2>EVと迷っている車は？</h2>
      <div class="seg segpic" role="radiogroup" aria-label="比べる相手">
        <label><input type="radio" name="rivalType" data-k="rivalType" value="gas"${rt==="gas"?" checked":""}>${pic("fuel",28)}ガソリン車</label>
        <label><input type="radio" name="rivalType" data-k="rivalType" value="hv"${rt==="hv"?" checked":""}><span class="duopic">${pic("fuel",24)}${pic("battery",24)}</span>HV</label>
      </div>
    </section>
    <section class="sec"><h2>${pic("road",28)} 1年に走る距離</h2>
      <div class="seg" role="radiogroup" aria-label="走行距離の入力方法">
        <label><input type="radio" name="kmMode" data-k="kmMode" value="direct"${S.kmMode==="direct"?" checked":""}>距離で入力</label>
        <label><input type="radio" name="kmMode" data-k="kmMode" value="spend"${S.kmMode==="spend"?" checked":""}>ガソリン代から</label>
      </div>
      ${S.kmMode==="direct" ? numIn("annualKm","年間走行距離（km）",500) : `<div class="row2">${numIn("monthlySpend","月のガソリン代（円）",1000)}${numIn("curFe","今の車の燃費（km/L）",0.5)}</div>`}
      <p class="hint num" id="kmOut">年間 約${Math.round(annualKm()).toLocaleString("ja-JP")}km として計算します</p>
    </section>
    <section class="sec"><h2>比べる${RIVAL_LABEL[rt]} <span class="flag">価格・燃費は仮</span></h2>
      <div class="cars" role="radiogroup" aria-label="比べる車">${cards}</div>${custom}
    </section>
  </main>` + footer(btn("ev","次へ：EVを選ぶ", !S.gasKey));
};

screens.ev = () => {
  const G = GASES[S.gasKey];
  const cards = Object.entries(EVS).map(([k,d]) => `<label class="carc"><input type="radio" name="evKey" data-k="evKey" value="${k}"${S.evKey===k?" checked":""}>
    <span class="cpic">${carPic(d,56)}<span class="plugbadge">${pic("plug",22)}</span></span><span class="b"><span class="nm">${d.name}${d.ok===false?' <span class="flag">一部仮</span>':""}</span><span class="cat">${d.cat}</span>${d.custom?"":spec([["車両価格",man(d.price)],["補助金",SUBSIDY.closed?"受付終了":"−"+man(d.sub)],["実質",man(d.price-subOf(d))]])}</span></label>`).join("");
  const custom = EVS[S.evKey]?.custom ? `<div class="custom"><strong style="font-size:14px">スペックを入力</strong><div class="row2">${numIn("ec_price","車両価格（円）",10000)}${numIn("ec_sub","補助金（円）",10000)}${numIn("ec_wh","電費（Wh/km）",1)}${numIn("ec_kwh","バッテリー（kWh）",0.1)}${numIn("ec_tax","自動車税（円/年）",100)}${numIn("ec_wt","重量税（円/年換算）",100)}</div></div>` : "";
  return header("気になるEV","gas","入力 2/2") + `<main class="main">
    ${G?`<div class="compare"><div><div class="k">比べる${rivalLong()}</div><div class="n">${G.name}</div></div><button class="lk" data-go="gas" style="margin:0">変更</button></div>`:""}
    <section class="sec"><h2>EVを選ぶ</h2><div class="cars" role="radiogroup" aria-label="EV新車">${cards}</div>${custom}</section>
    <section class="sec"><h2>${pic("house",28)} 家で充電できる？</h2>
      <label class="chk"><input type="checkbox" data-k="homeCharge"${S.homeCharge?" checked":""}>自宅に充電器を付けられる</label>
      <div id="shareWrap"${S.homeCharge?"":" hidden"}>${slider("homeShare","自宅で充電する割合",0,100,5,v=>v+"%","すべて外で","すべて自宅","shareOut")}</div>
    </section>
  </main>` + footer(btn("cost","コストを比較する", !S.evKey));
};

screens.cost = () => {
  S.seenCost = true;
  return header("コスト比較","ev","結果") + `<main class="main" style="gap:16px">
    <div class="cond" id="cond"></div>
    <div class="pair"><section class="pillar" id="p1" aria-labelledby="p1t"></section>
    <section class="pillar" id="p2" aria-labelledby="p2t"></section></div>
    <section class="p3">
      <div class="k p3k">${pic("coin",40)}<span>3　合わせると</span></div>
      <div id="p3head"></div>
      ${slider("years","保有予定年数",1,15,1,v=>v+"年","1年","15年","yearsOut")}
      <svg id="chart" viewBox="0 0 520 260" width="100%" role="img" aria-label="累計コストの推移"></svg>
      <div class="legend"><span><i class="sw g"></i><span id="lgG">ガソリン車</span></span><span><i class="sw e"></i>EV</span><span>最終年の右の点は残価を差し引いた総額</span></div>
      <p class="hint" id="p3note" style="margin:0"></p>
      <div class="warnbox" id="clawback" hidden></div>
    </section>
    <details id="more"><summary>内訳と条件を詳しく見る</summary><div class="body" style="gap:20px">
      <section class="sec"><h2 id="tblTitle">内訳</h2><div class="tablewrap"><table class="num"><thead><tr><th>項目</th><th class="g" id="thG">ガソリン車</th><th class="e">EV</th><th>差</th></tr></thead><tbody id="tbody"></tbody></table></div></section>
      <section class="sec"><h2>充電の頻度（目安）</h2><div class="kv" id="freq"></div><p class="hint" id="freqNote"></p></section>
      <section class="sec"><h2>売却時の残価による違い</h2><div class="tablewrap"><table class="num"><thead><tr><th>シナリオ <span class="flag">要確認</span></th><th class="g">比べる車の残価</th><th class="e">EV残価</th><th>総額の差</th></tr></thead><tbody id="scBody"></tbody></table></div></section>
    </div></details>
    <details><summary>見積調整（ディーラー用）</summary><div class="body"><div class="row2">
      ${numIn("evAdj","EV 値引き・オプション差（円）",10000)}${numIn("gasAdj","比べる車 値引き・オプション差（円）",10000)}
      ${numIn("evFees","EV 購入時の税・諸費用（円）",10000)}${numIn("gasFees","比べる車 購入時の税・諸費用（円）",10000)}
    </div><p class="hint">マイナスで値引き。見積書の金額を入れると実際の条件で比較できます。</p></div></details>
    <details><summary>単価・係数の設定</summary><div class="body"><div class="row2">
      ${numIn("pGas","ガソリン（円/L）",1)}${numIn("pHome","自宅の電気（円/kWh）",1)}
      ${numIn("pPub","公共充電（円/kWh換算）",1,true)}${numIn("charger","充電器の設置費（円）",10000,true)}
      ${numIn("mGas","メンテ費 ガソリン（円/年）",1000,true)}${numIn("mEv","メンテ費 EV（円/年）",1000,true)}
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

  /* ① 買うとき：補助金 */
  const sub = r.E.sub || 0, eList = r.ePrice, eReal = r.ePrice - sub, gP = r.gPrice;
  const maxP = Math.max(eList, gP, 1), pc = v => Math.max(0, v / maxP * 100);
  const gap = eReal - gP;
  const p1title = SUBSIDY.closed
    ? `<h2 class="ttl" id="p1t">国の補助金は<br><em style="font-size:26px">受付終了</em></h2>`
    : sub > 0
    ? `<h2 class="ttl" id="p1t">補助金で<br><em class="num">${man0(sub)}</em> 安く買える</h2>`
    : `<h2 class="ttl" id="p1t">この車種の補助金は<br><em style="font-size:26px">対象外・未確認</em></h2>`;
  const gapRow = gap > 0
    ? `<div class="gap"><span>${rv}との差</span><b class="num">あと ${man0(gap)}</b></div>`
    : `<div class="gap good"><span>補助金を引くと</span><b class="num">${rv}より ${man0(gap)} 安い</b></div>`;
  document.getElementById("p1").innerHTML = `<span class="pillpic">${pic("tag",72)}</span><div class="kick"><i>1</i>買うとき</div>${p1title}
    <div class="bars">
      ${barRow("車両価格", man0(eList), pc(eReal), "var(--evl)", sub>0?{hatchPct:pc(sub), hatchLabel:`補助金 −${man0(sub)}`}:{})}
      ${barRow("実質の価格", man0(eReal), pc(eReal), "var(--ev)", {big:true})}
      ${barRow(rv, man0(gP), pc(gP), "var(--gas)", {vColor:"var(--gas)"})}
    </div>${gapRow}
    ${sub>0 || SUBSIDY.closed ? subsidyBox() : ""}
    <details class="mini"><summary>補助金について</summary><p class="hint" style="margin:0">${subsidyNote()}${S.evAdj||S.gasAdj?"　値引き・オプション差を含む。":""}</p></details>`;

  /* ② 乗るとき：燃料代 */
  const gM = r.gasEnergy/12, eM = r.evEnergy/12, dM = gM - eM;
  const maxM = Math.max(gM, eM, 1);
  const p2title = dM >= 0
    ? `<h2 class="ttl" id="p2t">燃料代が<br>月 <em class="num">約${yen100(dM)}</em> 安い</h2>`
    : `<h2 class="ttl" id="p2t">この条件では燃料代が<br>月 約${yen100(dM)} 高い</h2>`;
  const ratio = r.k100a / Math.max(r.k100g, 0.1);
  document.getElementById("p2").innerHTML = `<span class="pillpic">${pic("plug",64)}</span><div class="kick"><i>2</i>乗るとき</div>${p2title}
    <div class="bars">
      ${barRow(`${pic("fuel",26)}<span>${rv}</span>`, `月${yen100(gM)}`, gM/maxM*100, "var(--gas)", {vColor:"var(--gas)"})}
      ${barRow(`${pic("plug",26)}<span>EV</span>`, `月${yen100(eM)}`, eM/maxM*100, "var(--ev)", {big:true})}
    </div>
    <div class="duo"><div class="st g"><span>${rv} 100円で</span><b class="num">${r.k100g.toFixed(1)}km</b></div><div class="st e"><span>EV 100円で</span><b class="num">${r.k100a.toFixed(1)}km</b></div></div>
    ${ratio>=1.05?`<div class="times">同じ100円で、約${ratio.toFixed(1)}倍走れる</div>`:""}
    <p class="hint" style="margin:0">1年で 約${man(Math.abs(dM*12))}の差${r.drive?"・電費は今日の走りから":""}</p>`;

  /* ③ 合わせると */
  const good = r.diff < 0;
  const crossTxt = r.crossT!==null && r.crossT<=30 ? `約${r.crossT.toFixed(1)}年で差を取り戻し、<br>` : (r.dInit<=0&&r.dAnnual>=0 ? "購入時からEVが安く、<br>" : "");
  document.getElementById("p3head").innerHTML = good
    ? `<div class="big">${crossTxt}${r.N}年で <em class="num">約${man(-r.diff)}</em> おトク</div>`
    : `<div class="big">${r.N}年では、${rv}が<br>約${man(r.diff)} 安い</div>${r.crossT!==null&&r.crossT<=30?`<p class="hint" style="margin:0">約${r.crossT.toFixed(1)}年以上乗ると、EVのほうが安くなります（売却時の価値を除く）</p>`:""}`;
  document.getElementById("p3note").textContent = `${r.charger?`充電器の設置費${man(r.charger)}・`:""}税・メンテナンス・売却時の価値（残価${SCEN_LABEL[S.scen]}）を含めた総額で計算`;
  document.getElementById("yearsOut").textContent = r.N+"年";

  /* 詳しく */
  document.getElementById("tblTitle").textContent = `内訳（${r.N}年）`;
  const rows = [
    ["車両価格",r.gPrice,r.ePrice],["補助金",0,-r.E.sub],["購入時の税・諸費用",n("gasFees"),n("evFees")],["充電器の設置費",0,r.charger],
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
};

screens.total = () => {
  const r = doneB() ? calc() : null;
  const tileB = r ? `<div class="tile"><div class="h">${pic("coin",32)}<span class="ht">コスト</span></div>
      <div class="big num" style="color:${r.diff<0?"var(--ev)":"var(--gas)"}">${r.diff<0?`${r.N}年で ${man(-r.diff)} おトク`:`${r.N}年では${rivalShort()}が ${man(r.diff)} 安い`}</div>
      <div class="badges" style="font-size:12px">${r.E.sub>0?`<span class="bdg ok">補助金 −${Math.round(r.E.sub/10000)}万円</span>`:""}${r.gasEnergy>r.evEnergy?`<span class="bdg ok">燃料代 月約${(Math.round((r.gasEnergy-r.evEnergy)/12/100)*100).toLocaleString("ja-JP")}円安い</span>`:""}</div>
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
  const W=520,H=260,L=56,R=86,T=16,B=34, N=r.N;
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
  [[g[N],fg,"--gas"],[e[N],fe,"--ev"]].forEach(([a,b,k])=>{ s+=`<line x1="${x(N)}" y1="${y(a)}" x2="${x(N)+24}" y2="${y(b)}" stroke="${c(k)}" stroke-width="1.5" stroke-dasharray="2 4"/><circle cx="${x(N)+24}" cy="${y(b)}" r="4" fill="${c(k)}"/><text x="${x(N)+31}" y="${y(b)+4}" font-size="11" fill="${c(k)}">${man(b)}</text>`; });
  if(r.crossT!==null && r.crossT<=N){ const v=r.gInit+r.gAnnual*r.crossT, cx=L+(W-L-R)*r.crossT/Math.max(N,1);
    s+=`<circle cx="${cx}" cy="${y(v)}" r="6" fill="${c("--panel")}" stroke="${c("--ink")}" stroke-width="2"/><text x="${cx}" y="${y(v)-12}" font-size="12" font-weight="700" fill="${c("--ink")}" text-anchor="middle">約${r.crossT.toFixed(1)}年で逆転</text>`; }
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
  if (["gasKey","evKey","kmMode","rivalType"].includes(k)) { if(k==="rivalType" && GASES[S.gasKey] && !GASES[S.gasKey].custom && GASES[S.gasKey].type!==S.rivalType) S.gasKey=""; render(true); return; }
  if (k==="homeCharge"){ const w=document.getElementById("shareWrap"); if(w) w.hidden=!S.homeCharge; if(current==="area"){ render(true); return; } }
  if (k==="homeShare"){ const o=document.getElementById("shareOut"); if(o) o.textContent=S.homeShare+"%"; }
  const ko = document.getElementById("kmOut"); if(ko) ko.textContent = `年間 約${Math.round(annualKm()).toLocaleString("ja-JP")}km として計算します`;
  screens[current].update?.();
});
if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => screens[current].update?.());
// 起動は js/maps.js の最後で行う
