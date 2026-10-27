/* =========================================================
   栃木県内の市町の EV 購入補助（個人・令和8年度）
   ---------------------------------------------------------
   各市町のページを 2026年10月18日に確認した内容。予算に達すると年度の途中でも終わるので、
   status と until をこまめに更新する。
     amount : EV（普通車）の補助額（円）  amountKei : 軽EVの額が違う場合
     status : "open"（受付中） / "soon"（予算が残りわずか） / "closed"（受付終了）
              / "check"（金額や受付状況が分からない → 画面では「市（町）のページで確認できます」とリンクだけ出す） / "none"（EV購入の補助なし）
     until  : いつまで（表示用の文）
     note   : 条件など（表示用の短い文）
   コスト比較の計算に入れるのは status が "open" か "soon" のときだけ。
   ========================================================= */
window.LOCAL_SUBSIDY_CHECKED = "2026-10-18";
window.LOCAL_SUBSIDY = [
  { id: "utsunomiya", name: "宇都宮市", amount: 0, status: "check", until: "―", note: "令和8年度の家庭向け補助の対象にEVの記載なし（市の環境創造課）", url: "https://www.city.utsunomiya.lg.jp/kurashi/kankyo/1034538/ondanka/1044512.html" },
  { id: "nasushiobara", name: "那須塩原市", amount: 150000, status: "open", until: "10月19日に受付再開。2027年3月31日までに納車（予算に達したら終了）", note: "外部給電機能があるEV。市内に3か月以上住んでいること", url: "https://www.city.nasushiobara.tochigi.jp/soshikikarasagasu/cn/simin/5235.html" },
  { id: "yaita", name: "矢板市", amount: 100000, status: "soon", until: "予算に達したら終了（10月1日時点で約89%）", note: "購入前の事前申請が必要。リースは対象外", url: "https://www.city.yaita.tochigi.jp/soshiki/seikatsukankyou/zero-carbon-hojo.html" },
  { id: "takanezawa", name: "高根沢町", amount: 100000, status: "open", until: "2026年12月11日まで（予算に達したら終了）", note: "2026年4月1日以降の契約。残価設定型クレジットは対象外", url: "https://www.town.takanezawa.tochigi.jp/life/sumai/shien/2023-0829-1114-83.html" },
  { id: "nogi", name: "野木町", amount: 100000, status: "open", until: "予算に達したら終了", note: "1人1回まで。受付状況は町に確認", url: "https://www.town.nogi.lg.jp/kurashi/kankyou/ondanka/page005123.html" },
  { id: "sano", name: "佐野市", amount: 100000, status: "check", until: "予算に達したら終了", note: "金額は令和7年度の内容。市内の販売店で購入、外部給電機能が必要", url: "https://www.city.sano.lg.jp/soshikiichiran/shimin/kikouhendou/gyomuannai/ondanka/23608.html" },
  { id: "shioya", name: "塩谷町", amount: 0, status: "check", until: "予算に達したら終了", note: "金額はページの画像のみ。町に確認", url: "https://www.town.shioya.tochigi.jp/info/2254" },
  { id: "kanuma", name: "鹿沼市", amount: 80000, status: "soon", until: "予算の残りわずか（10月9日時点で残り6千円）", note: "報奨金（商品券）", url: "https://www.city.kanuma.tochigi.jp/0126/info-0000007705-1.html" },
  { id: "nikko", name: "日光市", amount: 150000, status: "closed", until: "予算の残りなし（10月14日時点）", note: "購入後90日以内に申請", url: "https://www.city.nikko.lg.jp/soshiki/6/1031/2/1/115.html" },
  { id: "oyama", name: "小山市", amount: 100000, amountKei: 50000, status: "closed", until: "受付終了（9月24日）", note: "自宅に太陽光発電があることが条件。軽EVは5万円", url: "https://www.city.oyama.tochigi.jp/kurashi/sumai-hikkoshi/sumai/page006083.html" },
  { id: "ohtawara", name: "大田原市", amount: 100000, status: "closed", until: "受付終了（8月25日）", note: "", url: "https://www.city.ohtawara.tochigi.jp/docs/2020012700031/" },
  { id: "sakura", name: "さくら市", amount: 100000, status: "closed", until: "受付終了（9月4日）", note: "EVのみ（PHEVは対象外）", url: "https://www.city.tochigi-sakura.lg.jp/life/000014/000590/p001978.html" },
  { id: "shimotsuke", name: "下野市", amount: 100000, status: "closed", until: "受付終了", note: "", url: "https://www.city.shimotsuke.lg.jp/1732/info-0000009028-3.html" },
  { id: "mibu", name: "壬生町", amount: 100000, status: "closed", until: "受付終了", note: "", url: "https://www.town.mibu.tochigi.jp/docs/2024032600029/" },
  { id: "kaminokawa", name: "上三川町", amount: 0, status: "check", until: "予算に達したら終了", note: "給電機能があるEVが対象。金額は町に確認", url: "https://www.town.kaminokawa.lg.jp/" },
  { id: "nasukarasuyama", name: "那須烏山市", amount: 0, status: "check", until: "2027年3月31日まで", note: "金額は市に確認", url: "https://www.city.nasukarasuyama.lg.jp/page/page005302.html" },
  { id: "nakagawa", name: "那珂川町", amount: 0, status: "check", until: "2027年2月26日まで（購入前に申請）", note: "EVか充電設備のどちらか。金額は町に確認", url: "http://www.town.tochigi-nakagawa.lg.jp/0067/info-0000000295-0.html" },
  { id: "haga", name: "芳賀町", amount: 0, status: "none", until: "―", note: "EV購入の補助は見つかりませんでした", url: "" },
  { id: "moka", name: "真岡市", amount: 0, status: "none", until: "―", note: "充電設備・V2Hのみ（EV本体は対象外）", url: "" },
  { id: "tochigi", name: "栃木市", amount: 0, status: "none", until: "―", note: "充電設備・V2Hのみ（EV本体は対象外）", url: "" },
  { id: "ashikaga", name: "足利市", amount: 0, status: "none", until: "―", note: "充電設備・V2Hのみ（EV本体は対象外）", url: "" },
  { id: "mashiko", name: "益子町", amount: 0, status: "none", until: "―", note: "充電設備・V2Hのみ（EV本体は対象外）", url: "" },
  { id: "ichikai", name: "市貝町", amount: 0, status: "none", until: "―", note: "EV購入の補助は見つかりませんでした", url: "" },
  { id: "nasu", name: "那須町", amount: 0, status: "check", until: "―", note: "", url: "https://www.town.nasu.lg.jp/" },
  { id: "motegi", name: "茂木町", amount: 0, status: "none", until: "―", note: "EV購入の補助は見つかりませんでした", url: "" },
];
window.LOCAL_STATUS_LABEL = { open: "受付中", soon: "残りわずか", closed: "受付終了", check: "", none: "補助なし" };
