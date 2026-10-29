/* =========================================================
   マップ機能（C 生活圏・おでかけ）
   生活圏モード：map → area → areamap → place → facility
   旅行モード  ：map → trip → tripres → tripplan
   計算は ev-route.js、場所検索と経路は geo.js、施設は facilities.js
   ========================================================= */

const FREQ = {
  w3: { label: "週3回以上", y: 156 },
  w1: { label: "週1回", y: 52 },
  m2: { label: "月2回", y: 24 },
  m1: { label: "月1回", y: 12 },
  y4: { label: "年に数回", y: 4 },
};
const CATS = ["買い物", "レジャー", "家族・知人", "通院", "送迎・習い事", "その他"];
const SEASONS = {
  spr: { label: "春・秋", f: () => 1 },
  sum: { label: "夏", f: () => n("cSum") || 1 },
  win: { label: "冬", f: () => n("cWin") || 1 },
};
const FTYPE = { quick: "急速充電", normal: "普通充電", merit: "EVで得する" };
const PIN_SIZE = { home: 28, work: 28, place: 26, quick: 22, normal: 20, merit: 16, stop: 32, honda: 24 };
const isHC = (f) => f.network === "Honda Charge";
const pinKind = (f) => isHC(f) ? "honda" : f.type;
const pinText = (f) => isHC(f) ? "H" : f.type === "quick" ? "急" : f.type === "normal" ? "普" : "";
const showLayer = (f) => S.layers[f.type] && (!isHC(f) || S.layers.honda);

const FAC = () => window.FACILITIES || [];
const hasDemo = () => FAC().some((f) => f.demo);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const km1 = (m) => (m / 1000).toFixed(1).replace(/\.0$/, "");
const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)}時間${min % 60}分` : `${min}分`);
const uniqById = (arr) => { const seen = new Set(); return arr.filter((f) => !seen.has(f.id) && seen.add(f.id)); };

function carForMap() {
  const E = evCar();
  const base = EVS[S.evKey] && !EVS[S.evKey].custom ? EVS[S.evKey] : EVS["n-one-e"];
  const d = E || base;
  return { name: d.name, kwh: d.kwh, whPerKm: d.wh, maxKw: base.qkw ?? 50, maxAcKw: base.acKw ?? 6, isDefault: !E };
}
const consKwhPerKm = (car, f) => car.whPerKm / (n("rEv") || 1) / f / 1000;

function inPolygon(p, poly) {
  if (!poly || poly.length < 3) return true;
  const [y, x] = p; let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ---------- 地図（Leaflet） ---------- */
let MAPS = [];
function destroyMaps() { MAPS.forEach((m) => { try { m.remove(); } catch (e) {} }); MAPS = []; }
function mkMap(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (!window.L) {
    el.innerHTML = '<div class="nomap">地図を読み込めませんでした（オフライン、または地図ライブラリを読み込めない環境です）。計算はこのまま行えます。</div>';
    return null;
  }
  const m = L.map(el, { zoomControl: true }).setView([36.56, 139.88], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(m);
  MAPS.push(m);
  setTimeout(() => m.invalidateSize(), 0);
  return m;
}
function pin(kind, txt = "") {
  const s = PIN_SIZE[kind] || 24;
  return L.divIcon({ className: "", html: `<div class="pin ${kind}">${txt}</div>`, iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
}
function addPin(m, ll, kind, txt, title, onClick) {
  const mk = L.marker(ll, { icon: pin(kind, txt), title: title || "", keyboard: true }).addTo(m);
  if (title) mk.bindTooltip(esc(title));
  if (onClick) mk.on("click", onClick);
  return mk;
}
function addFacPins(m, list) {
  list.forEach((f) => addPin(m, [f.lat, f.lng], pinKind(f), pinText(f), f.name, () => ACT.openFac(f.id)));
}
function fit(m, pts) {
  if (!m) return;
  if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [28, 28] });
  else if (pts.length === 1) m.setView(pts[0], 14);
}

/* ---------- 共通の部品 ---------- */
const demoNote = () => hasDemo() ? `<p class="info"><span class="flag">デモ</span> 施設は動作確認用の架空データです。実データは facilities.js に登録してください。</p>` : "";
const facKindIcon = (f) => `<div class="pin ${pinKind(f)}" aria-hidden="true" style="flex-shrink:0">${pinText(f)}</div>`;
function facRow(f, sub, rec) {
  return `<button type="button" class="lrow${rec ? " rec" : ""}" data-act="openFac:${esc(f.id)}">${facKindIcon(f)}
    <span class="tx"><b>${esc(f.name)}${rec ? ' <span class="bdg ng">推奨</span>' : ""}</b><span>${sub}</span></span></button>`;
}
const facSpec = (f) => [f.network || "", FTYPE[f.type], f.kw ? `${f.kw}kW` : "", f.highway ? "高速道路上" : ""].filter(Boolean).join("・");
const loadingBox = (t) => `<div class="loading" role="status"><span class="spin" aria-hidden="true"></span>${t}</div>`;
function backHeader(title, tag) {
  return `<header class="hd"><button class="back" data-act="back" aria-label="戻る">${CHEV_L}</button><h1 class="ttl">${title}</h1>${tag ? `<span class="tag">${tag}</span>` : ""}</header>`;
}

/* =========================================================
   計算（生活圏）
   ========================================================= */
function areaKey() {
  return JSON.stringify([S.home, S.work, S.places.map((p) => [p.lat, p.lng, p.freq]), S.evKey, S.cSum, S.cWin, S.rEv, S.usable, S.trip.reserve, S.homeCharge, FAC().length]);
}
async function ensureArea() {
  if (!S.home || !(S.work || S.places.length)) return;
  const key = areaKey();
  if (S.area && S.area.key === key) return;
  const token = (S.area = { key, status: "loading" });
  try {
    const data = await computeArea();
    if (S.area !== token) return;
    S.area = { key, status: "done", data };
  } catch (e) {
    if (S.area !== token) return;
    S.area = { key, status: "error", msg: String(e) };
  }
  if (["areamap", "place", "total", "map", "home"].includes(current)) render(true);
}
async function computeArea() {
  const car = carForMap();
  const window_ = 1 - S.trip.reserve / 100;      // 満充電から安心ラインまでに使える割合
  const targets = [];
  if (S.work) targets.push({ key: "work", kind: "work", ...S.work, perYear: S.work.days * 52, freqLabel: `週${S.work.days}日`, cat: "通勤・通学" });
  S.places.forEach((p, i) => targets.push({ key: String(i), kind: "place", no: i + 1, ...p, perYear: FREQ[p.freq].y, freqLabel: FREQ[p.freq].label }));

  let annual = 0, okWinKm = 0, approx = false;
  for (const t of targets) {
    const r = await GEO.route(S.home, t);
    approx = approx || r.approx;
    t.route = r;
    t.rtKm = (2 * r.distM) / 1000;
    t.durMin = Math.round(r.durS / 60);
    t.seasons = Object.entries(SEASONS).map(([k, s]) => {
      const used = (t.rtKm * consKwhPerKm(car, s.f())) / car.kwh;
      return { k, label: s.label, usedPct: used * 100, ratio: used / window_, ok: used <= window_ };
    });
    const along = findFacilitiesAlongRoute(r.coords, FAC(), { bufferM: 1000 }).facilities;
    const near = findFacilitiesNear([t.lat, t.lng], FAC(), 500);
    t.along = along.filter((f) => f.type !== "merit");
    t.near = near.filter((f) => f.type !== "merit");
    t.merit = uniqById([...near, ...along].filter((f) => f.type === "merit"));
    annual += t.rtKm * t.perYear;
    if (t.seasons[2].ok) okWinKm += t.rtKm * t.perYear;
  }
  const whReal = car.whPerKm / (n("rEv") || 1);
  const range = (f) => (car.kwh * (n("usable") / 100) * 1000) / (whReal / f);
  const weekKm = annual / 52;
  return {
    car, targets, approx, annualKm: annual, weekKm,
    rangeKm: range(1), rangeWinKm: range(n("cWin") || 1),
    chargesWeek: weekKm / range(1), chargesWeekWin: weekKm / range(n("cWin") || 1),
    coverPct: annual ? (okWinKm / annual) * 100 : 100,
    homeNear: findFacilitiesNear([S.home.lat, S.home.lng], FAC(), 3000),
  };
}

/* =========================================================
   計算（旅行）
   ========================================================= */
function tripKey() {
  return JSON.stringify([S.home, S.trip, S.evKey, S.gasKey, S.cSum, S.cWin, S.rEv, S.rGas, S.pHome, S.pPub, S.pDest, S.pGas, FAC().length]);
}
async function ensureTrip() {
  if (!S.home || !S.trip.dest) return;
  const key = tripKey();
  if (S.tripRes && S.tripRes.key === key) return;
  const token = (S.tripRes = { key, status: "loading" });
  try {
    const data = await computeTrip();
    if (S.tripRes !== token) return;
    S.tripRes = { key, status: "done", data };
  } catch (e) {
    if (S.tripRes !== token) return;
    S.tripRes = { key, status: "error", msg: String(e) };
  }
  if (["tripres", "tripplan", "total"].includes(current)) render(true);
}
async function computeTrip() {
  const car = carForMap();
  const T = S.trip;
  const r = await GEO.route(S.home, T.dest);
  const G = gasCar() || GASES["n-one"];
  const plan = planTrip(r.coords, FAC(), car, {
    season: SEASONS[T.season].f(), realRatio: n("rEv") || 0.9,
    startSoc: T.startSoc / 100, reserve: T.reserve / 100, target: 0.8, minGapSoc: 0.5,
    destCharge: T.destCharge, stayHours: T.overnight ? 10 : T.stayH,
    price: { home: n("pHome"), quick: n("pPub"), dest: n("pDest"), gas: n("pGas") },
    gasKmPerL: G.fe * (n("rGas") || 0.85), bufferM: 1000,
  });
  const along = findFacilitiesAlongRoute(r.coords, FAC().filter((f) => f.type === "quick"), { bufferM: 1000 }).facilities;
  const merit = findFacilitiesNear([T.dest.lat, T.dest.lng], FAC(), 3000).filter((f) => f.type === "merit");
  const outside = !r.coords.every((p) => inPolygon(p, window.COVERAGE));
  return { route: r, plan, along, merit, outside, car, gasName: G.name, gasDefault: !gasCar(), durMin: Math.round(r.durS / 60) };
}

/* =========================================================
   操作
   ========================================================= */
function setPoint(t, r) {
  const p = { lat: r.lat, lng: r.lng, label: r.label, detail: r.detail || "" };
  if (t === "home") {
    // 自宅は約100m単位に丸めて扱う（正確な住所を持たない）
    p.lat = Math.round(p.lat * 1000) / 1000; p.lng = Math.round(p.lng * 1000) / 1000;
    S.home = p;
    S.pickTarget = S.work ? "place" : "work";
  } else if (t === "work") {
    S.work = { ...p, days: S.work?.days || 5 };
    S.pickTarget = "place";
  } else {
    if (S.places.length >= 10) { S.searchMsg = "よく行く場所は10件までです"; return; }
    S.places.push({ ...p, cat: "買い物", freq: "m1" });
  }
  S.searchMsg = "";
}

const ACT = {
  back() { history.length > 1 ? history.back() : go("map"); },
  pick(k) { S.pickTarget = k; render(true); },
  async search() {
    const q = (S.searchQ || "").trim(); if (!q) return;
    S.searchMsg = "検索中…"; S.searchResults = []; render(true);
    try {
      S.searchResults = await GEO.search(q);
      S.searchMsg = S.searchResults.length ? "" : "見つかりませんでした。別の言葉で試してください";
    } catch (e) { S.searchMsg = "検索できませんでした。通信状況を確認してください"; }
    if (current === "area") render(true);
  },
  useResult(i) { const r = S.searchResults[+i]; if (!r) return; setPoint(S.pickTarget, r); S.searchResults = []; S.searchQ = ""; render(true); },
  delHome() { S.home = null; S.pickTarget = "home"; render(true); },
  delWork() { S.work = null; render(true); },
  delPlace(i) { S.places.splice(+i, 1); render(true); },
  workDays(_, el) { S.work.days = +el.value; },
  placeCat(i, el) { S.places[+i].cat = el.value; },
  placeFreq(i, el) { S.places[+i].freq = el.value; },
  layer(k) { S.layers[k] = !S.layers[k]; render(true); },
  openPlace(k) { S.selPlace = k; go("place"); },
  openFac(id) { S.selFac = id; go("facility"); },
  applyKm() {
    const a = S.area?.data; if (!a) return;
    S.kmMode = "direct"; S.annualKm = Math.round(a.annualKm / 100) * 100; S.kmApplied = true; render(true);
  },
  async tripSearch() {
    const q = (S.tripQ || "").trim(); if (!q) return;
    S.tripMsg = "検索中…"; S.tripResults = []; render(true);
    try {
      S.tripResults = await GEO.search(q);
      S.tripMsg = S.tripResults.length ? "" : "見つかりませんでした。別の言葉で試してください";
    } catch (e) { S.tripMsg = "検索できませんでした。通信状況を確認してください"; }
    if (current === "trip") render(true);
  },
  useTrip(i) { const r = S.tripResults[+i]; if (!r) return; S.trip.dest = r; S.tripResults = []; S.tripQ = ""; render(true); },
  clearDest() { S.trip.dest = null; render(true); },
  tover(v) { S.trip.overnight = v === "1"; render(true); },
  tseason(k) { S.trip.season = k; render(true); },
};
function onTripInput(el) {
  const k = el.dataset.t;
  S.trip[k] = el.type === "checkbox" ? el.checked : +el.value;
  const o = document.getElementById("o-" + k);
  if (o) o.textContent = k === "stayH" ? `${S.trip[k]}時間` : `${S.trip[k]}%`;
}

/* =========================================================
   画面：モード選択
   ========================================================= */
screens.map = () => {
  const legend = [["honda", "H", "Honda Charge"], ["quick", "急", "急速充電"], ["normal", "普", "普通充電"]].map(([k, t, l]) => `<span><span class="pin ${k}" aria-hidden="true">${t}</span>${l}</span>`).join("");
  return header("充電する場所", "cost", "マップ") + `<main class="main">
    <section class="sec">
      <h2>${pic("map", 28)} 街の充電スポット</h2>
      <div class="maplegend">${legend}<span><span class="pin home" aria-hidden="true">家</span>家のあたり</span></div>
      <div class="mapbox tall" id="map-main" aria-label="充電スポットの地図"></div>
      <p class="hint" style="margin:0">${S.home ? "別の場所をタップすると、家のあたりを変えられます。" : "地図で家のあたりをタップすると、近くの充電スポットが分かります（住所の入力はいりません）。"}ピンを押すと施設の詳細が開きます。</p>
      <div id="nearbox" aria-live="polite"></div>
    </section>
    ${chargeFreqCard()}
    <button type="button" class="hcard" data-go="chargers"><span class="hpic">${pic("plug",40)}</span><span class="tx"><span class="t">充電スポットを一覧で見る</span><span class="d">近い順・急速だけなどで絞り込めます</span></span><span style="color:var(--sub)">${CHEV_R}</span></button>
    <p class="hint">充電スポット：e-Mobility Power・Honda Charge・Tesla の公式の一覧で確かめた施設と、OpenStreetMap（© OpenStreetMap contributors）。すべての施設が載っているわけではありません。</p>
  </main>` + footer(btn2("cost", "シミュレーション結果に戻る"));
};
screens.map.update = () => {
  const m = mkMap("map-main");
  drawNear();
  if (!m) return;
  addFacPins(m, FAC().filter((f) => f.type !== "merit"));
  let homeMk = null, ring = null;
  const showHome = () => {
    if (homeMk) { homeMk.remove(); ring.remove(); }
    if (!S.home) return;
    homeMk = addPin(m, [S.home.lat, S.home.lng], "home", "家", "家のあたり");
    ring = L.circle([S.home.lat, S.home.lng], { radius: NEAR_KM * 1000, color: "#1F6FEB", weight: 2, fillOpacity: 0.06, interactive: false }).addTo(m);
  };
  showHome();
  m.setView(S.home ? [S.home.lat, S.home.lng] : [MAP_CENTER.lat, MAP_CENTER.lng], 13);
  m.on("click", (e) => {
    S.home = { lat: e.latlng.lat, lng: e.latlng.lng, label: "家のあたり", detail: "" };
    S.area = null;
    showHome(); drawNear();
    const h = document.querySelector("#map-main + .hint"); if (h) h.firstChild.textContent = "別の場所をタップすると、家のあたりを変えられます。";
  });
};

/* 地図の真ん中（家のあたりを決めていないとき）と、「近く」とする範囲 */
const MAP_CENTER = { lat: 36.5594, lng: 139.8985, label: "宇都宮駅" };
const NEAR_KM = 3;
function nearList(base) {
  return FAC().filter((f) => f.type !== "merit")
    .map((f) => ({ f, d: haversine([base.lat, base.lng], [f.lat, f.lng]) / 1000 }))
    .sort((a, b) => a.d - b.d);
}
const kmText = (d) => d < 10 ? `${d.toFixed(1)}km` : `${Math.round(d)}km`;
function drawNear() {
  const box = document.getElementById("nearbox"); if (!box) return;
  const base = S.home || MAP_CENTER, label = S.home ? "家のあたり" : MAP_CENTER.label;
  const all = nearList(base), inR = all.filter((x) => x.d <= NEAR_KM);
  const nq = all.find((x) => x.f.type === "quick"), nn = all.find((x) => x.f.type === "normal");
  box.innerHTML = `<div class="nearsum">
      <div class="ns-h">${label}から${NEAR_KM}km以内に <b class="num">${inR.length}か所</b></div>
      <div class="ns-g"><div><span>いちばん近い急速充電</span><b class="num">${nq ? kmText(nq.d) : "―"}</b></div><div><span>いちばん近い普通充電</span><b class="num">${nn ? kmText(nn.d) : "―"}</b></div></div>
    </div>
    <div class="nearlist">${all.slice(0, 5).map(({ f, d }) => facRow(f, `${esc(facSpec(f))}・${label}から約${kmText(d)}`)).join("")}</div>`;
}

/* あなたの充電の頻度（コスト比較の条件から計算。住所はいらない） */
function chargeFreqCard() {
  const r = S.evKey && typeof calc === "function" ? calc() : null;
  if (!r) return `<section class="freqcard"><b>EVを選ぶと、あなたの使い方での充電の頻度が出ます</b><button class="lk" data-go="ev">EVを選ぶ</button></section>`;
  const weekKm = r.km / 52;
  const days = (range) => Math.max(0.5, 7 / (weekKm / Math.max(range, 1)));
  const dTxt = (d) => d >= 1.5 ? `約${Math.round(d)}日に1回` : "ほぼ毎日";
  const perWeek = (range) => (weekKm / Math.max(range, 1));
  const qkw = Math.min(r.E.qkw || 50, 50) * 0.8;
  const minutes = Math.round(r.E.kwh * 0.6 / qkw * 60 / 5) * 5;
  const name = esc(r.E.name.split("（")[0]);
  const cond = `${name}・年${Math.round(r.km).toLocaleString("ja-JP")}km（週 約${Math.round(weekKm)}km）`;
  return S.homeCharge
    ? `<section class="freqcard"><div class="fc-k">${pic("house", 36)}<span>あなたの充電の頻度</span></div>
        <div class="fc-big">家で <em class="num">${dTxt(days(r.rangeMid))}</em> 充電</div>
        <div class="fc-g"><div><span>春・秋</span><b class="num">${dTxt(days(r.rangeMid))}</b></div><div><span>冬（暖房を使う）</span><b class="num">${dTxt(days(r.rangeWin))}</b></div></div>
        <p class="fc-s">夜のあいだに家で充電すれば、ふだんは外で充電しなくても足ります。外の充電スポットを使うのは、遠出のときが中心です。</p>
        <p class="hint" style="margin:0">${cond}で計算</p></section>`
    : `<section class="freqcard"><div class="fc-k">${pic("plug", 36)}<span>あなたの充電の頻度</span></div>
        <div class="fc-big">外で <em class="num">週${perWeek(r.rangeMid).toFixed(1)}回</em> 充電</div>
        <div class="fc-g"><div><span>春・秋</span><b class="num">${dTxt(days(r.rangeMid))}</b></div><div><span>冬（暖房を使う）</span><b class="num">${dTxt(days(r.rangeWin))}</b></div></div>
        <p class="fc-s">1回は急速充電で約${minutes}分（電池の20%→80%）。買い物などのついでに使える場所が近くにあるか、地図で確かめてください。</p>
        <p class="hint" style="margin:0">${cond}で計算</p></section>`;
}

/* =========================================================
   画面：充電施設の一覧（Honda Charge とそれ以外）
   ========================================================= */
const DEALER = { lat: 36.5594, lng: 139.8985, label: "宇都宮駅" };   // 並べる基準（家のあたりを決めていれば、そこ）
/* 施設の数は出さない（地図データに登録されているのは一部だけのため） */
function chgMetaText() {
  const M = window.AUTO_FACILITIES_META;
  return `地図に登録されている施設の一部です${M ? `（${jpDate(M.updatedAt)}更新）` : ""}`;
}
/* 充電の中心は自宅。結果画面の計算から、家での充電のイメージを出す */
function homeChargeCard() {
  const r = typeof calc === "function" && S.evKey ? calc() : null;
  const share = S.homeCharge ? Math.round(n("homeShare")) : 0;
  const vals = r ? `<div class="hc-v"><div><span>充電の回数（春・秋）</span><b class="num">${esc(r.fq.mid.replace(/（.*$/, ""))}</b></div><div><span>電気代（月の平均）</span><b class="num">約${(Math.round(r.evEnergy / 12 / 100) * 100).toLocaleString("ja-JP")}円</b></div></div>` : "";
  return S.homeCharge || !r ? `<section class="homecharge"><div class="hc-h">${pic("house", 48)}<b>充電の基本は、家で夜のあいだに</b></div>
      <ul><li>寝ているあいだに充電して、朝は満充電で出かけられます</li><li>ガソリンスタンドに寄る時間がいりません</li><li>外で充電するのは、遠出のときが中心です</li></ul>${vals}
      ${r ? `<p class="hint" style="margin:0">年${Math.round(r.km).toLocaleString("ja-JP")}km・自宅で充電${share}%として計算</p>` : ""}</section>`
    : `<section class="homecharge"><div class="hc-h">${pic("plug", 48)}<b>家で充電できないときは、外での充電が中心</b></div>
      <ul><li>買い物などのついでに、近くの急速充電を使います</li><li>集合住宅は、充電器を付けられるかお店で相談できます</li></ul>${vals}</section>`;
}
screens.chargers = () => {
  const base = S.home ? { lat: S.home.lat, lng: S.home.lng, label: "家のあたり" } : DEALER;
  const all = FAC().filter((f) => f.type !== "merit");
  const F = { all: ["すべて", () => true], honda: ["Honda", (f) => isHC(f) || f.network === "Honda販売店"], quick: ["急速", (f) => f.type === "quick"], normal: ["普通", (f) => f.type === "normal"] };
  const q = (S.chgQ || "").trim().toLowerCase();
  const list = all.filter(F[S.chgFilter][1]).filter((f) => !q || `${f.name} ${f.note || ""} ${f.network || ""}`.toLowerCase().includes(q))
    .map((f) => ({ f, d: haversine([base.lat, base.lng], [f.lat, f.lng]) / 1000 }))
    .sort((a, b) => (isHC(b.f) - isHC(a.f)) || a.d - b.d);
  const chips = Object.entries(F).map(([k, [l, fn]]) => `<button type="button" class="chip${k === "honda" ? " k-honda" : ""}" aria-pressed="${S.chgFilter === k}" data-act="chgFilter:${k}">${l}</button>`).join("");
  const rows = list.slice(0, S.chgShow).map(({ f, d }) => facRow(f, `${esc(facSpec(f))}・${base.label}から約${d < 10 ? d.toFixed(1) : Math.round(d)}km${f.hours ? `・${esc(f.hours)}` : ""}`)).join("");
  const M = window.AUTO_FACILITIES_META;
  const hcCount = all.filter(isHC).length;
  return header("充電スポットの一覧", "map", "一覧") + `<main class="main">
    <div class="sec"><p class="sd" style="margin:0">${chgMetaText()}。${base.label}から近い順に並べています。</p></div>
    <div class="chips" role="group" aria-label="絞り込み">${chips}</div>
    <form class="search" data-form="chgSearch" role="search"><input type="search" data-q="chgQ" value="${esc(S.chgQ)}" placeholder="施設名・地名で探す" aria-label="施設名で探す"><button type="submit">探す</button></form>
    <div class="info">Honda Charge の設置場所は、Hondaの公式アプリで確認できます。</div>
    ${demoNote()}
    <div style="display:flex;flex-direction:column;gap:8px">${rows || '<p class="hint">当てはまる施設はありません</p>'}</div>
    ${list.length > S.chgShow ? `<button class="btn2" data-act="chgMore">さらに表示</button>` : ""}
    <p class="hint">施設データ：OpenStreetMap（© OpenStreetMap contributors, ODbL）。すべての充電施設が載っているわけではありません。</p>
  </main>`;
};
Object.assign(ACT, {
  chgFilter(k) { S.chgFilter = k; S.chgShow = 60; render(true); },
  chgSearch() { S.chgShow = 60; render(true); },
  chgMore() { S.chgShow += 60; render(true); },
});

/* =========================================================
   画面：生活圏の登録
   ========================================================= */
screens.area = () => {
  const tgt = S.pickTarget;
  const tLabel = { home: "自宅", work: "職場・通学先", place: "よく行く場所" };
  const seg = Object.entries(tLabel).map(([k, l]) => `<button type="button" class="chip" aria-pressed="${tgt === k}" data-act="pick:${k}">${l}</button>`).join("");
  const res = S.searchResults.length ? `<div class="reslist">${S.searchResults.map((r, i) => `<button type="button" data-act="useResult:${i}"><span class="rl">${esc(r.label)}</span><span class="rd">${esc(r.detail)}</span></button>`).join("")}</div>` : "";
  const homeRow = S.home
    ? `<div class="prow"><div class="pin home" aria-hidden="true">家</div><div class="tx"><b>${esc(S.home.label)}</b><span>${esc(S.home.detail)}</span></div><button class="xbtn" data-act="delHome" aria-label="自宅を削除">×</button></div>
       <label class="chk"><input type="checkbox" data-k="homeCharge"${S.homeCharge ? " checked" : ""}>自宅で充電できる</label>`
    : `<p class="info">上で「自宅」を選び、検索するか地図をタップしてください</p>`;
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}"${S.work && S.work.days === d ? " selected" : ""}>週${d}日</option>`).join("");
  const workRow = S.work
    ? `<div class="prow"><div class="pin work" aria-hidden="true">職</div><div class="tx"><b>${esc(S.work.label)}</b><span>${esc(S.work.detail)}</span></div>
       <select aria-label="通う日数" data-chg="workDays">${days}</select><button class="xbtn" data-act="delWork" aria-label="職場を削除">×</button></div>`
    : `<p class="hint">なければ登録しなくて大丈夫です</p>`;
  const placeRows = S.places.map((p, i) => `<div class="prow"><div class="pin place" aria-hidden="true">${i + 1}</div><div class="tx"><b>${esc(p.label)}</b>
      <select aria-label="${esc(p.label)}の種類" data-chg="placeCat:${i}" style="height:34px;margin-top:4px;max-width:150px">${CATS.map((c) => `<option${p.cat === c ? " selected" : ""}>${c}</option>`).join("")}</select></div>
      <select aria-label="${esc(p.label)}に行く頻度" data-chg="placeFreq:${i}">${Object.entries(FREQ).map(([k, f]) => `<option value="${k}"${p.freq === k ? " selected" : ""}>${f.label}</option>`).join("")}</select>
      <button class="xbtn" data-act="delPlace:${i}" aria-label="${esc(p.label)}を削除">×</button></div>`).join("");
  const ready = S.home && (S.work || S.places.length);
  return header("生活圏の登録", "map", "入力 C-1") + `<main class="main">
    <section class="sec"><h2>登録する場所</h2><div class="chips" role="group" aria-label="登録する場所の種類">${seg}</div></section>
    <section class="sec">
      <form class="search" data-form="search" role="search"><input type="search" data-q="searchQ" value="${esc(S.searchQ)}" placeholder="例：ベルモール、宇都宮駅" aria-label="${tLabel[tgt]}を検索"><button type="submit">検索</button></form>
      ${S.searchMsg ? `<p class="hint" role="status">${esc(S.searchMsg)}</p>` : ""}${res}
      <div class="mapbox" id="map-area"></div>
      <p class="hint">地図をタップすると「${tLabel[tgt]}」にピンを置きます</p>
    </section>
    <section class="sec"><h2>自宅</h2>${homeRow}<p class="hint">自宅は約100m単位で扱い、保存はしません</p></section>
    <section class="sec"><h2>職場・通学先</h2>${workRow}</section>
    <section class="sec"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>よく行く場所</h2><span class="hint">${S.places.length} / 10</span></div>
      ${placeRows || '<p class="hint">「よく行く場所」を選んで追加してください</p>'}</section>
  </main>` + footer(btn("areamap", "生活圏マップを見る", !ready), ready ? "" : `<p class="hint" style="text-align:center;margin:0">自宅と、職場かよく行く場所を1つ以上登録してください</p>`);
};
screens.area.update = () => {
  const m = mkMap("map-area"); if (!m) return;
  const pts = [];
  if (S.home) { addPin(m, [S.home.lat, S.home.lng], "home", "家", "自宅"); pts.push([S.home.lat, S.home.lng]); }
  if (S.work) { addPin(m, [S.work.lat, S.work.lng], "work", "職", S.work.label); pts.push([S.work.lat, S.work.lng]); }
  S.places.forEach((p, i) => { addPin(m, [p.lat, p.lng], "place", i + 1, p.label); pts.push([p.lat, p.lng]); });
  fit(m, pts);
  m.on("click", async (e) => {
    const { lat, lng } = e.latlng;
    const target = S.pickTarget;
    const r = await GEO.reverse(lat, lng);
    setPoint(target, { lat, lng, ...r });
    if (current === "area") render(true);
  });
};

/* =========================================================
   画面：生活圏マップ
   ========================================================= */
screens.areamap = () => {
  if (!S.home || !(S.work || S.places.length)) {
    return header("生活圏マップ", "area", "結果 C-1") + `<main class="main"><p class="info">先に自宅と、職場かよく行く場所を登録してください。</p></main>` + footer(btn("area", "場所を登録する"));
  }
  const A = S.area;
  const chips = ["honda", "quick", "normal", "merit"].map((k) => `<button type="button" class="chip k-${k}" aria-pressed="${S.layers[k]}" data-act="layer:${k}">${{ honda: "H Honda Charge", quick: "■ 急速充電", normal: "● 普通充電", merit: "◆ EVメリット" }[k]}</button>`).join("");
  let body = "";
  if (!A || A.status === "loading") body = loadingBox("経路と施設を調べています…");
  else if (A.status === "error") body = `<p class="warnbox"><strong>計算できませんでした：</strong>${esc(A.msg)}</p>`;
  else {
    const d = A.data;
    const cnt = (t) => d.homeNear.filter((f) => f.type === t).length;
    const list = d.targets.map((t) => `<button type="button" class="lrow" data-act="openPlace:${t.key}">
      <div class="pin ${t.kind === "work" ? "work" : "place"}" aria-hidden="true" style="flex-shrink:0">${t.kind === "work" ? "職" : t.no}</div>
      <span class="tx"><b>${esc(t.label)}</b><span>${t.freqLabel}・往復 ${t.rtKm.toFixed(1)}km</span>
      <span class="badges">${[t.seasons[1], t.seasons[2]].map((s) => `<span class="bdg ${s.ok ? "ok" : "ng"}">${s.label} ${s.ok ? "充電なし" : "途中で充電"}</span>`).join("")}<span class="bdg mute">充電${t.along.length + t.near.length}・得${t.merit.length}</span></span></span></button>`).join("");
    body = `<div class="verdict good">
        <span class="lead">あなたの生活圏のまとめ（${esc(d.car.name)}）</span>
        <span class="big num" style="font-size:22px">週 約${Math.round(d.weekKm)}km、充電は週${d.chargesWeek.toFixed(1)}回</span>
        <span class="sub">${S.homeCharge ? `移動の${Math.round(d.coverPct)}%は、冬でも自宅の充電だけでまかなえます` : `自宅で充電できないため、外での充電が週${d.chargesWeek.toFixed(1)}回ほど必要です`}（冬は週${d.chargesWeekWin.toFixed(1)}回）</span>
        <span class="sub">登録した場所と頻度から、年間 約${(Math.round(d.annualKm / 100) * 100).toLocaleString("ja-JP")}km と推定</span>
        <button type="button" class="lk" data-act="applyKm">この走行距離をコスト比較（B）に反映する</button>
        ${S.kmApplied ? `<span class="toast" role="status">コスト比較の年間走行距離を ${S.annualKm.toLocaleString("ja-JP")}km にしました</span>` : ""}
      </div>
      ${d.approx ? '<p class="warnbox"><strong>距離は推定です：</strong>経路サーバーに接続できなかったため、直線距離×1.3で計算しています。</p>' : ""}
      <p class="hint">自宅から3km以内：急速 ${cnt("quick")}か所・普通 ${cnt("normal")}か所・EVメリット ${cnt("merit")}か所</p>
      <section class="sec"><h2>登録した場所</h2>${list}</section>`;
  }
  return header("生活圏マップ", "area", "結果 C-1") + `<main class="main">
    <div class="chips" role="group" aria-label="地図に表示する施設">${chips}</div>
    <div class="mapbox" id="map-areamap"></div>
    <p class="hint">ピンを押すと施設の詳細が開きます。線は自宅からの経路で、経路から1km以内の施設を「経路上」としています</p>
    ${demoNote()}${body}
  </main>` + footer(btn("cost", "シミュレーション結果に戻る"), btn2("trip", "旅行モードで遠出を試す"));
};
screens.areamap.update = () => {
  ensureArea();
  const m = mkMap("map-areamap"); if (!m) return;
  const pts = [[S.home.lat, S.home.lng]];
  const A = S.area?.status === "done" ? S.area.data : null;
  if (A) {
    A.targets.forEach((t) => L.polyline(t.route.coords, { color: "#1F6FEB", weight: 4, opacity: 0.6, dashArray: t.route.approx ? "6 6" : null }).addTo(m));
    const facs = uniqById([...A.homeNear, ...A.targets.flatMap((t) => [...t.along, ...t.near, ...t.merit])]).filter(showLayer);
    addFacPins(m, facs);
  }
  addPin(m, [S.home.lat, S.home.lng], "home", "家", "自宅");
  if (S.work) { addPin(m, [S.work.lat, S.work.lng], "work", "職", S.work.label, () => ACT.openPlace("work")); pts.push([S.work.lat, S.work.lng]); }
  S.places.forEach((p, i) => { addPin(m, [p.lat, p.lng], "place", i + 1, p.label, () => ACT.openPlace(String(i))); pts.push([p.lat, p.lng]); });
  fit(m, pts);
};

/* =========================================================
   画面：行き先の詳細
   ========================================================= */
screens.place = () => {
  const t = S.area?.data?.targets.find((x) => x.key === S.selPlace);
  if (!t) return header("行き先の詳細", "areamap", "") + `<main class="main">${loadingBox("計算しています…")}</main>` + footer(btn("areamap", "生活圏マップに戻る"));
  const bars = t.seasons.map((s) => `<div class="sbar${s.ok ? "" : " ng"}"><span>${s.label}</span><span class="tr" role="img" aria-label="${s.label}は往復で電池の${Math.round(s.usedPct)}%を使う"><i style="width:${Math.min(100, s.ratio * 100)}%"></i></span><span class="vd">${s.ok ? "充電なしで往復" : "途中で充電"}</span></div>`).join("");
  const sec = (h, sd, rows, empty) => `<section class="sec"><h2>${h}</h2>${sd ? `<p class="sd">${sd}</p>` : ""}${rows || `<p class="hint">${empty}</p>`}</section>`;
  return header(esc(t.label), "areamap", `${t.freqLabel}・${esc(t.cat)}`) + `<main class="main">
    <div class="mapbox sm" id="map-place"></div>
    <section class="sec"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>充電なしで往復できるか</h2><span class="hint">往復 ${t.rtKm.toFixed(1)}km・片道約${hm(t.durMin)}</span></div>
      <div class="sbars">${bars}<p class="hint" style="margin:0">バーは、満充電から安心ライン（残量${S.trip.reserve}%）までに使える量に対して、往復で使う割合です</p></div></section>
    ${sec("経路上の充電施設", "自宅からの経路の1km以内", t.along.map((f) => facRow(f, `${facSpec(f)}・自宅から${km1(f.alongM)}km・経路から${f.offRouteM}m`)).join(""), "登録された施設はありません")}
    ${sec("目的地の周り（歩いて行ける範囲）", "滞在中に充電できる場所（500m以内）", t.near.map((f) => facRow(f, `${facSpec(f)}・${f.distM}m`)).join(""), "登録された施設はありません")}
    ${sec("EVで得する施設・サービス", "", t.merit.map((f) => facRow(f, esc(f.merit || ""))).join(""), "登録された施設はありません")}
    ${demoNote()}
  </main>` + footer(btn("areamap", "生活圏マップに戻る"));
};
screens.place.update = () => {
  const t = S.area?.data?.targets.find((x) => x.key === S.selPlace); if (!t) { ensureArea(); return; }
  const m = mkMap("map-place"); if (!m) return;
  L.polyline(t.route.coords, { color: "#1F6FEB", weight: 5, opacity: 0.75, dashArray: t.route.approx ? "6 6" : null }).addTo(m);
  addFacPins(m, uniqById([...t.along, ...t.near, ...t.merit]));
  addPin(m, [S.home.lat, S.home.lng], "home", "家", "自宅");
  addPin(m, [t.lat, t.lng], t.kind === "work" ? "work" : "place", t.kind === "work" ? "職" : t.no, t.label);
  fit(m, t.route.coords);
};

/* =========================================================
   画面：施設の詳細
   ========================================================= */
screens.facility = () => {
  const f = FAC().find((x) => x.id === S.selFac);
  if (!f) return backHeader("施設の詳細") + `<main class="main"><p class="info">施設が見つかりませんでした。</p></main>`;
  const item = (k, v) => (v || v === 0) ? `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>` : "";
  return backHeader(esc(f.name), FTYPE[f.type]) + `<main class="main facsheet">
    <div class="mapbox sm" id="map-fac"></div>
    <div class="badges" style="font-size:12px">${isHC(f) ? '<span class="bdg" style="background:#1F6FEB;color:#fff">Honda Charge</span>' : f.network ? `<span class="bdg mute" style="background:var(--bg)">${esc(f.network)}</span>` : ""}<span class="bdg ok" style="background:${f.type === "quick" ? "#24323D" : f.type === "normal" ? "#5B6A76" : "#2E6B45"};color:#fff">${FTYPE[f.type]}</span>${f.highway ? '<span class="bdg ng">高速道路のSA/PA</span>' : ""}${f.demo ? '<span class="flag">デモ</span>' : ""}</div>
    ${isHC(f) ? '<div class="info">Honda Charge は、専用アプリで充電・支払いをします。N-ONE e: などは差すだけで充電が始まります（プラグ＆チャージ）。料金・空き状況はアプリで確認してください。</div>' : ""}
    <dl>${item("住所", f.address)}${item("出力", f.kw ? `${f.kw}kW` : "")}${item("口数", f.ports ? `${f.ports}口` : "")}${item("料金", f.priceText || (f.price != null ? `${f.price}円/kWh換算` : ""))}${item("利用できる時間", f.hours)}</dl>
    ${f.merit ? `<div class="info" style="background:var(--ok-t);color:var(--ink)"><div style="font-size:12px;font-weight:700;color:var(--ok)">EVで得すること</div>${esc(f.merit)}</div>` : ""}
    ${f.note ? `<p style="margin:0;font-size:14px">${esc(f.note)}</p>` : ""}
    <p class="hint">${f.source === "osm" ? `施設データ：OpenStreetMap（© OpenStreetMap contributors, ODbL）・${esc(f.updatedAt || "")}に自動取得。` : f.source === "official" ? `施設データ：${esc(f.sourceName || "公式の一覧")}で確認（${esc(f.updatedAt || "")}）。` : `施設データ：チーム独自調査（確認日 ${esc(f.updatedAt || "未記入")}）。`}最新の情報は施設にご確認ください。${f.source === "osm" ? ` <a href="https://www.openstreetmap.org/${{ n: "node", w: "way", r: "relation" }[f.id.charAt(4)] || "node"}/${esc(f.id.slice(5))}" target="_blank" rel="noopener">間違いを直す</a>` : ""}</p>
  </main>` + `<footer class="ft"><button class="btn2" data-act="back">戻る</button></footer>`;
};
screens.facility.update = () => {
  const f = FAC().find((x) => x.id === S.selFac); if (!f) return;
  const m = mkMap("map-fac"); if (!m) return;
  addFacPins(m, [f]); m.setView([f.lat, f.lng], 15);
};

/* =========================================================
   画面：旅行の計画（入力）
   ========================================================= */
screens.trip = () => {
  const T = S.trip;
  const start = S.home
    ? `<div class="prow"><div class="pin home" aria-hidden="true">発</div><div class="tx"><span>出発地</span><b>自宅（${esc(S.home.label)}）</b></div><button class="lk" data-go="area" style="margin:0">変更</button></div>`
    : `<p class="info">出発地として、先に自宅を登録してください。</p><button class="btn2" data-go="area">自宅を登録する</button>`;
  const dest = T.dest
    ? `<div class="prow"><div class="pin place" aria-hidden="true">着</div><div class="tx"><span>目的地</span><b>${esc(T.dest.label)}</b><span>${esc(T.dest.detail)}</span></div><button class="xbtn" data-act="clearDest" aria-label="目的地を変える">×</button></div>`
    : `<form class="search" data-form="tripSearch" role="search"><input type="search" data-q="tripQ" value="${esc(S.tripQ)}" placeholder="例：那須高原、日光東照宮" aria-label="目的地を検索"><button type="submit">検索</button></form>
       ${S.tripMsg ? `<p class="hint" role="status">${esc(S.tripMsg)}</p>` : ""}
       ${S.tripResults.length ? `<div class="reslist">${S.tripResults.map((r, i) => `<button type="button" data-act="useTrip:${i}"><span class="rl">${esc(r.label)}</span><span class="rd">${esc(r.detail)}</span></button>`).join("")}</div>` : ""}`;
  const sl = (k, label, min, max, step, unit, hint) => `<div class="slider"><div class="top"><label for="t-${k}" style="font-size:14px">${label}</label><span class="val num" id="o-${k}">${T[k]}${unit}</span></div>
     <input type="range" id="t-${k}" data-t="${k}" min="${min}" max="${max}" step="${step}" value="${T[k]}">${hint ? `<p class="hint" style="margin:0">${hint}</p>` : ""}</div>`;
  const car = carForMap();
  return header("旅行の計画", "map", "入力 C-2") + `<main class="main">
    <section class="sec"><h2>どこからどこへ</h2>${start}${dest}</section>
    <section class="sec"><h2>日程</h2><div class="chips"><button type="button" class="chip" aria-pressed="${!T.overnight}" data-act="tover:0">日帰り</button><button type="button" class="chip" aria-pressed="${T.overnight}" data-act="tover:1">1泊以上</button></div>
      ${T.overnight ? "" : sl("stayH", "目的地での滞在時間", 1, 8, 1, "時間")}</section>
    <section class="sec"><h2>季節</h2><p class="sd">エアコンの使用で電費が変わります</p><div class="chips">${Object.entries(SEASONS).map(([k, s]) => `<button type="button" class="chip" aria-pressed="${T.season === k}" data-act="tseason:${k}">${s.label}</button>`).join("")}</div></section>
    ${sl("startSoc", "出発時の充電量", 20, 100, 5, "%", "前の晩に自宅で満充電なら100%")}
    <label class="chk"><input type="checkbox" data-t="destCharge"${T.destCharge ? " checked" : ""}>${T.overnight ? "宿泊先で充電できる" : "目的地で滞在中に充電できる"}</label>
    <div class="info">${sl("reserve", "これより減らさない残量（安心ライン）", 10, 40, 5, "%")}</div>
  </main>` + footer(btn("tripres", "ルートと充電施設を見る", !(S.home && T.dest)), `<p class="hint" style="text-align:center;margin:0">EV：${esc(car.name)}</p>`);
};

/* =========================================================
   画面：旅行の結果（ルートと充電施設）
   ========================================================= */
function socChart(trace, totalM, reserve) {
  const W = 340, H = 120, L0 = 30, R0 = 10, T0 = 10, B0 = 22;
  const x = (m) => L0 + ((W - L0 - R0) * m) / Math.max(totalM, 1);
  const y = (s) => T0 + (H - T0 - B0) * (1 - s);
  const pts = trace.map((p) => `${x(p.alongM).toFixed(1)},${y(p.soc).toFixed(1)}`).join(" ");
  const stops = trace.filter((p) => p.label === "charge-in");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="行きの電池残量の変化">
    ${[0, 0.5, 1].map((s) => `<line x1="${L0}" x2="${W - R0}" y1="${y(s)}" y2="${y(s)}" stroke="var(--line)"/><text x="${L0 - 4}" y="${y(s) + 4}" font-size="10" fill="var(--sub)" text-anchor="end">${s * 100}%</text>`).join("")}
    <line x1="${L0}" x2="${W - R0}" y1="${y(reserve)}" y2="${y(reserve)}" stroke="var(--gas)" stroke-dasharray="4 4"/>
    <text x="${L0 + 4}" y="${y(reserve) - 4}" font-size="10" fill="var(--gas)">安心ライン ${Math.round(reserve * 100)}%</text>
    <polyline points="${pts}" fill="none" stroke="var(--ev)" stroke-width="2.5" stroke-linejoin="round"/>
    ${stops.map((p, i) => `<circle cx="${x(p.alongM)}" cy="${y(p.soc)}" r="5" fill="var(--gas)"/><text x="${x(p.alongM)}" y="${y(p.soc) + 16}" font-size="10" font-weight="700" fill="var(--gas)" text-anchor="middle">${i + 1}</text>`).join("")}
    <text x="${L0}" y="${H - 4}" font-size="10" fill="var(--sub)">出発</text>
    <text x="${W - R0}" y="${H - 4}" font-size="10" fill="var(--sub)" text-anchor="end">到着 ${km1(totalM)}km</text>
  </svg>`;
}
screens.tripres = () => {
  const T = S.trip;
  if (!S.home || !T.dest) return header("ルートと充電施設", "trip", "結果 C-2") + `<main class="main"><p class="info">出発地と目的地を設定してください。</p></main>` + footer(btn("trip", "旅行の計画に戻る"));
  const R = S.tripRes;
  const head = header(`${esc(T.dest.label)}まで`, "trip", `結果 C-2・${SEASONS[T.season].label}`);
  if (!R || R.status === "loading") return head + `<main class="main">${loadingBox("経路と充電計画を計算しています…")}<div class="mapbox" id="map-trip"></div></main>`;
  if (R.status === "error") return head + `<main class="main"><p class="warnbox"><strong>計算できませんでした：</strong>${esc(R.msg)}</p></main>` + footer(btn2("trip", "条件を変える"));
  const d = R.data, P = d.plan, O = P.outbound;
  const lead = `片道 ${P.distanceKm}km・約${hm(d.durMin)}${d.route.approx ? "（推定）" : ""}`;
  let verdict;
  if (!O.ok) {
    const why = !FAC().some((f) => f.type === "quick") ? "急速充電の施設データがまだ登録されていません。" : d.outside ? "経路が施設データの対象範囲の外を通るため、充電施設が登録されていない可能性があります。" : "出発時の充電量を増やすか、安心ラインを下げて試してください。";
    verdict = `<div class="verdict bad"><span class="lead">${lead}</span><span class="big">この条件では、途中の充電先が見つかりません</span><span class="sub">出発から約${km1(O.failAtM || 0)}kmで安心ライン（${T.reserve}%）を下回ります。${why}</span></div>`;
  } else {
    const big = O.stops.length ? `途中で${O.stops.length}回充電すれば、安心して到着できます` : "充電なしで到着できます";
    verdict = `<div class="verdict good"><span class="lead">${lead}</span><span class="big">${big}</span><span class="sub">到着時の残量 約${Math.round(O.arriveSoc * 100)}%</span></div>`;
  }
  let back = "";
  if (P.inbound) {
    const dc = P.destCharger;
    const destTxt = T.destCharge && dc ? `${T.overnight ? "宿" : "目的地"}で充電して約${Math.round(P.socAtDest * 100)}%から出発。` : P.destQuick ? `目的地近くの急速充電で約80%にしてから出発。` : "";
    back = `<p class="info"><b>帰り：</b>${destTxt}${P.inbound.ok ? (P.inbound.stops.length ? `途中で${P.inbound.stops.length}回充電して自宅へ（到着時 約${Math.round(P.inbound.arriveSoc * 100)}%）` : `充電なしで自宅へ（到着時 約${Math.round(P.inbound.arriveSoc * 100)}%）`) : "帰りの充電先が見つかりません。目的地での充電を検討してください。"}</p>`;
  }
  const recIds = new Set(O.stops.map((s) => s.id));
  const along = d.along.slice(0, 8).map((f) => facRow(f, `${facSpec(f)}・出発から${km1(f.alongM)}km・経路から${f.offRouteM}m`, recIds.has(f.id))).join("");
  const destList = P.destChargers.map((f) => facRow(f, `${facSpec(f)}・目的地から${f.distM}m`)).join("");
  const merit = d.merit.map((f) => facRow(f, esc(f.merit || ""))).join("");
  return head + `<main class="main">
    ${verdict}
    ${d.outside ? '<p class="warnbox"><strong>データ対象外の区間があります：</strong>この経路の一部は、施設データを集めた範囲の外を通ります。表示されていない充電施設がある可能性があります。</p>' : ""}
    ${d.route.approx ? '<p class="warnbox"><strong>経路は推定です：</strong>経路サーバーに接続できなかったため、直線距離×1.3で計算しています。</p>' : ""}
    <div class="mapbox" id="map-trip"></div>
    ${O.trace && O.trace.length > 1 ? `<section class="sec"><h2>電池の残量の変化（行き）</h2>${socChart(O.trace, P.outbound.trace.at(-1).alongM, T.reserve / 100)}</section>` : ""}
    ${back}
    <section class="sec"><h2>経路上の急速充電</h2>${along || '<p class="hint">登録された施設はありません</p>'}${d.along.length > 8 ? `<p class="hint" style="text-align:center">ほか ${d.along.length - 8} 件</p>` : ""}</section>
    <section class="sec"><h2>目的地の充電施設</h2>${destList || `<p class="hint">登録された施設はありません${T.destCharge ? `（「${T.overnight ? "宿泊先" : "目的地"}で充電できる」の入力から、普通充電6kWを想定して計算しています）` : ""}</p>`}</section>
    ${merit ? `<section class="sec"><h2>目的地の近くのEVで得する施設</h2>${merit}</section>` : ""}
    ${demoNote()}
  </main>` + footer(btn("tripplan", "充電計画と費用を見る", !O.ok), btn2("cost", "シミュレーション結果に戻る"));
};
screens.tripres.update = () => {
  ensureTrip();
  const m = mkMap("map-trip"); if (!m) return;
  const T = S.trip;
  const R = S.tripRes?.status === "done" ? S.tripRes.data : null;
  addPin(m, [S.home.lat, S.home.lng], "home", "発", "自宅");
  addPin(m, [T.dest.lat, T.dest.lng], "place", "着", T.dest.label);
  if (!R) { fit(m, [[S.home.lat, S.home.lng], [T.dest.lat, T.dest.lng]]); return; }
  L.polyline(R.route.coords, { color: "#1F6FEB", weight: 5, opacity: 0.8, dashArray: R.route.approx ? "6 6" : null }).addTo(m);
  const rec = new Set(R.plan.outbound.stops.map((s) => s.id));
  addFacPins(m, uniqById([...R.along.filter((f) => !rec.has(f.id)), ...R.plan.destChargers, ...R.merit]));
  R.plan.outbound.stops.forEach((s, i) => addPin(m, [s.lat, s.lng], "stop", i + 1, `推奨 ${i + 1}：${s.name}`, () => ACT.openFac(s.id)));
  fit(m, R.route.coords);
};

/* =========================================================
   画面：充電計画と費用
   ========================================================= */
screens.tripplan = () => {
  const R = S.tripRes?.status === "done" ? S.tripRes.data : null;
  if (!R || !R.plan.outbound.ok) return header("充電計画と費用", "tripres", "") + `<main class="main"><p class="info">先にルートと充電施設を計算してください。</p></main>` + footer(btn("tripres", "結果に戻る"));
  const T = S.trip, P = R.plan, O = P.outbound, I = P.inbound;
  const pct = (s) => `${Math.round(s * 100)}%`;
  const ic = (bg, t) => `<div class="ic" style="background:${bg}">${t}</div>`;
  const step = (icon, title, sub, soc) => `<div class="st">${icon}<div style="display:flex;flex-direction:column"><b>${title}</b>${sub ? `<span>${sub}</span>` : ""}</div><span class="soc num">${soc}</span></div>`;
  const leg = (m, extra) => `<div class="lg">${km1(m)}km${extra ? `・${extra}` : ""}</div>`;
  const rows = [];
  rows.push(step(ic("#1F6FEB", "家"), "自宅を出発", T.startSoc === 100 ? "前の晩に自宅で満充電" : "", `${T.startSoc}%`));
  let prev = 0;
  O.stops.forEach((s, i) => {
    rows.push(leg(s.alongM - prev));
    rows.push(step(ic("#A8490C", i + 1), `${esc(s.name)}で急速充電`, `約${s.minutes}分・${s.addKwh.toFixed(1)}kWh${s.priceText ? `・${esc(s.priceText)}` : ""}`, `${pct(s.socArrive)}→${pct(s.socLeave)}`));
    prev = s.alongM;
  });
  const totalM = O.trace.at(-1).alongM;
  rows.push(leg(totalM - prev));
  rows.push(step(ic("#A8490C", "着"), `${esc(T.dest.label)}に到着`, "", pct(O.arriveSoc)));
  if (P.kwh.dest > 0) {
    const dc = P.destCharger;
    rows.push(step(ic("#5B6A76", "充"), `${esc(dc.name)}で普通充電`, `${T.overnight ? "一晩" : `${T.stayH}時間`}・${P.kwh.dest}kWh${dc.assumed ? "（施設データなし・6kWを想定）" : ""}`, `→${pct(P.socAtDest)}`));
  }
  if (P.destQuick) rows.push(step(ic("#A8490C", "急"), `${esc(P.destQuick.name)}で急速充電`, `約${P.destQuick.minutes}分・${P.destQuick.addKwh.toFixed(1)}kWh`, `${pct(P.destQuick.socArrive)}→${pct(P.destQuick.socLeave)}`));
  if (I && I.ok) {
    let p2 = 0;
    I.stops.forEach((s, i) => {
      rows.push(leg(s.alongM - p2, "帰り"));
      rows.push(step(ic("#A8490C", `帰${i + 1}`), `${esc(s.name)}で急速充電`, `約${s.minutes}分・${s.addKwh.toFixed(1)}kWh`, `${pct(s.socArrive)}→${pct(s.socLeave)}`));
      p2 = s.alongM;
    });
    rows.push(leg(I.trace.at(-1).alongM - p2, "帰り"));
    rows.push(step(ic("#1F6FEB", "家"), "自宅に到着", "", pct(I.arriveSoc)));
  } else {
    rows.push(`<p class="warnbox"><strong>帰りの充電先が見つかりません：</strong>目的地での充電を入れて試してください。</p>`);
  }
  const c = P.cost;
  const quickN = O.stops.length + (P.destQuick ? 1 : 0) + (I?.stops.length || 0);
  return header("充電計画と費用", "tripres", `${T.overnight ? "1泊" : "日帰り"}・${SEASONS[T.season].label}`) + `<main class="main">
    <section class="sec"><h2>往復の充電計画</h2><div class="tl">${rows.join("")}</div></section>
    <section class="sec"><h2>充電費用の概算（往復）</h2>
      <div style="border:1px solid var(--line);border-radius:12px;padding:2px 14px">
        <div class="kvrow"><div>自宅での充電<small>${P.kwh.home}kWh × ${n("pHome")}円</small></div><b class="num">${yen(c.home)}</b></div>
        <div class="kvrow"><div>途中の急速充電（${quickN}回）<small>${P.kwh.quick}kWh・施設の料金または ${n("pPub")}円/kWh換算</small></div><b class="num">${yen(c.quick)}</b></div>
        <div class="kvrow"><div>${T.overnight ? "宿" : "目的地"}での普通充電<small>${P.kwh.dest}kWh</small></div><b class="num">${yen(c.dest)}</b></div>
        <div class="kvrow" style="font-size:15px"><b>合計</b><b class="num e">約${yen(c.total)}</b></div>
      </div>
      <div class="kv"><div class="c" style="background:var(--ev-t);border:0"><span class="l e" style="font-weight:700">EV（${esc(R.car.name)}）</span><span class="v num">約${yen(c.total)}</span></div>
        <div class="c" style="background:var(--gas-t);border:0"><span class="l g" style="font-weight:700">ガソリン車なら（${esc(R.gasName)}）</span><span class="v num">約${yen(c.gas)}</span></div></div>
      <p class="hint">急速充電は時間ごとの料金が多いため、kWhあたりに換算した概算です。比べるガソリン車は、コスト比較と同じ車種で計算しています。</p>
    </section>
  </main>` + footer(btn2("cost", "シミュレーション結果に戻る"), btn2("trip", "条件を変える"));
};

/* =========================================================
   トータル表示のタイル C
   ========================================================= */
function tileC() {
  const A = S.area?.status === "done" ? S.area.data : null;
  const R = S.tripRes?.status === "done" ? S.tripRes.data : null;
  if (!A && !R) return `<div class="tile"><div class="h">${pic("map",32)}<span class="ht">生活圏・おでかけ</span></div><div class="big">まだ入力されていません</div><div class="links"><button class="lk" data-go="map">場所を登録する</button></div></div>`;
  const big = A ? (S.homeCharge ? `移動の${Math.round(A.coverPct)}%を、冬でも自宅の充電で` : `外での充電は週${A.chargesWeek.toFixed(1)}回ほど`) : "";
  const tripTxt = R ? `旅行：${esc(S.trip.dest.label)}まで ${!R.plan.outbound.ok ? "充電先が見つからない区間あり" : R.plan.outbound.stops.length ? `途中${R.plan.outbound.stops.length}回の充電で到着` : "充電なしで到着"}` : "";
  return `<div class="tile"><div class="h">${pic("map",32)}<span class="ht">生活圏・おでかけ</span></div>
    ${big ? `<div class="big">${big}</div>` : ""}
    <div class="s">${A ? `週 約${Math.round(A.weekKm)}km・登録した場所 ${A.targets.length}か所` : ""}${A && R ? "<br>" : ""}${tripTxt}</div>
    <div class="links">${A ? '<button class="lk" data-go="areamap">生活圏マップ</button>' : ""}${R ? '<button class="lk" data-go="tripres">旅行の結果</button>' : '<button class="lk" data-go="trip">旅行を試す</button>'}</div></div>`;
}

screens.total.update = () => { ensureArea(); ensureTrip(); };

/* 起動は lifestyle.js の最後で行う */
