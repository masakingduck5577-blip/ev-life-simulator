/* =========================================================
   ライフスタイル（A）
   画面：lifestyle（場面の質問）→ effect（あなたのEVライフ）→ lscard（カードの詳細）
   質問の選択肢とカードは scenes.js、数字の計算はコスト比較と同じ設定を使う
   ========================================================= */

const TAGS = () => window.SCENE_TAGS || [];
const CARDS = () => window.SCENE_CARDS || [];
const PEOPLE = () => window.SCENE_PEOPLE || [];
const TOP_N = 5;

S.ls = { touched: false, home: S.homeCharge ? "house" : "apt", sel: {}, ppl: "3", seen: false, cardId: null, auto: [], carView: null };

const LS_ICONS = {
  ac: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M2 2l20 20"/>',
  power: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M12.5 11l-2.5 4h4l-2.5 4"/>',
  quiet: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 10v4"/><path d="M10 10v4"/><path d="M14 10v4"/>',
  tent: '<path d="M3 20L12 4l9 16z"/><path d="M12 4v16"/><path d="M9 20l3-6 3 6"/>',
  road: '<path d="M6 21L9 3"/><path d="M18 21L15 3"/><path d="M12 5v2"/><path d="M12 11v2"/><path d="M12 17v2"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7"/><path d="M4.5 16l5.8-3"/><path d="M19.5 16l-5.8-3"/>',
  leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19l8-8"/>',
  paw: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5-2 3-4 3-4 0-4-3z"/>',
  yen: '<path d="M6 4l6 8 6-8"/><path d="M12 12v8"/><path d="M8 13h8"/><path d="M8 17h8"/>',
};
const LS_PIC = { ac: "snow", fuel: "fuel", power: "flashlight", quiet: "sleep", battery: "battery", tent: "camp", road: "road", wheel: "dash", leaf: "seedling", paw: "dog", yen: "yen" };
const TAG_PIC = { pickup: "school", commute: "office", shopping: "shop", wait: "hourglass", outdoor: "camp", longtrip: "road", pet: "dog", fuel: "fuel", smell: "fuel", quiet: "shh", disaster: "storm", fun: "dash", eco: "seedling" };
const lsIcon = (k, big) => (window.IMG && IMG[LS_PIC[k]]) ? pic(LS_PIC[k], big ? 64 : 36) : lsIconSvg(k);
const lsIconSvg = (k) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LS_ICONS[k] || LS_ICONS.battery}</svg>`;

/* ---------- 場面の自動選択（マップに登録した場所から） ---------- */
function lsAutoSelect() {
  if (S.ls.touched) return;
  const map = window.SCENE_FROM_MAP || {};
  const auto = new Set();
  (S.places || []).forEach((p) => { if (map[p.cat]) auto.add(map[p.cat]); });
  if (S.work && map.work) auto.add(map.work);
  const sel = { ...S.ls.sel };
  auto.forEach((t) => { sel[t] = true; });
  S.ls.sel = sel;
  S.ls.auto = [...auto];
}

/* ---------- カードの点数と並び順 ---------- */
function lsScore(card) {
  const req = card.requires || {};
  if (req.homeCharge === true && !S.homeCharge) return null;
  if (req.homeCharge === false && S.homeCharge) return null;
  const byId = Object.fromEntries(TAGS().map((t) => [t.id, t]));
  const pplTag = (PEOPLE().find((p) => p.id === S.ls.ppl) || {}).tag;
  let score = 0; const reasons = [];
  (card.tags || []).forEach((t) => {
    if (t === pplTag) { score += 1; return; }
    if (!S.ls.sel[t] || !byId[t]) return;
    score += byId[t].group === "scene" ? 2 : 1;
    reasons.push(byId[t].label);
  });
  return { score, reasons };
}
function lsRanked() {
  return CARDS()
    .map((c, i) => ({ c, i, r: lsScore(c) }))
    .filter((x) => x.r && x.r.reasons.length > 0)
    .sort((a, b) => b.r.score - a.r.score || a.i - b.i)
    .map((x) => ({ ...x.c, score: x.r.score, reasons: x.r.reasons }));
}

/* ---------- 数字の裏付け ---------- */
function lsMetric(card) {
  const m = card.metric; if (!m) return null;
  const car = carForMap();
  const price = S.homeCharge ? n("pHome") : n("pPub");
  const whReal = car.whPerKm / (n("rEv") || 1);
  const fmtK = (k) => String(parseFloat(k < 1 ? k.toFixed(2) : k.toFixed(1)));
  if (m.type === "power") {
    const kwh = (m.watts * m.minutes) / 60 / 1000;
    const km = kwh / (whReal / 1000);
    const pct = (kwh / car.kwh) * 100;
    return { label: m.label || "", value: `約${fmtK(kwh)}kWh・約${Math.max(1, Math.round(kwh * price))}円`,
      sub: `航続 約${km.toFixed(1)}km分・電池の約${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%（${S.homeCharge ? "自宅" : "外"}の電気代 ${price}円/kWhで計算）` };
  }
  if (m.type === "refuel") {
    const G = gasCar() || GASES["n-one"];
    const km = annualKm();
    const fills = km / (G.fe * (n("rGas") || 0.85)) / (m.litersPerFill || 30);
    const hours = (fills * (m.minutesPerFill || 10)) / 60;
    return { label: "ガソリンスタンドに行く回数", value: `年 約${Math.round(fills)}回 → 0回`,
      sub: `1回${m.minutesPerFill || 10}分なら、年 約${hours.toFixed(1).replace(/\.0$/, "")}時間（年${Math.round(km).toLocaleString("ja-JP")}km・${G.name}${gasCar() ? "" : "で仮に"}計算）` };
  }
  if (m.type === "backup") {
    const usableKwh = car.kwh * (1 - (m.keepPct ?? 20) / 100);
    const days = usableKwh / (m.dailyKwh || 2.5);
    return { label: "冷蔵庫・照明・スマホの充電なら", value: `約${Math.floor(days)}日分`,
      sub: `1日${m.dailyKwh || 2.5}kWh使う想定で、移動用に残量${m.keepPct ?? 20}%を残した場合（${car.name}・${car.kwh}kWh）` };
  }
  if (m.type === "commute") {
    const range = (car.kwh * (n("usable") / 100) * 1000) / whReal;
    const rangeWin = range * (n("cWin") || 1);
    const t = S.area?.status === "done" ? S.area.data.targets.find((x) => x.kind === "work") : null;
    if (t) {
      return { label: "1回の充電で", value: `通勤 約${Math.floor(range / t.rtKm)}日分`,
        sub: `冬は約${Math.floor(rangeWin / t.rtKm)}日分（往復${t.rtKm.toFixed(1)}km・生活圏マップから）` };
    }
    return { label: "1回の充電で走れる距離", value: `約${Math.round(range)}km`,
      sub: `冬は約${Math.round(rangeWin)}km。生活圏に職場を登録すると、通勤何日分かを表示します` };
  }
  if (m.type === "text") return { label: m.label || "", value: m.value || "", sub: "" };
  return null;
}

const lsCtaTarget = (to) => ({
  rental: "rental", trip: "trip",
  cost: S.gasKey && S.evKey ? "cost" : "gas",
  area: S.home ? "areamap" : "area",
}[to] || "home");

/* ---------- 操作 ---------- */
Object.assign(ACT, {
  lsHome(id) { S.ls.home = id; S.homeCharge = id !== "apt"; render(true); },
  lsTag(id) { S.ls.touched = true; S.ls.sel = { ...S.ls.sel, [id]: !S.ls.sel[id] }; render(true); },
  lsPpl(id) { S.ls.ppl = id; render(true); },
  lsOpen(id) { S.ls.cardId = id; S.ls.carView = null; go("lscard"); },
  lsCar(k) { S.ls.carView = k; render(true); },
  lsCta(to) { go(lsCtaTarget(to)); },
});

/* =========================================================
   画面：場面の質問
   ========================================================= */
screens.lifestyle = () => {
  lsAutoSelect();
  // 車両選択画面のチェックと食い違ったら合わせる
  if (!S.homeCharge && S.ls.home !== "apt") S.ls.home = "apt";
  if (S.homeCharge && S.ls.home === "apt") S.ls.home = "house";
  const homes = [
    ["house", "戸建て・充電器を設置できる", "毎晩の充電で、朝は満充電"],
    ["apt", "集合住宅・設置できない", "外で充電する前提で提案します"],
    ["unknown", "まだわからない", "設置できる前提で、ひとまず提案します"],
  ].map(([id, l, s]) => `<button type="button" class="lsopt" aria-pressed="${S.ls.home === id}" data-act="lsHome:${id}">
      <span class="dot" aria-hidden="true"></span><span class="tx"><b>${l}</b><span>${s}</span></span></button>`).join("");
  const chips = (group) => TAGS().filter((t) => t.group === group).map((t) => `<button type="button" class="chip lschip" aria-pressed="${!!S.ls.sel[t.id]}" data-act="lsTag:${t.id}">${pic(TAG_PIC[t.id] || "sparkles", 24)}${esc(t.label)}</button>`).join("");
  const autoLabels = S.ls.auto.map((id) => (TAGS().find((t) => t.id === id) || {}).label).filter(Boolean);
  const ppl = PEOPLE().map((p) => `<label><input type="radio" name="lsppl" data-chg="lsPpl:${p.id}"${S.ls.ppl === p.id ? " checked" : ""}>${p.label}</label>`).join("");
  const nScene = TAGS().filter((t) => t.group === "scene" && S.ls.sel[t.id]).length;
  const nCon = TAGS().filter((t) => t.group === "concern" && S.ls.sel[t.id]).length;
  return header("ライフスタイル", "home", "入力 A") + `<main class="main">
    <div class="hero"><div class="herorow" aria-hidden="true">${pic("camp",56)}${pic("school",48)}${pic("flashlight",48)}</div><h1 style="font-size:22px">あなたの毎日に、<br>EVはどう役立つ？</h1></div>
    <section class="sec"><h2>自宅で充電できますか</h2><p class="sd">コスト比較とマップにも使います</p><div class="lsopts" role="group" aria-label="自宅で充電できるか">${homes}</div></section>
    <section class="sec"><h2>よくある場面</h2><p class="sd">いくつでも選べます</p><div class="chips">${chips("scene")}</div>
      ${autoLabels.length ? `<p class="info" style="display:flex;gap:8px;align-items:flex-start"><span aria-hidden="true" style="color:var(--ev)">●</span>「${autoLabels.join("」「")}」は、生活圏に登録した場所から選んでいます</p>` : ""}</section>
    <section class="sec"><h2>気になること・重視したいこと</h2><p class="sd">いくつでも選べます</p><div class="chips">${chips("concern")}</div></section>
    <section class="sec"><h2>いつも乗る人数</h2><div class="seg" style="grid-template-columns:repeat(${PEOPLE().length},minmax(0,1fr))" role="radiogroup" aria-label="いつも乗る人数">${ppl}</div></section>
  </main>` + footer(btn("effect", "あなたのEVライフを見る"), `<p class="hint" style="text-align:center;margin:0">選んだ数：場面 ${nScene}・気になること ${nCon}</p>`);
};

/* =========================================================
   画面：あなたのEVライフ
   ========================================================= */
function lsCardHtml(c, strong) {
  const m = lsMetric(c);
  const needsGear = c.carNotes ? `<span class="lswarn"><span class="flag">要確認</span>車種によって必要な機器があります</span>` : "";
  const metric = m ? `<span class="lsmetric${m.value ? "" : " soft"}"><span>${esc(m.label)}</span>${m.value ? `<b class="num">${esc(m.value)}</b>` : ""}</span>` : "";
  return `<button type="button" class="lscard${strong ? " top" : ""}" data-act="lsOpen:${esc(c.id)}">
    <span class="lshead"><span class="lsic">${lsIcon(c.icon)}</span><span class="lst"><span class="why">${esc(c.reasons.join("・"))} に合う</span><b>${esc(c.title)}</b></span></span>
    <span class="lsbody">${esc(c.body)}</span>${metric}${needsGear}${c.draft ? '<span class="hint">内容は仮です</span>' : ""}</button>`;
}
screens.effect = () => {
  const list = lsRanked();
  S.ls.seen = true;
  if (!list.length) {
    return header("あなたのEVライフ", "lifestyle", "結果 A") + `<main class="main"><p class="info">当てはまる場面や、気になることを選んでください。合う使い方を提案します。</p></main>` + footer(btn("lifestyle", "場面を選ぶ"));
  }
  const top = list.slice(0, TOP_N), rest = list.slice(TOP_N);
  const selLabels = TAGS().filter((t) => S.ls.sel[t.id]).map((t) => `<span class="bdg mute" style="background:var(--bg)">${esc(t.label)}</span>`).join("");
  return header("あなたのEVライフ", "lifestyle", "結果 A") + `<main class="main" style="gap:16px">
    <div class="sec"><h1 style="font-size:21px">あなたに合うEVの使い方を<br>${top.length}つ見つけました</h1>
      <div class="badges" style="align-items:center;font-size:12px">${selLabels}<button class="lk" data-go="lifestyle" style="margin-left:0">選び直す</button></div></div>
    ${top.map((c, i) => lsCardHtml(c, i === 0)).join("")}
    ${rest.length ? `<details><summary>ほかの使い方（${rest.length}）</summary><div class="body">${rest.map((c) => `<button type="button" class="lk" style="margin:0;justify-content:flex-start" data-act="lsOpen:${esc(c.id)}">${esc(c.title)}</button>`).join("")}</div></details>` : ""}
    <p class="hint">数字は、コスト比較の電費・電気代の設定で計算した目安です。試算のEV：${esc(carForMap().name)}${carForMap().isDefault ? "（未選択のため仮）" : ""}</p>
  </main>` + footer(btn("total", "トータル結果へ"), btn2("rental", "EVレンタカーで体験する"));
};

/* =========================================================
   画面：カードの詳細
   ========================================================= */
screens.lscard = () => {
  const list = lsRanked();
  let i = list.findIndex((c) => c.id === S.ls.cardId);
  const c = i >= 0 ? list[i] : CARDS().find((x) => x.id === S.ls.cardId);
  if (!c) return header("提案カード", "effect", "") + `<main class="main"><p class="info">カードが見つかりませんでした。</p></main>` + footer(btn("effect", "一覧に戻る"));
  const m = lsMetric(c);
  const reasons = (c.reasons || []).map((r) => `<span class="bdg ok">${esc(r)}</span>`).join("");
  let cars = "";
  if (c.carNotes) {
    const keys = Object.keys(EVS).filter((k) => !EVS[k].custom);
    const cur = S.ls.carView || (keys.includes(S.evKey) ? S.evKey : keys[0]);
    cars = `<section class="sec"><h2>車種ごとに必要なもの</h2>
      <div class="chips">${keys.map((k) => `<button type="button" class="chip" aria-pressed="${k === cur}" data-act="lsCar:${k}" style="min-height:40px;font-size:13px">${esc(EVS[k].name)}</button>`).join("")}</div>
      <p class="warnbox" style="margin:0">${esc(c.carNotes[cur] || c.carNotes.default || "")}</p></section>`;
  }
  const prev = i > 0 ? list[i - 1] : null, next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  return header("提案カード", "effect", i >= 0 ? `${i + 1} / ${list.length}` : "") + `<main class="main">
    ${c.image ? `<img src="${esc(c.image)}" alt="" style="width:100%;height:180px;object-fit:cover;border-radius:14px">` : `<div class="lsic big">${lsIcon(c.icon, true)}</div>`}
    <div class="sec">${reasons ? `<div class="badges" style="font-size:12px">${reasons}</div>` : ""}
      <h1 style="font-size:22px">${esc(c.title)}</h1>
      <p style="margin:0;font-size:14px;line-height:1.8">${esc(c.detail || c.body)}</p></div>
    ${m && m.value ? `<section class="sec"><h2>数字で見ると</h2><div class="lsstat"><span>${esc(m.label)}</span><b class="num">${esc(m.value)}</b>${m.sub ? `<small>${esc(m.sub)}</small>` : ""}</div></section>` : ""}
    ${cars}
    ${c.note ? `<div class="info"><b>知っておきたいこと</b><br>${esc(c.note)}</div>` : ""}
    ${c.draft ? '<p class="hint">このカードの内容は仮です。チームで確認中です。</p>' : ""}
  </main>` + footer(
    c.cta ? `<button class="btn" data-act="lsCta:${c.cta.to}">${esc(c.cta.label || "次へ")}</button>` : "",
    `<div class="row2"><button class="btn2" ${prev ? `data-act="lsOpen:${esc(prev.id)}"` : "disabled style=\"opacity:.4\""}>前のカード</button><button class="btn2" ${next ? `data-act="lsOpen:${esc(next.id)}"` : "disabled style=\"opacity:.4\""}>次のカード</button></div>`
  );
};

/* =========================================================
   トータル表示のタイル A
   ========================================================= */
function tileA() {
  const list = S.ls.seen ? lsRanked() : [];
  if (!list.length) return `<div class="tile"><div class="h">${pic("camp",32)}<span class="ht">暮らしの変化</span></div><div class="big">まだ選ばれていません</div><div class="links"><button class="lk" data-go="lifestyle">場面を選ぶ</button></div></div>`;
  const c = list[0];
  return `<div class="tile"><div class="h">${pic("camp",32)}<span class="ht">暮らしの変化</span></div>
    <div class="s">あなたにいちばん合う使い方</div>
    <div style="display:flex;gap:12px;align-items:flex-start"><span class="lsic">${lsIcon(c.icon)}</span><span style="display:flex;flex-direction:column;gap:2px"><span class="big">${esc(c.title)}</span><span class="s">${esc(c.reasons.join("・"))} に合う</span></span></div>
    ${list.length > 1 ? `<div class="s">ほかに「${esc(list[1].title)}」など${list.length - 1}つの使い方</div>` : ""}
    <div class="links"><button class="lk" data-go="effect">提案をすべて見る</button><button class="lk" data-go="lifestyle">場面を選び直す</button></div></div>`;
}

/* ---------- 起動 ---------- */
render(false);
