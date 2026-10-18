"""
EV充電施設の一覧を OpenStreetMap から取り直して chargers.js と chargers.csv を作る。
GitHub Actions から毎週実行する（.github/workflows/update-data.yml）。

- 対象の都道府県は PREFECTURES で決める（初期値は栃木県だけ）
- 「Honda Charge」の充電器と、Honda販売店の充電器を見分けて network に入れる
- 前回より件数が大きく減ったときは、取り込みに失敗したとみなして書き換えない

地図データ © OpenStreetMap contributors（ODbL）。アプリと一覧に表示する。
"""
import csv
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

PREFECTURES = ["JP-09"]  # 栃木県。旅行先を広げるときは追加（例 "JP-07" 福島、"JP-08" 茨城、"JP-10" 群馬）
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
UA = "ev-life-simulator (Houga hackathon; GitHub Actions)"
OUT_JS, OUT_CSV = "chargers.js", "chargers.csv"
MIN_KEEP_RATIO = 0.6  # 前回の件数のこの割合を下回ったら書き換えない
JST = dt.timezone(dt.timedelta(hours=9))

HONDA_CHARGE = re.compile(r"honda\s*charge|ホンダ\s*チャージ", re.I)
HONDA_DEALER = re.compile(r"honda\s*cars|ホンダ\s*カーズ|hondacars|ホンダ販売|honda販売|ホンダ自動車販売|本田技研", re.I)
QUICK_SOCKETS = ("chademo", "type2_combo", "ccs", "type1_combo", "gb_t_dc", "tesla_supercharger", "nacs")
HONDA_CHARGE_PRICE = "急速 55円/分〜（税込・Honda Chargeアプリで確認）"


def query():
    areas = "".join(f'area["ISO3166-2"="{p}"]["admin_level"="4"];' for p in PREFECTURES)
    return f'[out:json][timeout:180];({areas})->.a;nwr["amenity"="charging_station"](area.a);out center tags;'


def fetch_osm():
    body = urllib.parse.urlencode({"data": query()}).encode()
    last = None
    for ep in ENDPOINTS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(ep, data=body, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=240) as r:
                    return json.loads(r.read().decode("utf-8"))
            except Exception as e:  # noqa: BLE001
                last = e
                time.sleep(20)
    raise RuntimeError(f"Overpass API に接続できませんでした：{last}")


def kw_of(tags):
    vals = []
    for k, v in tags.items():
        if k.endswith(":output") or k in ("output", "charging_station:output", "maxpower"):
            for num, unit in re.findall(r"(\d+(?:\.\d+)?)\s*(kW|kw|KW|W)?", v):
                x = float(num)
                if unit == "W" or (not unit and x > 1000):
                    x /= 1000
                if 0 < x <= 400:
                    vals.append(x)
    return round(max(vals)) if vals else None


def int_of(v):
    m = re.match(r"\s*(\d+)", v or "")
    return int(m.group(1)) if m else None


def to_facility(el, today):
    t = el.get("tags", {})
    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    lng = el.get("lon") or (el.get("center") or {}).get("lon")
    if lat is None or lng is None:
        return None
    text = " ".join(t.get(k, "") for k in ("name", "name:ja", "operator", "network", "brand", "brand:ja", "description"))
    network = "Honda Charge" if HONDA_CHARGE.search(text) else ("Honda販売店" if HONDA_DEALER.search(text) else None)
    kw = kw_of(t)
    sockets = [k.split(":")[1] for k in t if k.startswith("socket:") and k.count(":") == 1 and t[k] not in ("no", "0")]
    quick = any(s in QUICK_SOCKETS for s in sockets) or (kw is not None and kw >= 20) or "急速" in text
    name = t.get("name:ja") or t.get("name")
    if not name:
        base = t.get("operator") or t.get("network") or t.get("brand")
        name = f"{base} 充電スポット" if base else ("急速充電スポット" if quick else "充電スポット")
    hw = t.get("highway") in ("services", "rest_area") or bool(re.search(r"(SA|PA|サービスエリア|パーキングエリア)(\b|$|[（( ])", name))
    price = None
    if t.get("fee") == "no":
        price = "無料"
    elif t.get("charge"):
        price = t["charge"]
    if network == "Honda Charge" and not price:
        price = HONDA_CHARGE_PRICE
    ports = int_of(t.get("capacity")) or (sum(int_of(t[f"socket:{s}"]) or 1 for s in sockets) if sockets else None)
    note = " / ".join(x for x in (t.get("operator"), t.get("network")) if x and x not in name and x != network)
    f = {
        "id": f"osm-{el['type'][0]}{el['id']}",
        "name": name,
        "lat": round(float(lat), 6),
        "lng": round(float(lng), 6),
        "type": "quick" if quick else "normal",
        "kw": kw,
        "ports": ports,
        "priceText": price,
        "hours": t.get("opening_hours"),
        "highway": hw or None,
        "network": network,
        "note": note or None,
        "source": "osm",
        "updatedAt": today,
    }
    return {k: v for k, v in f.items() if v not in (None, "")}


def sort_key(f):
    rank = {"Honda Charge": 0, "Honda販売店": 1}.get(f.get("network"), 2)
    return (rank, f["type"] != "quick", -(f.get("kw") or 0), f["name"])


def load_prev_count():
    try:
        s = open(OUT_JS, encoding="utf-8").read()
        m = re.search(r'"count":\s*(\d+)', s)
        return int(m.group(1)) if m else 0
    except FileNotFoundError:
        return 0


def write(facs, today):
    meta = {
        "updatedAt": today,
        "count": len(facs),
        "honda": sum(f.get("network") == "Honda Charge" for f in facs),
        "dealer": sum(f.get("network") == "Honda販売店" for f in facs),
        "quick": sum(f["type"] == "quick" for f in facs),
        "prefectures": PREFECTURES,
        "source": "OpenStreetMap",
        "license": "© OpenStreetMap contributors (ODbL)",
    }
    with open(OUT_JS, "w", encoding="utf-8") as fp:
        fp.write("/* 自動で作られるファイル（update_chargers.py）。手で書き換えない。\n"
                 "   EV充電施設の一覧。地図データ © OpenStreetMap contributors（ODbL）。\n"
                 "   チームで確かめた施設は facilities.js に書く（近くにある同じ施設は facilities.js を優先）。 */\n")
        fp.write("window.AUTO_FACILITIES_META = " + json.dumps(meta, ensure_ascii=False) + ";\n")
        fp.write("window.AUTO_FACILITIES = [\n")
        fp.write(",\n".join(json.dumps(f, ensure_ascii=False) for f in facs))
        fp.write("\n];\n")
    cols = ["id", "name", "network", "type", "kw", "ports", "priceText", "hours", "highway", "lat", "lng", "note", "updatedAt"]
    with open(OUT_CSV, "w", encoding="utf-8-sig", newline="") as fp:
        w = csv.DictWriter(fp, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for f in facs:
            row = dict(f)
            row["type"] = {"quick": "急速", "normal": "普通"}[f["type"]]
            row["highway"] = "高速" if f.get("highway") else ""
            w.writerow(row)
    return meta


def build(data, today):
    facs = [f for f in (to_facility(el, today) for el in data.get("elements", [])) if f]
    seen, out = set(), []
    for f in sorted(facs, key=sort_key):
        k = (round(f["lat"], 4), round(f["lng"], 4), f["name"])
        if k not in seen:
            seen.add(k)
            out.append(f)
    return out


def main():
    today = dt.datetime.now(JST).date().isoformat()
    facs = build(fetch_osm(), today)
    prev = load_prev_count()
    if prev and len(facs) < prev * MIN_KEEP_RATIO:
        print(f"件数が前回 {prev} 件から {len(facs)} 件に減ったため、取り込みに失敗したとみなして書き換えません", file=sys.stderr)
        sys.exit(1)
    meta = write(facs, today)
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == "__main__":
    main()
