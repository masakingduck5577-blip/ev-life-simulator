/* =========================================================
   車両データ（カタログスペック）
   ok:false の値は仮置き。公式情報・ディーラーヒアリングで更新する
   qkw : 急速充電で車が受け入れられる最大出力（kW）※仮置き・要確認
   acKw: 普通充電で受け入れられる最大出力（kW）※仮置き・要確認
   ========================================================= */
const EVS = {
  "n-one-e":  {pic:"car", name:"N-ONE e:（e:G）", cat:"軽乗用EV", price:2699400, sub:580000, wh:105, kwh:29.6, tax:10800, wt:0, qkw:50, acKw:6, ok:true},
  "super-one":{pic:"car", name:"Super-ONE", cat:"小型EV", price:3390200, sub:1300000, wh:113, kwh:29.6, tax:25000, wt:0, qkw:50, acKw:6, ok:false},
  "insight":  {pic:"suv", name:"INSIGHT", cat:"クロスオーバーSUV EV", price:5500000, sub:1300000, wh:134, kwh:68.8, tax:25000, wt:0, qkw:150, acKw:6, ok:true},
  "n-van-e":  {pic:"van", name:"N-VAN e:", cat:"軽商用EV", price:2600000, sub:580000, wh:126, kwh:29.6, tax:5000, wt:0, qkw:50, acKw:6, ok:false},
  "custom":   {name:"その他のEV", cat:"スペックを入力", custom:true}
};
/* pic：画面に出すイラスト（images.js の名前）。写真を使うときは photo:"ファイル名" を足す
   比べる相手の車。type は "gas"（ガソリン車）/ "hv"（ハイブリッド車）。価格・燃費は仮の値 */
const GASES = {
  "n-one": {pic:"car", name:"N-ONE", cat:"軽乗用", type:"gas", price:1800000, fe:23, tax:10800, wt:3300},
  "n-box": {pic:"car", name:"N-BOX", cat:"軽乗用", type:"gas", price:1800000, fe:21, tax:10800, wt:3300},
  "n-van": {pic:"van", name:"N-VAN", cat:"軽商用", type:"gas", price:1500000, fe:18, tax:5000, wt:3300},
  "fit":   {pic:"car", name:"フィット e:HEV", cat:"コンパクト", type:"hv", price:2300000, fe:27, tax:30500, wt:7500},
  "zrv":   {pic:"suv", name:"ZR-V e:HEV", cat:"SUV", type:"hv", price:3600000, fe:22, tax:36000, wt:12300},
  "custom":{name:"その他の車", cat:"スペックを入力", custom:true}
};
const RIVAL_LABEL = {gas:"ガソリン車", hv:"ハイブリッド車（HV）"};
const RIVAL_SHORT = {gas:"ガソリン車", hv:"HV"};
const DEP = { gas:{hi:0.12, mid:0.15, lo:0.18}, ev:{hi:0.15, mid:0.19, lo:0.23} }; // 年率の価値減少（仮）
const SCEN_LABEL = {hi:"高め", mid:"中間", lo:"低め"};
const SUBSIDY_HOLD_YEARS = 4;

/* =========================================================
   国のCEV補助金（次世代自動車振興センター）
   センターのお知らせが更新されたら、ここを書き換える
   ・受付終了の見込み … https://www.cev-pc.or.jp/hojo/cev.html の「申請受付終了見込み時期についてのお知らせ」
   ・車種ごとの金額   … 同じページの「銘柄ごとの補助金交付額」（上の EVS の sub に入れる）
   ========================================================= */
const SUBSIDY = {
  name: "国のCEV補助金（令和7年度補正）",
  amountAsOf: "2026-10-13",            // 車種ごとの金額を確かめた日（センターの表の日付）
  endText: "2026年12月上旬〜下旬",       // 受付終了の見込み（センターの発表どおりに書く）
  endFrom: "2026-12-01",               // 見込みの早いほう（残り日数はここまでで数える）
  endTo: "2026-12-31",                 // 見込みの遅いほう（これを過ぎたら「終了した可能性」と表示）
  noticeDate: "2026-09-04",            // 見込みが発表された日
  applyRule: "新車登録（届出）から1か月以内に申請",
  url: "https://www.cev-pc.or.jp/hojo/cev.html",
};
const jpDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${y}年${m}月${d}日`; };
const subsidyNote = () => SUBSIDY.closed
  ? `${SUBSIDY.name}は受付を終了しています（自動確認：${jpDate(SUBSIDY.checkedAt || SUBSIDY.amountAsOf)}）。自治体の補助は別途確認。`
  : `${SUBSIDY.name}。車種ごとの金額は${jpDate(SUBSIDY.amountAsOf)}時点${SUBSIDY.checkedAt ? `（${jpDate(SUBSIDY.checkedAt)}に自動確認）` : ""}。予算がなくなりしだい受付終了。自治体の補助は別途確認。`;
const subOf = (d) => SUBSIDY.closed ? 0 : (d.sub || 0);

/* 受付終了までの状況。today を渡すとその日で判定（テスト用） */
function subsidyStatus(today) {
  const t = today ? new Date(today + "T00:00:00") : new Date(); t.setHours(0, 0, 0, 0);
  const from = new Date(SUBSIDY.endFrom + "T00:00:00"), to = new Date(SUBSIDY.endTo + "T00:00:00");
  const days = Math.round((from - t) / 864e5);
  if (SUBSIDY.closed) return { state: "closed", days, text: "国の補助金の受付は終了しました。この試算では補助金を0円として計算しています。" };
  if (t > to) return { state: "over", days, text: `受付終了の見込み（${SUBSIDY.endText}）を過ぎています。終了した可能性があるので、最新の情報を確認してください。` };
  if (days <= 0) return { state: "now", days, text: `受付終了の見込み時期（${SUBSIDY.endText}）に入っています。予算がなくなりしだい終了します。` };
  return { state: days <= 30 ? "near" : "open", days, text: `受付終了の見込みは${SUBSIDY.endText}。早ければあと約${days}日です。` };
}
