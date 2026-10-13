/* =========================================================
   ライフスタイル（A）の質問と提案カード（チームで編集する）
   ---------------------------------------------------------
   ■ 質問の選択肢を増やす … SCENE_TAGS に1行足す（質問画面に自動で出る）
   ■ カードを増やす       … SCENE_CARDS に1件足す（合う場面のタグを書くだけ）

   カードの点数 = 選ばれた「場面」のタグ1つにつき2点 ＋ 「気になること」1つにつき1点
               ＋ 乗る人数のタグ1点。点数の高い順に上位5枚を表示し、残りは折りたたむ。
               合うタグが1つもないカードは表示しない。
   ========================================================= */

/* ---------- 質問の選択肢（タグ） ----------
   group : "scene"（よくある場面・2点） / "concern"（気になること・1点）
   id    : カードの tags に書く名前（英数字）
*/
window.SCENE_TAGS = [
  { id: "pickup",   group: "scene",   label: "子どもの送り迎え" },
  { id: "commute",  group: "scene",   label: "通勤・通学" },
  { id: "shopping", group: "scene",   label: "近所の買い物" },
  { id: "wait",     group: "scene",   label: "車の中で待つことが多い" },
  { id: "outdoor",  group: "scene",   label: "アウトドア・キャンプ" },
  { id: "longtrip", group: "scene",   label: "帰省・長距離の旅行" },
  { id: "pet",      group: "scene",   label: "ペットを乗せる" },
  { id: "fuel",     group: "concern", label: "燃料代" },
  { id: "smell",    group: "concern", label: "給油の手間・匂い" },
  { id: "quiet",    group: "concern", label: "静かさ・乗り心地" },
  { id: "disaster", group: "concern", label: "災害への備え" },
  { id: "fun",      group: "concern", label: "運転の楽しさ" },
  { id: "eco",      group: "concern", label: "環境への配慮" },
];

/* 乗る人数の選択肢。tag はカードの tags で使える（1点） */
window.SCENE_PEOPLE = [
  { id: "1", label: "1人",     tag: "solo" },
  { id: "2", label: "2人",     tag: "couple" },
  { id: "3", label: "3〜4人",  tag: "family" },
  { id: "5", label: "5人以上", tag: "family" },
];

/* マップ（生活圏）に登録した場所の種類から、場面を自動で選ぶ対応表 */
window.SCENE_FROM_MAP = {
  "送迎・習い事": "pickup",
  "レジャー": "outdoor",
  "買い物": "shopping",
  "work": "commute",          // 職場・通学先を登録していたら
};

/* ---------- 提案カード ----------
   必須
     id     : 重複しない名前（英数字とハイフン）
     title  : 見出し
     body   : 説明文（1〜2文）
     tags   : 合う場面・気になること・人数のタグ
   任意
     icon   : "ac" "fuel" "power" "quiet" "battery" "tent" "road" "wheel" "leaf" "paw" "yen"
     detail : 詳細画面で表示する長めの説明
     metric : 数字の裏付け（下の種類から選ぶ。コスト比較の電費・電気代で自動計算）
        { type:"power",   watts:1000, minutes:30, label:"冷房で30分待つと" }   電気を使う場面
        { type:"refuel",  litersPerFill:30, minutesPerFill:10 }                 給油がなくなる
        { type:"backup",  dailyKwh:2.5, keepPct:20 }                            停電時に何日分
        { type:"commute" }                                                      1回の充電で通勤何日分（マップに職場を登録したとき）
        { type:"text",    label:"…", value:"…" }                                計算しないで表示
     requires: 表示する条件 { homeCharge:true } など
     carNotes: 車種ごとの注意 { "n-one-e":"…", "super-one":"…", default:"…" }
     note   : 言いすぎにならないための補足
     cta    : カードからの移動先 { to:"rental"|"trip"|"cost"|"area", label:"…" }
     draft  : true なら「仮」と表示（内容を確認中のカード）
*/
window.SCENE_CARDS = [
  {
    id: "wait-ac",
    icon: "ac",
    title: "エアコンをつけたまま、静かに待てる",
    body: "エンジンがないので、待っている間もアイドリングの音や排気ガスが出ません。",
    detail: "習い事のお迎えや、駐車場での待ち時間も、エアコンをつけたまま車内で快適に過ごせます。エンジンをかけないので、周りに音や排気ガスで迷惑をかける心配もありません。",
    tags: ["pickup", "wait", "pet", "family"],
    metric: { type: "power", watts: 1000, minutes: 30, label: "冷房で30分待つと" },
    note: "待っている間も電池は使います。冬の暖房は冷房より多く電気を使います。",
    cta: { to: "rental", label: "レンタカーで車内の快適さを試す" },
    draft: true,
  },
  {
    id: "no-gas-station",
    icon: "fuel",
    title: "ガソリンスタンドに行かなくていい",
    body: "帰宅したら充電器を挿すだけ。給油の待ち時間も、服や手につく匂いもありません。",
    detail: "自宅で充電できれば、給油のためにスタンドに寄る必要がなくなります。寒い日や雨の日に外で給油する手間もなくなります。",
    tags: ["smell", "fuel", "commute", "shopping"],
    requires: { homeCharge: true },
    metric: { type: "refuel", litersPerFill: 30, minutesPerFill: 10 },
    cta: { to: "cost", label: "燃料代の違いをコスト比較で見る" },
    draft: true,
  },
  {
    id: "power-outage",
    icon: "power",
    title: "停電のとき、家の電気をまかなえる",
    body: "車の電池から家電に給電できます。冷蔵庫や照明、スマホの充電に。",
    detail: "EVの電池は、家庭で使う電気の何日分にもなります。台風や地震で停電しても、冷蔵庫の中身を守り、照明をつけ、スマホを充電できます。",
    tags: ["disaster", "family"],
    metric: { type: "backup", dailyKwh: 2.5, keepPct: 20 },
    carNotes: {
      "n-one-e": "外部給電には、別売の給電器（ディーラーオプション）が必要です。",
      "super-one": "専用の給電器を使って、最大1500Wまで給電できます。給電器が付属するかは要確認。",
      "insight": "最大1500Wの外部給電に対応しています。必要な機器は要確認。",
      "n-van-e": "給電への対応と必要な機器は要確認。",
      default: "車種によって給電に必要な機器が異なります。販売店で確認してください。",
    },
    note: "家の分電盤につないで家全体に給電するには、V2H機器の設置工事が別に必要です。コンセントから家電に直接つなぐ使い方なら工事はいりません。",
    draft: true,
  },
  {
    id: "quiet-ride",
    icon: "quiet",
    title: "静かで揺れが少ない",
    body: "エンジンの音と振動がないので、車内で子どもやペットが眠っていても起こしにくい。",
    tags: ["pickup", "pet", "quiet", "family"],
    metric: { type: "text", label: "数字より、乗って確かめるのが一番", value: "" },
    cta: { to: "rental", label: "レンタカーで静かさを試す" },
    draft: true,
  },
  {
    id: "full-every-morning",
    icon: "battery",
    title: "毎朝、満充電で出発できる",
    body: "夜のあいだに自宅で充電。朝の出発前に残りを気にする必要がありません。",
    tags: ["commute", "pickup", "shopping"],
    requires: { homeCharge: true },
    metric: { type: "commute" },
    cta: { to: "area", label: "生活圏マップで毎日の移動を確かめる" },
    draft: true,
  },
  {
    id: "camp-power",
    icon: "tent",
    title: "車がキャンプの電源になる",
    body: "電気毛布や調理家電、照明も。発電機のような音や排気がありません。",
    tags: ["outdoor", "solo", "couple"],
    metric: { type: "power", watts: 50, minutes: 480, label: "電気毛布を一晩（8時間）使うと" },
    carNotes: {
      "n-one-e": "外部給電には、別売の給電器（ディーラーオプション）が必要です。",
      default: "車種によって給電に必要な機器が異なります。販売店で確認してください。",
    },
    note: "使った分だけ航続距離が減ります。帰り道の分は残しておきましょう。",
    cta: { to: "trip", label: "旅行モードでキャンプ場まで試算する" },
    draft: true,
  },
  {
    id: "smooth-start",
    icon: "wheel",
    title: "出だしがなめらかで運転しやすい",
    body: "アクセルを踏んだ瞬間から力が出るので、坂道や合流も落ち着いて運転できます。",
    tags: ["fun", "commute", "longtrip"],
    metric: { type: "text", label: "数字より、乗って確かめるのが一番", value: "" },
    cta: { to: "rental", label: "レンタカーで運転してみる" },
    draft: true,
  },
  {
    id: "long-trip-break",
    icon: "road",
    title: "長距離も、充電しながら休憩",
    body: "2時間に1回の休憩に合わせて充電。食事やトイレのついでに済みます。",
    tags: ["longtrip", "outdoor"],
    metric: { type: "text", label: "急速充電の目安", value: "約30分で80%まで" },
    note: "充電にかかる時間は、充電器の出力と車の電池の状態で変わります。",
    cta: { to: "trip", label: "旅行モードで行き先までの充電を見る" },
    draft: true,
  },
];
