/* 自動で作られるファイル（update_subsidy.py）。手で書き換えない。
   国のCEV補助金の受付状況・受付終了の見込み・Honda車の補助金額。
   読み込めないときや中身が null のときは cars.js の値を使う。 */
window.SUBSIDY_AUTO = {
  "subsidy": {
    "closed": false,
    "endText": "2026年12月上旬〜下旬",
    "endFrom": "2026-12-01",
    "endTo": "2026-12-31",
    "noticeDate": "2026-09-04",
    "amountAsOf": "2026-10-13"
  },
  "amounts": {
    "n-one-e": 580000,
    "super-one": 1300000,
    "insight": 1300000,
    "n-van-e": 580000
  },
  "sources": {
    "page": "https://www.cev-pc.or.jp/hojo/cev.html",
    "notice": "https://www.cev-pc.or.jp/notice/pdf/20260904_R7ho-cev_oshirase.pdf",
    "table": "https://www.cev-pc.or.jp/hojo/pdf/R7ho/R7ho_meigaragotojougen_3.pdf"
  },
  "updatedAt": "2026-10-17",
  "checkedAt": "2026-10-17"
};
