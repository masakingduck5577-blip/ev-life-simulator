/* =========================================================
   施設データ（チームで登録する）
   ---------------------------------------------------------
   1件 = 1つのオブジェクト。必須項目と任意項目は次のとおり。

   必須
     id     : 重複しない文字列（例 "q-utsunomiya-001"）
     name   : 施設名
     lat,lng: 緯度・経度（Googleマップで右クリック→表示される値）
     type   : "quick"（急速充電） / "normal"（普通充電） / "merit"（EVで得する施設・サービス）

   任意（あると表示・計算が詳しくなる）
     kw       : 充電器の出力 kW（急速 50 / 90 / 150、普通 3 / 6 など）
     ports    : 口数
     price    : 料金を kWh あたりに換算した円（計算に使う。なければ設定画面の単価）
     priceText: 表示用の料金（例 "30分 550円"）
     hours    : 利用できる時間（例 "24時間" "9:00-18:00"）
     highway  : true なら高速道路のSA/PA（一般道からは使えない）
     merit    : type が merit のとき、得する内容
     note     : 補足
     updatedAt: 確認した日（例 "2026-10-20"）
     demo     : true のものは画面に「デモ」と表示される。本番データでは書かない

   ※ 下の DEMO で始まるデータは動作確認用の架空の施設です。
     実データを登録したら削除してください。
   ========================================================= */
window.FACILITIES = [
  { id:"demo-q1", name:"【デモ】急速充電 宇都宮駅東", lat:36.5585, lng:139.9050, type:"quick", kw:50, ports:2, priceText:"30分 [〇]円", hours:"24時間", demo:true },
  { id:"demo-q2", name:"【デモ】急速充電 ゆいの杜", lat:36.5720, lng:139.9800, type:"quick", kw:90, ports:2, hours:"9:00-19:00", note:"販売店の充電器（想定）", demo:true },
  { id:"demo-q3", name:"【デモ】急速充電 鹿沼", lat:36.5680, lng:139.7470, type:"quick", kw:50, ports:1, hours:"24時間", demo:true },
  { id:"demo-q4", name:"【デモ】急速充電 今市", lat:36.7230, lng:139.6830, type:"quick", kw:50, ports:1, hours:"24時間", demo:true },
  { id:"demo-q5", name:"【デモ】急速充電 矢板", lat:36.8070, lng:139.9250, type:"quick", kw:90, ports:2, hours:"24時間", demo:true },
  { id:"demo-q6", name:"【デモ】急速充電 黒磯", lat:36.9700, lng:140.0600, type:"quick", kw:50, ports:1, hours:"8:00-20:00", demo:true },
  { id:"demo-q7", name:"【デモ】急速充電 真岡", lat:36.4400, lng:140.0100, type:"quick", kw:50, ports:1, hours:"24時間", demo:true },
  { id:"demo-n1", name:"【デモ】普通充電 日光の宿", lat:36.7500, lng:139.6000, type:"normal", kw:6, ports:4, priceText:"宿泊者無料", price:0, hours:"宿泊者のみ", demo:true },
  { id:"demo-n2", name:"【デモ】普通充電 那須の宿", lat:37.0800, lng:139.9700, type:"normal", kw:6, ports:2, priceText:"1泊 [〇]円", hours:"宿泊者のみ", demo:true },
  { id:"demo-n3", name:"【デモ】普通充電 商業施設", lat:36.5520, lng:139.9330, type:"normal", kw:3, ports:6, hours:"営業時間内", demo:true },
  { id:"demo-n4", name:"【デモ】普通充電 益子", lat:36.4670, lng:140.0930, type:"normal", kw:6, ports:2, hours:"9:00-17:00", demo:true },
  { id:"demo-m1", name:"【デモ】充電しながら過ごせるカフェ", lat:36.5600, lng:139.9020, type:"merit", merit:"充電中にドリンク割引（想定）", demo:true },
  { id:"demo-m2", name:"【デモ】EV優先駐車場のある施設", lat:36.7480, lng:139.6050, type:"merit", merit:"EV専用の駐車スペース（想定）", demo:true },
  { id:"demo-m3", name:"【デモ】販売店の点検・充電サービス", lat:36.5725, lng:139.9805, type:"merit", merit:"点検中の無料充電（想定）", demo:true },
];

/* =========================================================
   施設データの対象範囲（この外を通る経路には「データ対象外」と表示する）
   [緯度, 経度] の点を順につないだ多角形。今は栃木県をおおまかに囲む仮の範囲。
   データを集めた範囲に合わせて書き換える。
   ========================================================= */
window.COVERAGE = [
  [37.16, 139.33], [37.16, 140.30], [36.70, 140.30], [36.37, 140.30],
  [36.20, 139.95], [36.20, 139.33]
];
