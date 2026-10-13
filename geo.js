/* =========================================================
   外部サービス（場所の検索・経路）
   ---------------------------------------------------------
   ・場所の検索 … Nominatim（OpenStreetMap）
   ・経路      … OSRM のデモサーバー
   どちらも無料の公開サーバーで、大量・本番の利用は禁止されている。
   デモ・試作の範囲で使い、本格運用するときは自前のサーバーか有料サービスに切り替える。
   切り替えるときは GEO_CONFIG の URL だけ変えればよい。
   経路が取れないとき（オフライン・サーバー停止）は、直線距離×1.3 の推定で計算を続ける。
   ========================================================= */
window.GEO_CONFIG = {
  nominatim: "https://nominatim.openstreetmap.org",
  osrm: "https://router.project-osrm.org",
  minIntervalMs: 1100, // Nominatim の利用規約：1秒に1回まで
};

const GEO = (() => {
  const cfg = window.GEO_CONFIG;
  let last = 0;
  const routeCache = new Map();

  async function throttle() {
    const wait = last + cfg.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
  }

  function shortLabel(item) {
    const a = item.address || {};
    const town = a.suburb || a.quarter || a.neighbourhood || a.village || a.town || a.city_district || "";
    const city = a.city || a.town || a.county || "";
    return { town, city };
  }

  /** 場所の検索（日本国内、最大5件） */
  async function search(q) {
    await throttle();
    const url = `${cfg.nominatim}/search?format=jsonv2&addressdetails=1&countrycodes=jp&limit=5&accept-language=ja&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error("search " + res.status);
    const data = await res.json();
    return data.map((d) => {
      const { town, city } = shortLabel(d);
      const name = d.name || d.display_name.split(",")[0];
      return { lat: +d.lat, lng: +d.lon, label: name, detail: [town, city].filter(Boolean).join("・") || d.display_name };
    });
  }

  /** 地図をタップした地点の町名 */
  async function reverse(lat, lng) {
    await throttle();
    const url = `${cfg.nominatim}/reverse?format=jsonv2&addressdetails=1&zoom=16&accept-language=ja&lat=${lat}&lon=${lng}`;
    try {
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) throw 0;
      const d = await res.json();
      const { town, city } = shortLabel(d);
      return { label: town || city || "選んだ地点", detail: city };
    } catch (e) {
      return { label: "選んだ地点", detail: `${lat.toFixed(3)}, ${lng.toFixed(3)}` };
    }
  }

  function straight(a, b) {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t]); }
    const distM = haversine([a.lat, a.lng], [b.lat, b.lng]) * 1.3;
    return { coords: pts, distM, durS: distM / (40000 / 3600), approx: true };
  }

  /** 車での経路。coords は [緯度, 経度] の配列 */
  async function route(a, b) {
    const key = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
    if (routeCache.has(key)) return routeCache.get(key);
    let r;
    try {
      const url = `${cfg.osrm}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw 0;
      const d = await res.json();
      if (!d.routes || !d.routes.length) throw 0;
      const rt = d.routes[0];
      r = { coords: rt.geometry.coordinates.map(([x, y]) => [y, x]), distM: rt.distance, durS: rt.duration, approx: false };
    } catch (e) {
      r = straight(a, b);
    }
    routeCache.set(key, r);
    return r;
  }

  return { search, reverse, route };
})();
