/* =========================================================
   今日の走り（レンタカー返却時）と 相談メモ
   画面：drive（今日の走り）→ … → memo（相談メモ）
   ========================================================= */

/* ---------- 今日の走り ---------- */
const DRIVE_MIN_KM = 20;          // これより短いと電費がぶれるので、コスト比較には使わない
const DRIVE_WH_RANGE = [50, 400]; // 電費（Wh/km）として考えられる範囲。外れたら入力ミスとみなす
const SEASON_LABEL = { mid: "春・秋", sum: "夏", win: "冬" };
const seasonNow = () => { const m = new Date().getMonth() + 1; return m >= 6 && m <= 9 ? "sum" : (m === 12 || m <= 3) ? "win" : "mid"; };
if (!S.dSeason) S.dSeason = seasonNow();

function driveResult() {
  const car = EVS[S.dCar]; if (!car || car.custom) return { state: "none" };
  const km = parseFloat(S.dKm), s0 = parseFloat(S.dSoc0), s1 = parseFloat(S.dSoc1);
  if (!(km > 0) || !isFinite(s0) || !isFinite(s1)) return { state: "none" };
  if (s0 > 100 || s1 < 0 || s0 <= s1) return { state: "bad", reason: "電池の残量は「貸し出し時」のほうが大きくなるように入れてください（0〜100%）。" };
  const kwh = (s0 - s1) / 100 * car.kwh;
  const whMeas = kwh * 1000 / km;
  if (whMeas < DRIVE_WH_RANGE[0] || whMeas > DRIVE_WH_RANGE[1]) return { state: "bad", reason: "距離と残量の組み合わせが、電費として考えにくい値です。入力を確かめてください。" };
  const c = S.dSeason === "sum" ? (n("cSum") || 1) : S.dSeason === "win" ? (n("cWin") || 1) : 1;
  const whBase = whMeas * c;                       // 春秋の条件に直した電費（実際の走り）
  const whCat = car.wh / (n("rEv") || 1);          // 今の設定での春秋の電費（カタログ×実電費係数）
  const short = km < DRIVE_MIN_KM;
  return { state: short ? "short" : "ok", car, km, kwh, whMeas, whBase, kmPerKwh: 1000 / whMeas,
    ratio: whCat / whBase, yenToday: kwh * (S.homeCharge ? n("pHome") : n("pPub")) };
}
/* コスト比較に使うときだけ値を返す（同じ車種を選んでいるとき） */
function driveForCalc() {
  if (!S.dUse || S.dCar !== S.evKey) return null;
  const r = driveResult(); return r.state === "ok" ? r : null;
}

screens.drive = () => {
  const evs = Object.entries(EVS).filter(([k, d]) => !d.custom);
  return header("今日の走り", "home", "レンタカー返却時") + `<main class="main">
    <div class="hero"><div class="herorow" aria-hidden="true">${pic("key",56)}${pic("battery",56)}</div><h1 style="font-size:22px">今日の走りから、<br>あなたの電費を出す</h1><p>メーターの数字を入れるだけ。分からなければスタッフへ。</p></div>
    <section class="sec"><h2>乗った車</h2>
      <label class="f">車種<select data-k="dCar">${evs.map(([k, d]) => `<option value="${k}"${S.dCar === k ? " selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label></section>
    <section class="sec"><h2>${pic("road",28)} 走った距離</h2>
      <label class="f">距離（km）<input type="number" inputmode="decimal" data-k="dKm" value="${esc(S.dKm)}" min="0" step="1" placeholder="例：48"></label></section>
    <section class="sec"><h2>${pic("battery",28)} 電池の残量</h2>
      <div class="row2"><label class="f">貸し出し時（%）<input type="number" inputmode="decimal" data-k="dSoc0" value="${esc(S.dSoc0)}" min="0" max="100" step="1" placeholder="例：90"></label>
      <label class="f">返却時（%）<input type="number" inputmode="decimal" data-k="dSoc1" value="${esc(S.dSoc1)}" min="0" max="100" step="1" placeholder="例：72"></label></div></section>
    <section class="sec"><h2>季節</h2>
      <div class="seg segpic" style="grid-template-columns:repeat(3,minmax(0,1fr))" role="radiogroup" aria-label="季節">
        ${["mid", "sum", "win"].map((s) => `<label><input type="radio" name="dSeason" data-k="dSeason" value="${s}"${S.dSeason === s ? " checked" : ""}>${pic({ mid: "seedling", sum: "sun", win: "snow" }[s], 24)}${SEASON_LABEL[s]}</label>`).join("")}
      </div></section>
    <div id="dres" aria-live="polite"></div>
  </main>` + footer(`<button class="btn" id="dgo" data-act="driveApply">この電費でコストを比べる</button>`, btn2("gas", "カタログの電費で比べる"));
};
screens.drive.update = () => {
  const r = driveResult(), box = document.getElementById("dres"), go = document.getElementById("dgo");
  if (!box) return;
  const ok = r.state === "ok";
  go.disabled = !ok; go.style.opacity = ok ? "" : ".45"; go.setAttribute("aria-disabled", String(!ok));
  if (r.state === "none") { box.innerHTML = `<p class="hint" style="margin:0">距離と残量を入れると、ここに今日の電費が出ます。</p>`; return; }
  if (r.state === "bad") { box.innerHTML = `<div class="warnbox">${r.reason}</div>`; return; }
  const pct = Math.round(r.ratio * 100);
  box.innerHTML = `<div class="lsstat"><span>今日の電費${r.state === "short" ? "（参考）" : ""}</span>
      <b class="num">1kWhで ${r.kmPerKwh.toFixed(1)}km</b>
      <small>使った電気 約${r.kwh.toFixed(1)}kWh・電気代にすると約${Math.round(r.yenToday / 10) * 10}円（${S.homeCharge ? "自宅" : "外"}の電気代で計算）<br>
      春・秋の条件に直すと、${Math.abs(pct - 100) < 3 ? "カタログから見込んだ電費とほぼ同じ" : pct > 100 ? `カタログから見込んだ電費より約${pct - 100}%良い走り` : `カタログから見込んだ電費より約${100 - pct}%多く電気を使った走り（エアコンや坂道、速度で変わります）`}</small></div>
    ${r.state === "short" ? `<div class="warnbox" style="margin-top:10px">${DRIVE_MIN_KM}km未満の短い距離では電費がぶれるため、コスト比較にはカタログの電費を使います。</div>` : ""}`;
};

/* ---------- 相談メモ：聞きたいこと ----------
   auto : 試算の結果から「おすすめ」として最初からチェックしておく条件
*/
const MEMO_ASKS = [
  { id: "subsidy", label: "補助金の受付状況と締め切り（納車が間に合うか）", auto: (r) => r && r.E.sub > 0 },
  { id: "estimate", label: "見積もり・値引き・下取り", auto: (r) => r && r.diff >= 0 },
  { id: "charger", label: "自宅に充電器を付ける費用と工事", auto: () => S.homeCharge },
  { id: "apartment", label: "集合住宅での充電のしかた", auto: () => !S.homeCharge },
  { id: "winter", label: "冬の電費と、走れる距離", auto: () => true },
  { id: "spots", label: "近くの充電スポット" },
  { id: "longtrip", label: "長距離・旅行のときの充電", auto: () => S.tripRes?.status === "done" },
  { id: "battery", label: "電池の寿命と保証" },
  { id: "resale", label: "売るときの価値（残価）" },
  { id: "power", label: "停電のときの給電" },
  { id: "testdrive", label: "試乗・レンタカー", auto: () => !S.dUse },
];

function memoInitAsks(r) {
  if (S.memoInit) return;
  const a = {}; MEMO_ASKS.forEach((q) => { if (q.auto && q.auto(r)) a[q.id] = true; });
  S.memoAsks = a; S.memoInit = true;
}

/* 生活圏・旅行・ライフスタイルの結果（リンクで開いたときは送られてきた文を使う） */
function memoExtras() {
  if (S.fromLink && S.memoExt) return S.memoExt;
  const ext = {};
  const A = S.area?.status === "done" ? S.area.data : null;
  if (A) ext.area = S.homeCharge ? `生活圏：移動の${Math.round(A.coverPct)}%を、冬でも自宅の充電でまかなえる（週 約${Math.round(A.weekKm)}km）` : `生活圏：外での充電は週${A.chargesWeek.toFixed(1)}回ほど（週 約${Math.round(A.weekKm)}km）`;
  const R = S.tripRes?.status === "done" ? S.tripRes.data : null;
  if (R) ext.trip = `旅行：${S.trip.dest.label}まで、${!R.plan.outbound.ok ? "充電先が見つからない区間あり" : R.plan.outbound.stops.length ? `途中${R.plan.outbound.stops.length}回の充電で到着` : "充電なしで到着"}`;
  if (S.ls?.seen && typeof lsRanked === "function") { const top = lsRanked()[0]; if (top) ext.ls = `暮らし：${top.title}`; }
  return ext;
}

screens.memo = () => {
  const r = doneB() || S.fromLink ? calc() : null;
  if (!r) return header("相談メモ", "home", "相談メモ") + `<main class="main"><div class="info">相談メモは、コスト比較の結果から作ります。先にコストを比べてください（約3分）。</div></main>` + footer(btn("ev", "コストを比べる"));
  memoInitAsks(r);
  const rv = rivalShort(), km = Math.round(r.km);
  const dA = r.gAnnual - r.eAnnual;   // ランニングコスト（燃料・税金・メンテ・保険）の1年あたりの差
  const ext = memoExtras();
  const asks = MEMO_ASKS.map((q) => `<button type="button" class="lsopt" aria-pressed="${!!S.memoAsks[q.id]}" data-act="memoAsk:${q.id}"><span class="dot" aria-hidden="true"></span><span class="tx"><b>${q.label}</b></span></button>`).join("");
  const conds = [
    ["EV", r.E.name], [`比べる${rv}`, r.G.name], ["年間の走行距離", `約${km.toLocaleString("ja-JP")}km`],
    ["自宅での充電", S.homeCharge ? `できる（${Math.round(n("homeShare"))}%を自宅で）` : "できない"], ["乗る年数", `${r.N}年`],
    ["EVの電費", r.drive ? `今日の走りから 1kWhで${r.drive.kmPerKwh.toFixed(1)}km` : "カタログ値から"],
  ];
  const total = r.diff < 0 ? `${r.N}年で EVが 約${man(-r.diff)} 安い` : `${r.N}年で ${rv}が 約${man(r.diff)} 安い`;
  return header("相談メモ", "cost", "相談メモ") + `<main class="main" style="gap:18px">
    ${S.fromLink ? `<div class="info">共有されたリンクから開いています。数字は送られた条件で計算し直しています。</div>` : ""}
    <div class="sec memo-top">${pic("clipboard",64)}<div><h1 class="memo-h">聞きたいことを<br>1枚にまとめました</h1><p class="sd" style="margin:0">スタッフに見せるだけでOK。相談は自由です。</p></div></div>
    <div class="memo-grid">
      <section class="memo-card">
        <h2>あなたの試算</h2>
        <div class="memo-res">
          <div>${pic("tag",30)}<span class="mr"><span>買うとき</span><b class="num">${r.subTotal > 0 ? `補助金で ${man0(r.subTotal)} 安く` : SUBSIDY.closed ? "国の補助金：受付終了" : "補助金：対象外・未確認"}</b></span></div>
          <div>${pic("plug",30)}<span class="mr"><span>乗るとき</span><b class="num">${dA >= 0 ? `ランニングコストが 年 約${man(dA)} 安く` : `ランニングコストが 年 約${man(-dA)} 高く`}</b></span></div>
          <div class="sum">${pic("coin",30)}<span class="mr"><span>合わせると</span><b class="num">${total}</b></span></div>
        </div>
        ${r.E.sub > 0 ? `<p class="deadline-line ${subsidyStatus().state}" style="margin:0">${pic("hourglass",22)}${["open","near"].includes(subsidyStatus().state) ? `補助金の受付は${SUBSIDY.endText}まで（見込み）` : subsidyStatus().text}</p>` : ""}
        ${ext.area || ext.trip || ext.ls ? `<ul class="memo-ext">${[ext.area, ext.trip, ext.ls].filter(Boolean).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        <dl class="memo-cond">${conds.map(([t, v]) => `<div><dt>${t}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        <p class="hint" style="margin:0">価格・燃費・係数の一部は仮の値です。正式な金額は見積もりで確認してください。</p>
      </section>
      <section class="memo-card">
        <h2>${pic("speech",28)} 聞きたいこと</h2><p class="sd" style="margin:0">おすすめに印を付けています</p>
        <div class="lsopts">${asks}</div>
        <label class="f">ほかに聞きたいこと<textarea data-q="memoNote" rows="3" placeholder="例：妻の通勤にも使えるか">${esc(S.memoNote)}</textarea></label>
      </section>
    </div>
    <section class="memo-card noprint">
      <h2>${pic("phone",28)} 家族に送る・ほかの端末で開く</h2>
      <div class="memo-share"><div id="qr" class="qr" aria-label="この結果を開くQRコード"></div>
        <div style="display:flex;flex-direction:column;gap:8px;flex-grow:1">
          <p class="hint" style="margin:0">リンクには試算の条件だけが入ります（名前・住所は入りません）</p>
          <button class="btn2" data-act="memoCopy">リンクをコピー</button>
          ${navigator.share ? '<button class="btn2" data-act="memoShare">LINEなどで送る</button>' : ""}
          <button class="btn2" data-act="memoPrint">印刷・PDFで保存</button>
          <span class="toast" id="memoMsg" aria-live="polite"></span>
        </div></div>
    </section>
  </main>` + footer(btn2("rental", "まず乗ってみる（レンタカー）"), btn2("total", "暮らし・おでかけも見る"));
};
screens.memo.update = () => drawQR();

/* ---------- リンクで結果を渡す ---------- */
const S_DEFAULT = JSON.parse(JSON.stringify(S));
const SHARE_KEYS = ["rivalType", "gasKey", "evKey", "kmMode", "annualKm", "monthlySpend", "curFe",
  "gc_price", "gc_fe", "gc_tax", "gc_wt", "ec_price", "ec_sub", "ec_wh", "ec_kwh", "ec_tax", "ec_wt",
  "homeCharge", "homeShare", "years", "evAdj", "gasAdj", "evFees", "gasFees",
  "pGas", "pHome", "pPub", "charger", "mGas", "mEv", "insGas", "insEv", "gFe", "city", "cSum", "cWin", "rGas", "rEv", "usable", "scen",
  "dCar", "dKm", "dSoc0", "dSoc1", "dSeason", "dUse", "memoAsks", "memoNote"];
const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

function shareUrl() {
  const o = {};
  SHARE_KEYS.forEach((k) => { if (JSON.stringify(S[k]) !== JSON.stringify(S_DEFAULT[k])) o[k] = S[k]; });
  const ext = memoExtras(); if (Object.keys(ext).length) o.ext = ext;
  return location.href.split("#")[0] + "#/memo?d=" + b64e(JSON.stringify(o));
}
function restoreFromLink(query) {
  const d = new URLSearchParams(query).get("d"); if (!d) return false;
  try {
    const o = JSON.parse(b64d(d));
    SHARE_KEYS.forEach((k) => { if (k in o) S[k] = o[k]; });
    S.memoExt = o.ext || {}; S.fromLink = true; S.memoInit = true; S.seenCost = true;
    return true;
  } catch (e) { return false; }
}

function drawQR() {
  const el = document.getElementById("qr"); if (!el) return;
  if (typeof QRCode === "undefined") { el.hidden = true; return; }
  el.innerHTML = "";
  try { new QRCode(el, { text: shareUrl(), width: 168, height: 168, correctLevel: QRCode.CorrectLevel.L }); }
  catch (e) { el.hidden = true; }
}

const memoMsg = (t) => { const m = document.getElementById("memoMsg"); if (m) m.textContent = t; };
Object.assign(ACT, {
  driveApply() { if (driveResult().state !== "ok") return; S.dUse = true; S.evKey = S.dCar; S.gasKey = EVS[S.dCar]?.rival || "n-one"; S.rivalType = "gas"; go("gas"); },
  driveOff() { S.dUse = false; render(true); },
  setKm(v) { S.annualKm = +v; S.kmMode = "direct"; render(true); },
  memoAsk(id) { S.memoAsks = { ...S.memoAsks, [id]: !S.memoAsks[id] }; render(true); },
  async memoCopy() {
    const u = shareUrl();
    try { await navigator.clipboard.writeText(u); memoMsg("リンクをコピーしました"); }
    catch (e) { window.prompt("このリンクをコピーしてください", u); }
  },
  async memoShare() { try { await navigator.share({ title: "EVの試算と相談メモ", url: shareUrl() }); } catch (e) {} },
  memoPrint() { window.print(); },
});

/* 入力が変わったらQRを作り直す（メモ欄） */
app.addEventListener("input", (e) => { if (current === "memo" && e.target.dataset.q === "memoNote") { clearTimeout(drawQR.t); drawQR.t = setTimeout(drawQR, 400); } });
