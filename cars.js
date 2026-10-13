/* =========================================================
   車両データ（カタログスペック）
   ok:false の値は仮置き。公式情報・ディーラーヒアリングで更新する
   qkw : 急速充電で車が受け入れられる最大出力（kW）※仮置き・要確認
   acKw: 普通充電で受け入れられる最大出力（kW）※仮置き・要確認
   ========================================================= */
const EVS = {
  "n-one-e":  {name:"N-ONE e:（e:G）", cat:"軽乗用EV", price:2699400, sub:580000, wh:105, kwh:29.6, tax:10800, wt:0, qkw:50, acKw:6, ok:true},
  "super-one":{name:"Super-ONE", cat:"小型EV", price:3390200, sub:1300000, wh:113, kwh:29.6, tax:25000, wt:0, qkw:50, acKw:6, ok:false},
  "insight":  {name:"INSIGHT", cat:"クロスオーバーSUV EV", price:5500000, sub:1300000, wh:134, kwh:68.8, tax:25000, wt:0, qkw:150, acKw:6, ok:true},
  "n-van-e":  {name:"N-VAN e:", cat:"軽商用EV", price:2600000, sub:0, wh:126, kwh:29.6, tax:5000, wt:0, qkw:50, acKw:6, ok:false},
  "custom":   {name:"その他のEV", cat:"スペックを入力", custom:true}
};
const GASES = {
  "n-one": {name:"N-ONE", cat:"軽乗用", price:1800000, fe:23, tax:10800, wt:3300},
  "n-box": {name:"N-BOX", cat:"軽乗用", price:1800000, fe:21, tax:10800, wt:3300},
  "n-van": {name:"N-VAN", cat:"軽商用", price:1500000, fe:18, tax:5000, wt:3300},
  "fit":   {name:"フィット e:HEV", cat:"コンパクト", price:2300000, fe:27, tax:30500, wt:7500},
  "zrv":   {name:"ZR-V e:HEV", cat:"SUV", price:3600000, fe:22, tax:36000, wt:12300},
  "custom":{name:"その他のガソリン車", cat:"スペックを入力", custom:true}
};
const DEP = { gas:{hi:0.12, mid:0.15, lo:0.18}, ev:{hi:0.15, mid:0.19, lo:0.23} }; // 年率の価値減少（仮）
const SCEN_LABEL = {hi:"高め", mid:"中間", lo:"低め"};
const SUBSIDY_HOLD_YEARS = 4;
