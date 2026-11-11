# EV Life Simulator（Web版シミュレーター）

## このアプリについて
- 買う前に、自分の使い方で「EVのお金と充電」を確かめ、販売店で聞きたいことをはっきりさせるWebアプリ。
- 萌芽ハッカソン（本田技術研究所テーマ）。担当は伊藤。公開先：https://masakingduck5577-blip.github.io/ev-life-simulator/ （GitHub Pages）
- 流れ：EVを選ぶ → 使い方を入れる（1年の走行距離・自宅で充電できるか）→ 結果（乗るとき→買うとき→トータル）→ 相談メモ（画像で保存してお店へ）
- 比べるのは「ガソリン新車への買い替え vs EV新車」。メインはコスト比較、充電マップはサブ、生活シーンは補助。
- レンタカーのボタンはチームのアプリ https://ev-rent-a-car-nine.vercel.app を新しいタブで開く（cars.js の RENTAL.url）。

## 作り
- ビルドなしの素の JavaScript（1ページ、ハッシュでの画面切り替え）。ファイルは全部リポジトリの一番上の階層に置く。
- 状態は `S`、画面は `screens.名前()`、ボタンの動きは `data-act` と `ACT`。
- 主なファイル：app.js（画面と計算）、cars.js（車種・写真・国の補助金の設定）、subsidy.js（国の補助金：自動更新）、
  local_subsidy.csv → local-subsidy.js（市町の補助金）、maps.js（Leaflet の地図）、memo.js（相談メモ）、icons.js（線アイコン）、style.css。
- ファイルを変えたら index.html の `?v=` の日付を上げる（キャッシュ対策）。

## データ（正確さが一番大事）
- 国の補助金：update_subsidy.py が次世代自動車振興センターの表から毎日更新。2026年12月までの登録と2027年1月以降の登録で金額が違う。
- 市町の補助金：local_subsidy.csv を人が公式ページで確かめて直す（金額は自動で書き換えない）。
  status は open / soon / closed / none / check。計算に入れるのは open だけ。直したら checked を確かめた日にする。
  watch_local_subsidy.py が毎週ページの変化を見て Issue で知らせる。
- 充電施設：公式の一覧から作った facilities_official.csv（build_facilities.py）＋OpenStreetMap。EVsmart のデータは利用規約のため使わない。
- 自動更新は .github/workflows/update-data.yml。

## デザイン
- 配色C：背景 #F2F5F9、パネル #FFFFFF、文字 #0F1726、紺 #0A2540、アクセント #1F6FEB。赤は Honda Charge の印（#CC0000）だけ。
- 線アイコン。車は Honda 公式の写真（読み込めないときは線アイコン）。
- デジタル庁デザインシステムに合わせる：本文16px以上、注記14px以上、コントラスト4.5:1以上、押せる部分は24px以上（ボタンは44px）、色だけで伝えない。
- ランニングコストと補助金のカードの構成は変えない（本人の希望）。

## 進め方の約束
- 返事と説明は日本語で、短く。
- 変えたら、ローカルで開いて（例：`python -m http.server`）画面が動くか確かめてから報告する。
- コミット・push は頼まれたときだけ。
