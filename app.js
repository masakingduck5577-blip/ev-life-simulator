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
  // ---- マップ機能（生活圏・旅行） ----
  pDest:0,                 // 目的地の充電単価（施設データに price がないとき）
  home:null, work:null, places:[],   // {lat,lng,label,detail} / work:+days / place:+cat,freq
  pickTarget:"home", searchQ:"", searchResults:[], searchMsg:"",
  layers:{quick:true, normal:true, merit:true},
  selPlace:null, selFac:null,
  trip:{dest:null, overnight:true, stayH:3, season:"win", startSoc:100, destCharge:true, reserve:20},
  tripQ:"", tripResults:[], tripMsg:"",
  area:null, tripRes:null, kmApplied:false
};
const n = k => { const v = parseFloat(S[k]); return isFinite(v) ? v : 0; };
const yen = v => (v<0?"−":"") + "¥" + Math.round(Math.abs(v)).toLocaleString("ja-JP");
const man = v => (v<0?"−":"") + (Math.abs(v)/10000).toFixed(1).replace(/\.0$/,"") + "万円";
const sman = v => (v>0?"+":v<0?"−":"±") + (Math.abs(v)/10000).toFixed(1).replace(/\.0$/,"") + "万円";

function gasCar(){ const d=GASES[S.gasKey]; if(!d) return null;
  return d.custom ? {name:d.name, price:n("gc_price"), fe:n("gc_fe"), tax:n("gc_tax"), wt:n("gc_wt")} : d; }
function evCar(){ const d=EVS[S.evKey]; if(!d) return null;
  return d.custom ? {name:d.name, price:n("ec_price"), sub:n("ec_sub"), wh:n("ec_wh"), kwh:n("ec_kwh"), tax:n("ec_tax"), wt:n("ec_wt")} : d; }
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
  const whReal = E.wh/rEv;
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
    fq:{mid:freq(1), sum:freq(cSum), win:freq(cWin)}, rangeMid:rangeAt(1), rangeWin:rangeAt(cWin), usable, scen};
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
const spec = items => `<dl class="spec">${items.map(([t,v])=>`<div><dt>${t}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

/* =========================================================
   画面
   ========================================================= */
const screens = {};

screens.home = () => {
  const done = doneB() ? 1 : 0;
  const card = (l,t,d,to,st) => `<button class="hcard" data-go="${to}"><span class="lt">${l}</span><span class="tx"><span class="t">${t}${st}</span><span class="d">${d}</span></span><span style="color:var(--sub)">${CHEV_R}</span></button>`;
  return header("EV Life Simulator",null,"ホーム") + `<main class="main">
    <div class="hero"><span class="area">UTSUNOMIYA × HAGA</span><h1>EVのある暮らしを、<br>自分の生活で試算する</h1><p>3つの項目から、コスト・行ける範囲・暮らしの変化がわかります。どこから始めても大丈夫です。</p></div>
    <div class="prog"><div class="row"><strong>入力状況</strong><span class="num" style="color:var(--sub)">${done} / 3 完了</span></div><div class="bar"><i style="width:${done/3*100}%"></i></div></div>
    ${card("A","ライフスタイル","充電環境・通勤・休日の使い方","lifestyle",'<span class="pill soon">準備中</span>')}
    ${card("B","車両とコスト","ガソリン新車とEV新車の総額を比較","gas", doneB()?'<span class="pill done">入力済み</span>':'<span class="pill todo">未入力</span>')}
    ${card("C","生活圏・おでかけ","よく行く場所の充電施設と、旅行の充電計画","map", (S.area&&S.area.status==="done")||(S.tripRes&&S.tripRes.status==="done")?'<span class="pill done">入力済み</span>':'<span class="pill todo">未入力</span>')}
    <p class="hint">試算条件：ガソリン ${n("pGas")}円/L・自宅の電気 ${n("pHome")}円/kWh（変更は結果画面の詳細設定から）</p>
  </main>` + footer(btn("total","トータル結果を見る"), `<p class="hint" style="text-align:center;margin:0">入力済みの項目だけで表示されます</p>`);
};

screens.gas = () => {
  const cards = Object.entries(GASES).map(([k,d]) => `<label class="carc gas"><input type="radio" name="gasKey" data-k="gasKey" value="${k}"${S.gasKey===k?" checked":""}>
    <span class="b"><span class="nm">${d.name}</span><span class="cat">${d.cat}</span>${d.custom?"":spec([["車両価格",man(d.price)],["燃費",d.fe+" km/L"],["自動車税",yen(d.tax)+"/年"]])}</span></label>`).join("");
  const custom = GASES[S.gasKey]?.custom ? `<div class="custom"><strong style="font-size:14px">スペックを入力</strong><div class="row2">${numIn("gc_price","車両価格（円）",10000)}${numIn("gc_fe","燃費（km/L）",0.1)}${numIn("gc_tax","自動車税（円/年）",100)}${numIn("gc_wt","重量税（円/年換算）",100)}</div></div>` : "";
  return header("ガソリン新車と走行距離","home","入力 B-1") + `<main class="main">
    <section class="sec"><h2>年間の走行距離</h2><p class="sd">分からなければ、今の車のガソリン代から計算できます</p>
      <div class="seg" role="radiogroup" aria-label="走行距離の入力方法">
        <label><input type="radio" name="kmMode" data-k="kmMode" value="direct"${S.kmMode==="direct"?" checked":""}>距離で入力</label>
        <label><input type="radio" name="kmMode" data-k="kmMode" value="spend"${S.kmMode==="spend"?" checked":""}>ガソリン代から</label>
      </div>
      ${S.kmMode==="direct" ? numIn("annualKm","年間走行距離（km）",500) : `<div class="row2">${numIn("monthlySpend","月のガソリン代（円）",1000)}${numIn("curFe","今の車の燃費（km/L）",0.5)}</div>`}
      <p class="hint num" id="kmOut">年間 約${Math.round(annualKm()).toLocaleString("ja-JP")}km として計算します</p>
    </section>
    <section class="sec"><h2>比べるガソリン新車</h2><p class="sd">買い替え候補のガソリン車を選んでください <span class="flag">要確認</span> 価格・燃費は仮の値です</p>
      <div class="cars" role="radiogroup" aria-label="ガソリン新車">${cards}</div>${custom}
    </section>
  </main>` + footer(btn("ev","次へ：EVを選ぶ", !S.gasKey));
};

screens.ev = () => {
  const G = GASES[S.gasKey];
  const cards = Object.entries(EVS).map(([k,d]) => `<label class="carc"><input type="radio" name="evKey" data-k="evKey" value="${k}"${S.evKey===k?" checked":""}>
    <span class="b"><span class="nm">${d.name}${d.ok===false?' <span class="flag">要確認</span>':""}</span><span class="cat">${d.cat}</span>${d.custom?"":spec([["車両価格",man(d.price)],["補助金（国）",man(d.sub)],["実質",man(d.price-d.sub)],["電費",d.wh+" Wh/km"],["バッテリー",d.kwh+" kWh"],["自動車税",yen(d.tax)+"/年"]])}</span></label>`).join("");
  const custom = EVS[S.evKey]?.custom ? `<div class="custom"><strong style="font-size:14px">スペックを入力</strong><div class="row2">${numIn("ec_price","車両価格（円）",10000)}${numIn("ec_sub","補助金（円）",10000)}${numIn("ec_wh","電費（Wh/km）",1)}${numIn("ec_kwh","バッテリー（kWh）",0.1)}${numIn("ec_tax","自動車税（円/年）",100)}${numIn("ec_wt","重量税（円/年換算）",100)}</div></div>` : "";
  return header("気になるEV","gas","入力 B-2") + `<main class="main">
    ${G?`<div class="compare"><div><div class="k">比較するガソリン新車</div><div class="n">${G.name}</div></div><button class="lk" data-go="gas" style="margin:0">変更</button></div>`:""}
    <section class="sec"><h2>EVを選ぶ</h2><div class="cars" role="radiogroup" aria-label="EV新車">${cards}</div>${custom}</section>
    <section class="sec"><h2>充電の環境</h2>
      <label class="chk"><input type="checkbox" data-k="homeCharge"${S.homeCharge?" checked":""}>自宅に充電器を設置できる</label>
      <div id="shareWrap"${S.homeCharge?"":" hidden"}>${slider("homeShare","自宅で充電する割合",0,100,5,v=>v+"%","すべて外で","すべて自宅","shareOut")}</div>
      <p class="hint">ライフスタイル（A）の入力ができたら、ここは自動で引き継ぐ予定です</p>
    </section>
  </main>` + footer(btn("cost","コストを比較する", !S.evKey));
};

screens.cost = () => {
  S.seenCost = true;
  return header("コスト比較","ev","結果 B") + `<main class="main">
    <div id="verdict"></div>
    ${slider("years","保有予定年数",1,15,1,v=>v+"年","1年","15年","yearsOut")}
    <section class="sec"><h2>累計コストの推移</h2>
      <svg id="chart" viewBox="0 0 520 260" width="100%" role="img" aria-label="累計コストの推移"></svg>
      <div class="legend"><span><i class="sw g"></i>ガソリン新車</span><span><i class="sw e"></i>EV新車</span><span>最終年の右の点は残価を差し引いた総額</span></div>
    </section>
    <section class="sec"><h2 id="tblTitle">内訳</h2><div class="tablewrap"><table class="num"><thead><tr><th>項目</th><th class="g">ガソリン</th><th class="e">EV</th><th>差</th></tr></thead><tbody id="tbody"></tbody></table></div></section>
    <section class="sec"><h2>100円で走れる距離</h2><div class="kv" id="k100"></div></section>
    <section class="sec"><h2>充電の頻度（目安）</h2><div class="kv" id="freq"></div><p class="hint" id="freqNote"></p></section>
    <section class="sec"><h2>売却時の残価による違い</h2><div class="tablewrap"><table class="num"><thead><tr><th>シナリオ <span class="flag">要確認</span></th><th class="g">ガソリン残価</th><th class="e">EV残価</th><th>総額の差</th></tr></thead><tbody id="scBody"></tbody></table></div>
      <div class="warnbox" id="clawback" hidden></div></section>
    <details><summary>見積調整（ディーラー用）</summary><div class="body"><div class="row2">
      ${numIn("evAdj","EV 値引き・オプション差（円）",10000)}${numIn("gasAdj","ガソリン車 値引き・オプション差（円）",10000)}
      ${numIn("evFees","EV 購入時の税・諸費用（円）",10000)}${numIn("gasFees","ガソリン車 購入時の税・諸費用（円）",10000)}
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
  </main>` + footer(btn("total","トータル結果へ"), btn2("gas","車両の条件を変える"));
};
screens.cost.update = () => {
  const r = calc(); if(!r) return;
  const good = r.diff < 0;
  document.getElementById("verdict").innerHTML = `<div class="verdict ${good?"good":"bad"}">
    <span class="lead">${r.G.name} と ${r.E.name}｜${r.N}年間の総保有コスト（残価${SCEN_LABEL[S.scen]}）</span>
    <span class="big num">${good?`EVが ${man(-r.diff)} おトク`:`ガソリン車が ${man(r.diff)} 安い`}</span>
    <span class="sub num">逆転：${r.cross}　／　年間維持費の差 ${man(Math.abs(r.dAnnual))}（EVが${r.dAnnual>0?"安い":"高い"}）</span></div>`;
  document.getElementById("yearsOut").textContent = r.N+"年";
  document.getElementById("tblTitle").textContent = `内訳（${r.N}年）`;
  const rows = [
    ["車両価格",r.gPrice,r.ePrice],["補助金",0,-r.E.sub],["購入時の税・諸費用",n("gasFees"),n("evFees")],["充電器の設置費",0,r.charger],
    ["燃料・電気代",r.gasEnergy*r.N,r.evEnergy*r.N],["自動車税・重量税",(r.G.tax+r.G.wt)*r.N,(r.E.tax+r.E.wt)*r.N],
    ["メンテナンス",n("mGas")*r.N,n("mEv")*r.N],["売却時の残価",-r.gRes,-r.eRes]];
  document.getElementById("tbody").innerHTML = rows.map(([l,g,e])=>`<tr><td>${l}</td><td class="g">${yen(g)}</td><td class="e">${yen(e)}</td><td>${sman(e-g)}</td></tr>`).join("")
    + `<tr class="total"><td>合計</td><td class="g">${yen(r.gTotal)}</td><td class="e">${yen(r.eTotal)}</td><td>${sman(r.diff)}</td></tr>`;
  document.getElementById("k100").innerHTML =
    `<div class="c"><span class="l">ガソリン新車</span><span class="v num g">${r.k100g.toFixed(1)} km</span></div>`+
    `<div class="c"><span class="l">EV（あなたの充電割合）</span><span class="v num e">${r.k100a.toFixed(1)} km</span></div>`+
    (r.k100h?`<div class="c" style="grid-column:1/-1"><span class="l">EV（自宅充電のみの場合）</span><span class="v num e">${r.k100h.toFixed(1)} km</span></div>`:"");
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
  const tileB = r ? `<div class="tile"><div class="h"><span class="lt">B</span><span class="ht">コスト</span></div>
      <div class="big num" style="color:${r.diff<0?"var(--ev)":"var(--gas)"}">${r.diff<0?`${r.N}年で ${man(-r.diff)} おトク`:`${r.N}年ではガソリン車が ${man(r.diff)} 安い`}</div>
      <div class="s">${r.G.name} との比較・逆転：${r.cross}</div>
      <div class="links"><button class="lk" data-go="cost">詳しく見る</button><button class="lk" data-go="gas">条件を変える</button></div></div>`
    : `<div class="tile"><div class="h"><span class="lt">B</span><span class="ht">コスト</span></div><div class="big">まだ入力されていません</div><div class="links"><button class="lk" data-go="gas">車両を選んで比較する</button></div></div>`;
  const stubTile = (l,t,to1,to2) => `<div class="tile"><div class="h"><span class="lt">${l}</span><span class="ht">${t}</span><span class="pill soon">準備中</span></div><div class="s">この項目の結果は今後表示されます</div><div class="links"><button class="lk" data-go="${to1}">結果を見る</button><button class="lk" data-go="${to2}">入力する</button></div></div>`;
  const E = evCar();
  return header("診断結果","home","トータル") + `<main class="main">
    <div style="display:flex;flex-direction:column;gap:4px"><span class="hint">あなたが選んだEV</span><h2 style="font-size:24px">${E?E.name:"未選択"}</h2></div>
    ${tileB}
    ${tileC()}
    ${stubTile("A","暮らしの変化","effect","lifestyle")}
    <button class="btn2" data-go="share" style="border-style:dashed;border-color:var(--ev);color:var(--ev);font-weight:700">家族に結果を共有する（準備中）</button>
  </main>` + footer(btn("rental","このEVを1日試してみる"), btn2("home","ホームに戻る"));
};

const stub = (title,back,tag,heading,items,next) => () => header(title,back,tag) + `<main class="main">
  <div class="stub"><span class="pill soon" style="align-self:flex-start">準備中</span><h2>${heading}</h2><ul>${items.map(i=>`<li>${i}</li>`).join("")}</ul></div>
</main>` + footer(...next);
screens.lifestyle = stub("ライフスタイル","home","入力 A","ライフスタイルの入力",["自宅の充電環境（戸建て／集合住宅）","通勤・送迎の距離と頻度","休日の使い方・乗る人数","重視したいこと"],[btn("effect","次へ：導入効果を見る")]);
screens.effect = stub("導入効果","lifestyle","結果 A","暮らしの変化（質的な効果）",["給油の手間がなくなる回数","通勤・休日の使い方に合わせた変化","静かさ・乗り心地（試乗への導線）","災害時の給電"],[btn("total","トータル結果へ"),btn2("home","ホームで他の項目を入力")]);
screens.rental = () => { const E=evCar(); return header("レンタカーで試す","total","次の一歩") + `<main class="main">
  <div class="hero"><h1>数字の次は、<br>乗り心地を確かめる</h1><p>静かさや加速は、乗ってみるのが一番です。</p></div>
  <div class="stub"><span class="pill soon" style="align-self:flex-start">レンタカーアプリと連携予定</span><h2>${E?E.name:"選んだEV"} を予約</h2><ul><li>診断結果（車種・よく行く場所）を引き継いで予約画面を開く</li><li>貸出場所：販売店（LRT停留場の近く）</li><li>よく行く場所をもとにした試乗コースの提案</li></ul></div>
</main>` + footer(btn("rental-go","レンタカーを予約する（準備中）"), btn2("total","診断結果に戻る")); };
screens.share = () => header("結果を共有","total","共有") + `<main class="main"><div class="stub"><span class="pill soon" style="align-self:flex-start">準備中</span><h2>家族に見せる1枚サマリー</h2><ul><li>節約額・行ける範囲・おすすめ車種を1枚に</li><li>リンクを送ると同じ結果を開ける</li></ul></div></main>` + footer(btn2("total","診断結果に戻る"));

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
function render(keepScroll){
  const y = window.scrollY;
  const route = (location.hash.replace(/^#\/?/,"") || "home");
  current = screens[route] ? route : "home";
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
  if (["gasKey","evKey","kmMode"].includes(k)) { render(true); return; }
  if (k==="homeCharge"){ const w=document.getElementById("shareWrap"); if(w) w.hidden=!S.homeCharge; if(current==="area"){ render(true); return; } }
  if (k==="homeShare"){ const o=document.getElementById("shareOut"); if(o) o.textContent=S.homeShare+"%"; }
  const ko = document.getElementById("kmOut"); if(ko) ko.textContent = `年間 約${Math.round(annualKm()).toLocaleString("ja-JP")}km として計算します`;
  screens[current].update?.();
});
if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => screens[current].update?.());
// 起動は js/maps.js の最後で行う
