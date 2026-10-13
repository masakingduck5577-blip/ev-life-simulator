/**
 * ev-route.js
 * マップ機能の計算ロジック（Leaflet / OpenStreetMap 前提、外部ライブラリ不要）
 *
 *  1. findFacilitiesAlongRoute … 経路から一定距離内の施設を探す
 *  2. findFacilitiesNear       … 地点の周り（半径）の施設を探す
 *  3. planCharging             … 推奨充電地点を選ぶ（片道）
 *  4. planTrip                 … 往復＋目的地での充電＋費用の概算
 *
 * 座標は [lat, lng]、距離は m（表示時に km に直す）
 */

/* ---------- 基本の幾何 ---------- */

const R_EARTH = 6371000;
const rad = (d) => (d * Math.PI) / 180;

/** 2点間の距離（ハーバサイン、m） */
function haversine(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

/**
 * 緯度経度 → 平面座標（m）。経路の中心緯度で正距円筒図法に近似。
 * 栃木県内〜数百kmなら誤差は数％以下で、施設探索には十分。
 */
function makeProjector(points) {
  const lat0 = points.reduce((s, p) => s + p[0], 0) / points.length;
  const kx = R_EARTH * Math.cos(rad(lat0)) * (Math.PI / 180);
  const ky = R_EARTH * (Math.PI / 180);
  return (p) => ({ x: p[1] * kx, y: p[0] * ky });
}

/** 点 p から線分 ab への最短距離と、線分上の位置 t（0〜1） */
function pointToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx, cy = a.y + t * dy;
  return { dist: Math.hypot(p.x - cx, p.y - cy), t };
}

/* ---------- 1. 経路から一定距離内の施設 ---------- */

/**
 * @param route      経路の点列 [[lat,lng], ...]（OSRM などの geometry）
 * @param facilities [{ id, lat, lng, type, kw, ... }]
 * @param opts.bufferM    経路からの距離の上限（m）。既定 1000
 * @param opts.types      対象の種類（例 ['quick']）。省略で全部
 * @returns 経路に沿った順に並んだ施設。各施設に
 *          offRouteM（経路からの距離）, alongM（出発地からの距離）,
 *          detourM（寄り道の往復の目安）を付ける
 */
function findFacilitiesAlongRoute(route, facilities, opts = {}) {
  const bufferM = opts.bufferM ?? 1000;
  const proj = makeProjector(route);
  const pts = route.map(proj);

  // 区間ごとの累積距離と、外接矩形（buffer 分ふくらませる）
  const segs = [];
  let cum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({
      a, b, len, start: cum,
      minX: Math.min(a.x, b.x) - bufferM, maxX: Math.max(a.x, b.x) + bufferM,
      minY: Math.min(a.y, b.y) - bufferM, maxY: Math.max(a.y, b.y) + bufferM,
    });
    cum += len;
  }
  const totalM = cum;
  const box = segs.reduce((m, s) => ({
    minX: Math.min(m.minX, s.minX), maxX: Math.max(m.maxX, s.maxX),
    minY: Math.min(m.minY, s.minY), maxY: Math.max(m.maxY, s.maxY),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

  const out = [];
  for (const f of facilities) {
    if (opts.types && !opts.types.includes(f.type)) continue;
    const p = proj([f.lat, f.lng]);
    // 経路全体の矩形の外なら計算しない（大半の施設はここで除外される）
    if (p.x < box.minX || p.x > box.maxX || p.y < box.minY || p.y > box.maxY) continue;

    let best = null;
    for (const s of segs) {
      if (p.x < s.minX || p.x > s.maxX || p.y < s.minY || p.y > s.maxY) continue;
      const r = pointToSegment(p, s.a, s.b);
      if (!best || r.dist < best.dist) best = { dist: r.dist, along: s.start + r.t * s.len };
    }
    if (best && best.dist <= bufferM) {
      out.push({
        ...f,
        offRouteM: Math.round(best.dist),
        alongM: Math.round(best.along),
        // 直線距離 × 道路の回り込み係数 1.3 × 往復
        detourM: Math.round(best.dist * 1.3 * 2),
      });
    }
  }
  out.sort((x, y) => x.alongM - y.alongM);
  return { totalM, facilities: out };
}

/* ---------- 2. 地点の周りの施設 ---------- */

function findFacilitiesNear(center, facilities, radiusM, types) {
  return facilities
    .filter((f) => !types || types.includes(f.type))
    .map((f) => ({ ...f, distM: Math.round(haversine(center, [f.lat, f.lng])) }))
    .filter((f) => f.distM <= radiusM)
    .sort((a, b) => a.distM - b.distM);
}

/* ---------- 3. 推奨充電地点（片道） ---------- */

/**
 * 「行ける範囲の中で、できるだけ遠い急速充電器で充電する」貪欲法。
 * 毎回同じ量（target まで）充電するなら、この方法で充電回数は最小になる。
 *
 * @param totalM     経路の長さ（m）
 * @param chargers   findFacilitiesAlongRoute の結果（急速のみ）
 * @param car        { kwh: 容量, whPerKm: カタログ電費, maxKw: 車が受けられる最大出力 }
 * @param opts.startSoc  出発時の残量（0〜1）
 * @param opts.reserve   安心ライン（これより減らさない、0〜1）
 * @param opts.target    急速充電で何%まで入れるか（既定 0.8）
 * @param opts.season    季節係数（春秋 1.0 / 夏 0.9 / 冬 0.7 など、コスト比較と同じ値）
 * @param opts.realRatio 実電費／カタログ（既定 0.9）
 * @param opts.minGapSoc この残量より多いうちは止めない（早すぎる充電を避ける、既定 0.5）
 */
function planCharging(totalM, chargers, car, opts) {
  const reserve = opts.reserve ?? 0.2;
  const target = opts.target ?? 0.8;
  const minGapSoc = opts.minGapSoc ?? 0.5;
  // 1m あたりの消費（kWh）。季節係数で電費が落ちる＝消費が増える
  const kwhPerM = car.whPerKm / (opts.realRatio ?? 0.9) / (opts.season ?? 1) / 1000 / 1000;
  const socPerM = kwhPerM / car.kwh;

  let pos = 0;              // 今いる位置（経路上の m）
  let soc = opts.startSoc ?? 1;
  const stops = [];
  const trace = [{ alongM: 0, soc, label: 'start' }];

  for (let guard = 0; guard < 20; guard++) {
    const reachM = (soc - reserve) / socPerM;           // 安心ラインまでに走れる距離
    if (pos + reachM >= totalM) {                       // 充電なしで到着できる
      const arrive = soc - (totalM - pos) * socPerM;
      trace.push({ alongM: totalM, soc: arrive, label: 'arrive' });
      return { ok: true, stops, arriveSoc: arrive, trace, kwhPerM };
    }
    // 行ける範囲にある、まだ通過していない充電器（寄り道の分も差し引く）
    const reachable = chargers.filter((c) =>
      c.alongM > pos && c.alongM - pos + c.detourM / 2 <= reachM);
    // 残量がまだ多いうちの充電は避ける（十分に減った地点の候補があればそちらだけ）
    const lowEnough = reachable.filter((c) => soc - (c.alongM - pos) * socPerM <= minGapSoc);
    const candidates = lowEnough.length ? lowEnough : reachable;
    if (candidates.length === 0) {
      return { ok: false, stops, failAtM: pos + reachM, trace, kwhPerM,
               reason: '安心ラインまでに届く急速充電器がありません' };
    }
    // 一番遠いものを基準に、その手前 15% 以内なら出力が大きい方を選ぶ
    const far = Math.max(...candidates.map((c) => c.alongM));
    const pick = candidates
      .filter((c) => c.alongM >= far - reachM * 0.15)
      .sort((a, b) => (b.kw ?? 0) - (a.kw ?? 0) || b.alongM - a.alongM)[0];

    const socArrive = soc - (pick.alongM - pos + pick.detourM / 2) * socPerM;
    // 最後の充電なら、目的地まで（安心ライン＋余裕10%）に必要な分だけ入れる
    // partialLast:false のとき（帰りの分も考える必要があるとき）は常に target まで充電
    const needToFinish = opts.partialLast === false ? target
      : (totalM - pick.alongM + pick.detourM / 2) * socPerM + reserve + 0.1;
    const socLeave = Math.min(target, Math.max(socArrive, needToFinish));
    const addKwh = Math.max(0, (socLeave - socArrive) * car.kwh);
    const kw = Math.min(pick.kw ?? 50, car.maxKw ?? 50);
    const minutes = Math.ceil((addKwh / (kw * 0.85)) * 60);   // 0.85＝充電中の出力低下の目安
    stops.push({ ...pick, socArrive, socLeave, addKwh, minutes });
    trace.push({ alongM: pick.alongM, soc: socArrive, label: 'charge-in' });
    trace.push({ alongM: pick.alongM, soc: socLeave, label: 'charge-out' });
    soc = socLeave - (pick.detourM / 2) * socPerM;              // 経路に戻るまでの分
    pos = pick.alongM;
  }
  return { ok: false, stops, trace, reason: '充電回数が多すぎます' };
}

/* ---------- 4. 往復＋費用 ---------- */

/**
 * @param route    行きの経路（帰りは逆向きに使う）
 * @param allFacilities チームの施設データ
 * @param car, opts  planCharging と同じ ＋
 *   opts.stayHours  目的地での滞在時間（宿泊なら一晩）
 *   opts.destCharge 目的地で充電できるか
 *   opts.price      { home: 円/kWh, quick: 円/kWh換算, dest: 円/kWh, gas: 円/L }
 *   opts.gasKmPerL  比べるガソリン車の実燃費
 */
function planTrip(route, allFacilities, car, opts) {
  const quick = allFacilities.filter((f) => f.type === 'quick' && !(opts.excludeHighway && f.highway));
  const go = findFacilitiesAlongRoute(route, quick, { bufferM: opts.bufferM ?? 1000 });
  // 目的地で充電しない旅程では、行きの最後の充電を「必要な分だけ」にすると帰りに困るので、80%まで入れる
  const outbound = planCharging(go.totalM, go.facilities, car, { ...opts, partialLast: !!opts.destCharge });

  // 目的地での充電
  const dest = route[route.length - 1];
  const destChargers = findFacilitiesNear(dest, allFacilities, opts.destRadiusM ?? 500, ['normal', 'quick']).sort((a, b) => (a.type === 'normal' ? 0 : 1) - (b.type === 'normal' ? 0 : 1) || a.distM - b.distM);
  let socAtDest = outbound.ok ? outbound.arriveSoc : null;
  let destKwh = 0;
  // 目的地で充電できると入力されていれば、施設データがなくても普通充電6kWを想定する
  const destCharger = destChargers.find((f) => f.type === 'normal') || destChargers[0] ||
    (opts.destCharge ? { name: '目的地の充電器（想定）', type: 'normal', kw: 6, assumed: true } : null);
  if (outbound.ok && opts.destCharge && destCharger) {
    const kw = Math.min(destCharger.kw ?? 3, car.maxAcKw ?? 6);
    destKwh = Math.min((1 - socAtDest) * car.kwh, kw * 0.9 * (opts.stayHours ?? 0));
    socAtDest += destKwh / car.kwh;
  }

  // 帰り：同じ経路を逆向きに
  const back = findFacilitiesAlongRoute([...route].reverse(), quick, { bufferM: opts.bufferM ?? 1000 });
  let inbound = outbound.ok
    ? planCharging(back.totalM, back.facilities, car, { ...opts, startSoc: socAtDest })
    : null;

  // 帰りの最初の充電器まで届かない → 目的地の近く（既定5km）の急速充電で出発前に入れる
  let destQuick = null;
  if (inbound && !inbound.ok) {
    const near = findFacilitiesNear(dest, quick, opts.destQuickRadiusM ?? 5000);
    if (near.length) {
      const q = near[0];
      const target = opts.target ?? 0.8;
      const addKwh = Math.max(0, (target - socAtDest) * car.kwh);
      const kw = Math.min(q.kw ?? 50, car.maxKw ?? 50);
      destQuick = { ...q, socArrive: socAtDest, socLeave: target, addKwh,
                    minutes: Math.ceil((addKwh / (kw * 0.85)) * 60) };
      socAtDest = target;
      inbound = planCharging(back.totalM, back.facilities, car, { ...opts, startSoc: target });
    }
  }

  // 費用：施設ごとの単価（price, 円/kWh換算）があればそれを使い、なければ設定の単価
  const p = opts.price;
  const quickStops = [...outbound.stops, ...(destQuick ? [destQuick] : []), ...(inbound?.stops ?? [])];
  const quickKwh = quickStops.reduce((s, x) => s + x.addKwh, 0);
  const quickCost = quickStops.reduce((s, x) => s + x.addKwh * (x.price ?? p.quick), 0);
  const destPrice = destCharger?.price ?? p.dest;
  const usedKwh = (go.totalM + back.totalM) * outbound.kwhPerM;
  // 急速・目的地で入れた分以外は、出発前と帰宅後の自宅充電でまかなう
  const homeKwh = Math.max(0, usedKwh - quickKwh - destKwh);
  const cost = {
    home: Math.round(homeKwh * p.home),
    quick: Math.round(quickCost),
    dest: Math.round(destKwh * destPrice),
  };
  cost.total = cost.home + cost.quick + cost.dest;
  cost.gas = Math.round(((go.totalM + back.totalM) / 1000 / opts.gasKmPerL) * p.gas);

  return { distanceKm: +(go.totalM / 1000).toFixed(1), outbound, destChargers, destCharger, destQuick, socAtDest, inbound, cost,
           kwh: { used: +usedKwh.toFixed(1), home: +homeKwh.toFixed(1), quick: +quickKwh.toFixed(1), dest: +destKwh.toFixed(1) } };
}

if (typeof module !== 'undefined') {
  module.exports = { haversine, findFacilitiesAlongRoute, findFacilitiesNear, planCharging, planTrip };
}
