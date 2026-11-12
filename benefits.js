/* =========================================================
   値段だけじゃない、EVとガソリン車の違い（結果画面のカルーセル）
   ■ 正しいと確かめた情報だけを書く。数字を書いたら sources に出典、checked に確かめた日を入れる
   ■ 一般的な性質（エンジンがない など）で数字がないカードは sources を空にしてよい
   theme  : BENEFIT_THEMES の id
   img    : img/benefits/ のイラスト（文字は画像に入れず、ここに書く）
   alt    : イラストの説明（画面を読み上げる人のため）
   title  : 見出し / body : 説明（1〜2文） / note : 添える一言（小さい文字。なければ ""）
   rental : true なら「レンタルで確かめる」ボタンを付ける（cars.js の RENTAL.url）
   ========================================================= */
window.BENEFIT_THEMES = [
  { id: "easy", label: "手間・めんどうが減る" },
  { id: "feature", label: "EVの特徴" },
  { id: "use", label: "意外な使い方" },
];

const SRC_N_ONE_E = "https://global.honda/jp/news/2025/4250911-n-one-e.html";       // N-ONE e: 発表（Honda）
const SRC_SAPA_TOCHIGI = "https://www.driveplaza.com/sapa/shisetsu_service/car_charge/"; // SA・PAの充電器（NEXCO東日本 ドラぷら）
const SRC_SAPA_ALL = "https://www.e-mobipower.co.jp/news/6614/";                       // 全国454か所・1,066口（e-Mobility Power、2026-04-30発表）

window.BENEFITS = [
  /* テーマ1 手間・めんどうが減る */
  { id: "1-1", theme: "easy", img: "img/benefits/1-1.svg", alt: "家で充電しているEVのイラスト",
    title: "ガソリンスタンドに行かない", body: "家で寝ている間に充電。朝には満タン。",
    note: "家で充電できる場合。N-ONE e: は6kWの普通充電で約4.5時間",
    sources: [SRC_N_ONE_E], checked: "2026-11-11" },   // 6kW以上・残量警告灯の点灯から満充電まで
  { id: "1-2", theme: "easy", img: "img/benefits/1-2.svg", alt: "整備を受けるEVのイラスト",
    title: "メンテナンスが少ない", body: "エンジンオイルの交換がない。減速のときに発電するので、ブレーキもすり減りにくい。",
    note: "タイヤなどの点検は必要",
    sources: [], checked: "2026-11-11" },
  { id: "1-3", theme: "easy", img: "img/benefits/1-3.svg", alt: "出発前に車内の温度を整えるイラスト",
    title: "乗る前に車内を快適に", body: "出発の時刻に合わせて、車内の温度を整えておける。",
    note: "N-ONE e: の「お出かけ前タイマー設定」。車種で機能が違う",
    sources: [SRC_N_ONE_E], checked: "2026-11-11" },

  /* テーマ2 EVの特徴 */
  { id: "2-1", theme: "feature", img: "img/benefits/2-1.svg", alt: "静かな車内で会話するイラスト",
    title: "静か", body: "エンジンの音や振動がない。会話や音楽が聞きやすい。",
    note: "レンタルで確かめられる", rental: true,
    sources: [], checked: "2026-11-11" },
  { id: "2-2", theme: "feature", img: "img/benefits/2-2.svg", alt: "坂道をなめらかに上るEVのイラスト",
    title: "なめらかな加速", body: "踏んだ瞬間から力が出る。坂道や合流が楽。",
    note: "N-ONE e: はアクセルだけで加速・減速・停止ができる（シングルペダル）", rental: true,
    sources: [SRC_N_ONE_E], checked: "2026-11-11" },
  { id: "2-3", theme: "feature", img: "img/benefits/2-3.svg", alt: "排気ガスの出ないEVと子どものイラスト",
    title: "排気ガスが出ない", body: "車庫や子どもの近くでも、排気ガスやにおいを気にしなくていい。",
    note: "",
    sources: [], checked: "2026-11-11" },
  { id: "2-4", theme: "feature", img: "img/benefits/2-4.svg", alt: "高速道路のサービスエリアで充電するイラスト",
    title: "高速道路・遠出も大丈夫", body: "東北道の佐野SA・都賀西方PA・上河内SA・那須高原SA、北関東道の壬生PAで充電できる。30分の休憩で約80%まで。",
    note: "全国のSA・PA 454か所に急速充電器1,066口（2026年3月末）。混んでいると待つこともある",
    sources: [SRC_SAPA_TOCHIGI, SRC_SAPA_ALL, SRC_N_ONE_E], checked: "2026-11-11" },   // 約80%：N-ONE e:、50kW以上・残量警告灯の点灯から

  /* テーマ3 意外な使い方 */
  { id: "3-1", theme: "use", img: "img/benefits/3-1.svg", alt: "停電の夜にEVから家電に電気を送るイラスト",
    title: "停電のときの電気になる", body: "車の電池から家電に電気を送れる。",
    note: "N-ONE e: は外部給電器（別売）で最大1,500W",
    sources: [SRC_N_ONE_E], checked: "2026-11-11" },
  { id: "3-2", theme: "use", img: "img/benefits/3-2.svg", alt: "キャンプ場でEVの電気を使うイラスト",
    title: "キャンプ・アウトドアで電気", body: "ホットプレートや電気ケトルを外で使える。",
    note: "1,500Wまで。使った分だけ走れる距離が減る",
    sources: [SRC_N_ONE_E], checked: "2026-11-11" },
  { id: "3-3", theme: "use", img: "img/benefits/3-3.svg", alt: "車の中で休むイラスト",
    title: "車の中で過ごす", body: "エンジンをかけずにエアコンが使える。待ち時間や仮眠に。",
    note: "電池の使いすぎに注意",
    sources: [], checked: "2026-11-11" },
  { id: "3-4", theme: "use", img: "img/benefits/3-4.svg", alt: "家の太陽光パネルとEVのイラスト",
    title: "太陽光とつなぐ", body: "家の太陽光でつくった電気を車にためて使う。",
    note: "太陽光がある家の場合",
    sources: [], checked: "2026-11-11" },
];
