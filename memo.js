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
  { id: "subsidy", label: "補助金に間に合う納車の時期（12月までに登録できるか）", auto: (r) => r && r.E.sub > 0 },
  { id: "estimate", label: "見積もり・値引き・下取り", auto: (r) => r && r.diff >= 0 },
  { id: "charger", label: "自宅に充電器を付ける費用と工事", auto: () => S.homeEnv === "install" },
  { id: "apartment", label: "家で充電できないときの充電のしかた", auto: () => !S.homeCharge },
  { id: "winter", label: "冬の電費と、走れる距離", auto: () => true },
  { id: "spots", label: "近くの充電スポット", auto: () => !S.homeCharge },
  { id: "longtrip", label: "長距離・旅行のときの充電", auto: () => S.tripRes?.status === "done" },
  { id: "battery", label: "電池の寿命と保証" },
  { id: "resale", label: "売るときの価値（残価）" },
  { id: "power", label: "停電のときの給電" },
  { id: "testdrive", label: "試乗・レンタカー", auto: () => !S.dUse },
];

/* 補助金の行（国は登録の時期ごと、市町は受付の状況） */
function memoSubText(r) {
  const ED = EVS[S.evKey] || {}, per = subPeriod(), L = r.local.L;
  const two = !SUBSIDY.closed && !afterCut() && subDec(ED) > 0 && subDec(ED) !== sub2027(ED);
  const nat = r.E.sub > 0
    ? `国 最大${man0(r.E.sub)}（${per === "dec" ? "12月までに登録" : "2027年1月以降に登録"}）${two ? `・${per === "dec" ? "1月以降の登録なら" : "12月までに登録なら"}最大${man0(per === "dec" ? sub2027(ED) : subDec(ED))}` : ""}`
    : (SUBSIDY.closed ? "国の補助金は受付終了" : "国 ―");
  const dl = SUBSIDY.closed ? "" : `。受付終了の見込み ${SUBSIDY.endText}・申請の最終締切 ${jpDate(SUBSIDY.finalDeadline)}`;
  const loc = !L ? "" : `／${L.name} ${r.local.counted ? `最大${man0(r.local.counted)}` : L.status === "check" ? `${L.name.endsWith("町") ? "町" : "市"}のページで確認` : ((window.LOCAL_STATUS_LABEL || {})[L.status] || "")}`;
  return nat + loc + dl;
}
const storeInfo = () => { const s = window.STORE || {}; return { name: s.name || "Honda Cars", tel: s.tel || "", hours: s.hours || "", reserveUrl: s.reserveUrl || "" }; };

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
  const picked = MEMO_ASKS.filter((q) => S.memoAsks[q.id]);
  const L = r.local.L, st = subsidyStatus();
  const today = new Date(); const ds = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const cross = cheaperText(r);
  const total = r.diff < 0 ? `${r.N}年で EV が 約${man(-r.diff)} 安い` : `${r.N}年で ${rv} が 約${man(r.diff)} 安い`;
  const ST = storeInfo();
  const row = (icon, k, v, sub, hot) => `<div class="rp-row${hot ? " hot" : ""}">${pic(icon, 28)}<span class="rp-k">${k}</span><span class="rp-v"><b class="num">${v}</b>${sub ? `<small>${sub}</small>` : ""}</span></div>`;
  return header("相談メモ", "cost", "相談メモ") + `<main class="main report" id="report" style="gap:16px">
    ${S.fromLink ? `<div class="info">共有されたリンクから開いています。数字は送られた条件で計算し直しています。</div>` : ""}
    <div class="rp-head"><div><span class="rp-shop">${esc(ST.name)}</span><h1>EV購入 相談メモ</h1><span class="rp-date">${ds} 作成・EV Life Simulator</span></div>${pic("clipboard", 56)}</div>

    <section class="memo-card rp">
      <h2><i>1</i>お客様の条件</h2>
      <div class="rp-car">${carPic(r.E, 64)}<div><span>検討中のEV</span><b>${esc(r.E.name)}</b><small>比べる車：${esc(gLabel(r.G))}</small></div></div>
      <div class="rp-tiles">
        <div class="big"><span>1年に走る距離</span><b class="num">${km.toLocaleString("ja-JP")}<small>km</small></b></div>
        <div><span>お住まい</span><b>${L ? esc(L.name) : "―"}</b></div>
        <div><span>自宅での充電</span><b>${homeEnvLabel()}</b></div>
        <div><span>乗る年数</span><b>${r.N}年</b></div>
        <div><span>ガソリン車の燃費</span><b>${r.G.fe}km/L</b></div>
        <div><span>ガソリン代</span><b>${n("pGas")}円/L</b></div>
        ${r.drive ? `<div class="wide"><span>EVの電費</span><b>今日の走りから 1kWhで${r.drive.kmPerKwh.toFixed(1)}km</b></div>` : ""}
      </div>
    </section>

    <section class="memo-card rp">
      <h2><i>2</i>シミュレーション結果</h2>
      <div class="rp-rows">
        ${row("plug", "ランニングコスト", dA >= 0 ? `年 約${man(dA)} 安い` : `年 約${man(-dA)} 高い`, `${rv} 年${man(r.gAnnual)} → EV 年${man(r.eAnnual)}`)}
        ${row("coin", "100円で走れる距離", `${r.k100g.toFixed(1)}km → ${r.k100a.toFixed(1)}km`, `${rv} → EV`)}
        ${row("tag", "補助金", r.subTotal > 0 ? `最大 ${man0(r.subTotal)}` : SUBSIDY.closed ? "国の補助金は受付終了" : "対象外", esc(memoSubText(r)))}
        ${row("yen", "トータル", total, `${rv}より安くなるのは ${cross}`, true)}
      </div>
      ${ext.area || ext.trip || ext.ls ? `<ul class="memo-ext">${[ext.area, ext.trip, ext.ls].filter(Boolean).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      ${r.N < SUBSIDY_HOLD_YEARS && r.subTotal > 0 ? `<div class="st-warn"><b>${r.N}年で手放す場合の注意</b>補助金を受けた車を${SUBSIDY_HOLD_YEARS}年より前に手放すと、補助金の一部を返す必要がある場合があります。</div>` : ""}
      <p class="hint" style="margin:0">価格・燃費・メンテ・保険は目安です。正式な金額は見積もりで確認してください。</p>
    </section>

    <section class="memo-card rp">
      <h2><i>3</i>聞きたいこと <span class="rp-count">${picked.length}件</span></h2>
      ${picked.length || S.memoNote ? `<ol class="rp-asks">${picked.map((q) => `<li>${q.label}</li>`).join("")}${S.memoNote ? `<li class="note">${esc(S.memoNote)}</li>` : ""}</ol>` : `<p class="hint" style="margin:0">下から選んでください</p>`}
      <div class="noprint" style="display:flex;flex-direction:column;gap:10px">
        <p class="sd" style="margin:0">タップで追加・取り消し（おすすめに印を付けています）</p>
        <div class="lsopts">${asks}</div>
        <label class="f">ほかに聞きたいこと<textarea data-q="memoNote" rows="3" placeholder="例：妻の通勤にも使えるか">${esc(S.memoNote)}</textarea></label>
      </div>
    </section>

    <section class="memo-card rp rp-store">
      <h2><i>4</i>相談するお店</h2>
      <div class="rs-row"><b>${esc(ST.name)}</b>${ST.tel ? `<a href="tel:${esc(ST.tel.replace(/[^0-9+]/g, ""))}">電話 ${esc(ST.tel)}</a>` : ""}${ST.hours ? `<span>${esc(ST.hours)}</span>` : ""}</div>
      ${ST.reserveUrl ? `<a class="btn noprint" href="${esc(ST.reserveUrl)}" target="_blank" rel="noopener">来店を予約する</a>` : ""}
      <p class="hint" style="margin:0">ご来店のときに、この相談メモをスタッフにお見せください。${ST.reserveUrl ? "" : ST.tel ? "来店のご予約はお電話で受け付けています。" : ""}</p>
    </section>

    <section class="memo-card noprint savecard">
      <h2>${pic("phone",28)} 相談メモを画像で保存</h2>
      <p class="hint" style="margin:0">この相談メモを1枚の画像にします。お店でスタッフに見せたり、家族に送ったりできます。</p>
      <button class="btn" data-act="memoImage">${pic("memo",24)}画像で保存する</button>
      <span class="toast" id="memoMsg" aria-live="polite"></span>
    </section>
  </main>` + footer(btn2("cost", "シミュレーション結果に戻る"));
};
screens.memo.update = () => {};

/* ---------- リンクで結果を渡す ---------- */
const S_DEFAULT = JSON.parse(JSON.stringify(S));
const SHARE_KEYS = ["rivalType", "gasKey", "evKey", "kmMode", "annualKm", "monthlySpend", "curFe",
  "gc_price", "gc_fe", "gc_tax", "gc_wt", "ec_price", "ec_sub", "ec_wh", "ec_kwh", "ec_tax", "ec_wt",
  "homeCharge", "homeEnv", "homeShare", "years", "evAdj", "gasAdj", "evFees", "gasFees",
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
  setHome(v) { const e = HOME_ENV.find((x) => x[0] === v); if (!e) return; S.homeEnv = v; S.homeCharge = e[3]; S.charger = e[4]; render(true); },
  setKm(v) { S.annualKm = +v; S.kmMode = "direct"; render(true); },
  memoAsk(id) { S.memoAsks = { ...S.memoAsks, [id]: !S.memoAsks[id] }; render(true); },
  subPer(v) { S.subPeriod = v === "dec" ? "dec" : "2027"; render(true); },
  subToMemo() { const r = calc(); memoInitAsks(r); S.memoAsks = { ...S.memoAsks, subsidy: true }; go("memo"); },
  async memoCopy() {
    const u = shareUrl();
    try { await navigator.clipboard.writeText(u); memoMsg("リンクをコピーしました"); }
    catch (e) { window.prompt("このリンクをコピーしてください", u); }
  },
  async memoShare() { try { await navigator.share({ title: "EVの試算と相談メモ", url: shareUrl() }); } catch (e) {} },
  memoPrint() { window.print(); },
  memoImage() { saveMemoImage(); },
  rentalGo() {
    if (RENTAL.url) { const u = RENTAL.url.replace("{car}", encodeURIComponent(S.evKey || "")); RENTAL.newTab ? window.open(u, "_blank", "noopener") : (location.href = u); }
    else go("rental");
  },
});

/* 入力が変わったらQRを作り直す（メモ欄） */
/* 聞きたいことのメモ欄は、入力のたびに一覧へ反映（再描画は入力が止まってから） */
app.addEventListener("input", (e) => { if (current === "memo" && e.target.dataset.q === "memoNote") { clearTimeout(window.__mn); window.__mn = setTimeout(() => { const el = document.querySelector('textarea[data-q="memoNote"]'); const pos = el && el.selectionStart; render(true); const t = document.querySelector('textarea[data-q="memoNote"]'); if (t) { t.focus(); try { t.setSelectionRange(pos, pos); } catch (er) {} } }, 700); } });

/* =========================================================
   相談メモを1枚の画像（PNG）にする
   画面をそのまま写すのではなく、同じ内容をキャンバスに描き直す（外部ライブラリなし）
   ========================================================= */
async function saveMemoImage() {
  const r = doneB() || S.fromLink ? calc() : null; if (!r) return;
  const msg = (t) => { const m = document.getElementById("memoMsg"); if (m) m.textContent = t; };
  msg("画像を作っています…");
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const keys = ["clipboard", r.E.pic || "car", "plug", "coin", "tag", "yen"];
    const imgs = {};
    await Promise.all(keys.map((k) => new Promise((res) => { const im = new Image(); im.onload = () => { imgs[k] = im; res(); }; im.onerror = res; im.src = (window.IMG || {})[k] || ""; if (!im.src) res(); })));
    const canvas = drawMemoCanvas(r, imgs);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    const d = new Date(), name = `相談メモ_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.png`;
    const file = new File([blob], name, { type: "image/png" });
    const touch = window.matchMedia && matchMedia("(pointer:coarse)").matches;
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "EV購入 相談メモ" }); msg("画像を保存・共有しました"); return; } catch (e) { if (e && e.name === "AbortError") { msg(""); return; } }
    }
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    msg("画像を保存しました");
  } catch (e) { msg("画像を作れませんでした。画面のスクリーンショットをお使いください"); }
}

function drawMemoCanvas(r, imgs) {
  const W = 1080, P = 48, CW = W - P * 2, F = '"Noto Sans JP","Hiragino Sans","Yu Gothic",Meiryo,sans-serif';
  const C = { bg: "#F2F5F9", card: "#FFFFFF", card2: "#F2F5FA", line: "#DFE3E8", ink: "#0F1726", sub: "#5B6370", red: "#1F6FEB", red1: "#0A2540", red2: "#123A66" };
  const cv = document.createElement("canvas"); cv.width = W; cv.height = 4200;
  const x = cv.getContext("2d"); x.textBaseline = "alphabetic";
  const font = (px, w = 400) => `${w} ${px}px ${F}`;
  const rr = (X, Y, w, h, rad, fill) => { x.beginPath(); x.moveTo(X + rad, Y); x.arcTo(X + w, Y, X + w, Y + h, rad); x.arcTo(X + w, Y + h, X, Y + h, rad); x.arcTo(X, Y + h, X, Y, rad); x.arcTo(X, Y, X + w, Y, rad); x.closePath(); x.fillStyle = fill; x.fill(); };
  const grad = (Y, h) => { const g = x.createLinearGradient(0, Y, W, Y + h); g.addColorStop(0, C.red1); g.addColorStop(1, C.red2); return g; };
  const wrap = (t, maxW, f) => { x.font = f; const out = []; let line = ""; for (const ch of String(t)) { if (x.measureText(line + ch).width > maxW && line && !"。、）」・".includes(ch)) { out.push(line); line = ch; } else line += ch; } if (line) out.push(line); return out; };
  const text = (t, X, Y, f, col, align = "left") => { x.font = f; x.fillStyle = col; x.textAlign = align; x.fillText(t, X, Y); x.textAlign = "left"; };
  const img = (k, X, Y, s) => { if (imgs[k]) x.drawImage(imgs[k], X, Y, s, s); };
  const section = (num, title, body) => { const h0 = body(false, y + 100); rr(P, y, CW, h0 + 124, 28, C.card);
    x.beginPath(); x.arc(P + 52, y + 54, 22, 0, Math.PI * 2); x.fillStyle = C.red2; x.fill(); text(String(num), P + 52, y + 64, font(26, 700), "#fff", "center");
    text(title, P + 90, y + 66, font(34, 700), C.ink); x.fillStyle = C.line; x.fillRect(P + 28, y + 92, CW - 56, 2);
    body(true, y + 116); y += h0 + 124 + 28; };

  const rv = rivalShort(), km = Math.round(r.km), dA = r.gAnnual - r.eAnnual, L = r.local.L;
  const d = new Date(), ds = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  const cross = cheaperText(r), ST = storeInfo();
  const picked = MEMO_ASKS.filter((q) => S.memoAsks[q.id]).map((q) => q.label);
  let y = P;

  x.fillStyle = C.bg; x.fillRect(0, 0, W, cv.height);
  // 見出し
  rr(P, y, CW, 210, 32, grad(y, 210));
  text(ST.name, P + 40, y + 62, font(28, 700), "rgba(255,255,255,.88)");
  text("EV購入 相談メモ", P + 40, y + 134, font(60, 700), "#fff");
  text(`${ds} 作成・EV Life Simulator`, P + 40, y + 182, font(26), "rgba(255,255,255,.85)");
  img("clipboard", W - P - 150, y + 45, 120);
  y += 210 + 28;

  // 1 お客様の条件
  section(1, "お客様の条件", (draw, Y) => {
    const ix = P + 28, iw = CW - 56; let h = 0;
    if (draw) { rr(ix, Y, iw, 160, 20, C.card2); img(r.E.pic || "car", ix + 22, Y + 25, 110);
      text("検討中のEV", ix + 158, Y + 46, font(24, 700), C.sub);
      text(r.E.name, ix + 158, Y + 100, font(46, 700), C.ink);
      text(`比べる車：${gLabel(r.G)}`, ix + 158, Y + 140, font(26), C.sub); }
    h += 160 + 16;
    if (draw) { rr(ix, Y + h, iw, 130, 20, C.card2); text("1年に走る距離", ix + 24, Y + h + 44, font(24, 700), C.sub);
      text(km.toLocaleString("ja-JP"), ix + 24, Y + h + 110, font(64, 700), C.red);
      x.font = font(64, 700); const kw = x.measureText(km.toLocaleString("ja-JP")).width; text("km", ix + 32 + kw, Y + h + 110, font(30, 700), C.sub); }
    h += 130 + 16;
    const tiles = [["お住まい", L ? L.name : "―"], ["自宅での充電", homeEnvLabel()], ["乗る年数", `${r.N}年`], ["ガソリン車の燃費", `${r.G.fe}km/L`], ["ガソリン代", `${n("pGas")}円/L`]];
    if (r.drive) tiles.push(["EVの電費（今日の走り）", `1kWhで${r.drive.kmPerKwh.toFixed(1)}km`]);
    const tw = (iw - 16) / 2;
    tiles.forEach(([k, v], i) => { const tx = ix + (i % 2) * (tw + 16), ty = Y + h + Math.floor(i / 2) * 126;
      if (draw) { rr(tx, ty, tw, 110, 18, C.card2); text(k, tx + 22, ty + 40, font(22, 700), C.sub); text(v, tx + 22, ty + 86, font(32, 700), C.ink); } });
    h += Math.ceil(tiles.length / 2) * 126 - 16;
    return h;
  });

  // 2 シミュレーション結果
  section(2, "シミュレーション結果", (draw, Y) => {
    const ix = P + 28, iw = CW - 56; let h = 0;
    const rows = [
      ["plug", "ランニングコスト", dA >= 0 ? `年 約${man(dA)} 安い` : `年 約${man(-dA)} 高い`, `${rv} 年${man(r.gAnnual)} → EV 年${man(r.eAnnual)}`],
      ["coin", "100円で走れる距離", `${r.k100g.toFixed(1)}km → ${r.k100a.toFixed(1)}km`, `${rv} → EV`],
      ["tag", "補助金", r.subTotal > 0 ? `最大 ${man0(r.subTotal)}` : (SUBSIDY.closed ? "国の補助金は受付終了" : "対象外"), memoSubText(r)],
    ];
    rows.forEach(([k, label, v, sub]) => { const lines = wrap(sub, iw - 110, font(22));
      const rh = 120 + lines.length * 30;
      if (draw) { img(k, ix, Y + h + 22, 64); text(label, ix + 90, Y + h + 40, font(24, 700), C.sub); text(v, ix + 90, Y + h + 92, font(42, 700), C.red);
        lines.forEach((l, i) => text(l, ix + 90, Y + h + 128 + i * 30, font(22), C.sub)); x.fillStyle = C.line; x.fillRect(ix, Y + h + rh - 2, iw, 2); }
      h += rh; });
    h += 16;
    const total = r.diff < 0 ? `${r.N}年で EV が 約${man(-r.diff)} 安い` : `${r.N}年で ${rv} が 約${man(r.diff)} 安い`;
    const tl = wrap(total, iw - 140, font(40, 700));
    const th = 100 + tl.length * 52;
    if (draw) { rr(ix, Y + h, iw, th, 22, grad(Y + h, th)); img("yen", ix + 22, Y + h + 30, 64);
      text("トータル", ix + 110, Y + h + 44, font(24, 700), "rgba(255,255,255,.88)");
      tl.forEach((l, i) => text(l, ix + 110, Y + h + 96 + i * 52, font(40, 700), "#fff"));
      text(`${rv}より安くなるのは ${cross}`, ix + 110, Y + h + th - 22, font(24), "rgba(255,255,255,.88)"); }
    h += th;
    return h;
  });

  // 3 聞きたいこと
  section(3, `聞きたいこと（${picked.length + (S.memoNote ? 1 : 0)}件）`, (draw, Y) => {
    const ix = P + 28, iw = CW - 56; let h = 0;
    const items = picked.map((t, i) => [`${i + 1}.`, t, font(32, 700), C.ink]);
    if (S.memoNote) items.push([`${picked.length + 1}.`, S.memoNote, font(30), C.ink]);
    if (!items.length) { if (draw) text("（選ばれていません）", ix, Y + 36, font(28), C.sub); return 50; }
    items.forEach(([no, t, f, col]) => { const lines = wrap(t, iw - 60, f);
      if (draw) { text(no, ix, Y + h + 38, font(32, 700), C.red); lines.forEach((l, i) => text(l, ix + 52, Y + h + 38 + i * 44, f, col)); }
      h += lines.length * 44 + 14; });
    return h;
  });

  // 相談するお店
  section(4, "相談するお店", (draw, Y) => {
    const ix = P + 28; let h = 0;
    if (draw) text(ST.name, ix, Y + 40, font(36, 700), C.ink);
    h += 56;
    [ST.tel ? `電話 ${ST.tel}` : "", ST.hours, ST.reserveUrl ? `来店予約 ${ST.reserveUrl}` : ""].filter(Boolean).forEach((t) => {
      wrap(t, CW - 56, font(26)).forEach((l) => { if (draw) text(l, ix, Y + h + 30, font(26), C.sub); h += 38; }); });
    return h + 12;
  });

  // 注意書き
  wrap(`価格・燃費・メンテ・保険は目安です。正式な金額は見積もりで確認してください。補助金は予算に達すると受付が終わります。${r.N < SUBSIDY_HOLD_YEARS && r.subTotal > 0 ? `補助金を受けた車を${SUBSIDY_HOLD_YEARS}年より前に手放すと、一部を返す必要がある場合があります。` : ""}`, CW, font(22)).forEach((l) => { text(l, P, y + 10, font(22), C.sub); y += 32; });
  y += P - 10;

  const out = document.createElement("canvas"); out.width = W; out.height = Math.ceil(y);
  out.getContext("2d").drawImage(cv, 0, 0);
  return out;
}
