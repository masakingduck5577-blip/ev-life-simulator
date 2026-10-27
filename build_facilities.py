"""
公式の情報で確かめた充電施設の一覧（facilities_official.csv）から、アプリ用の facilities_official.js を作る。

  python build_facilities.py            … CSV から JS を作るだけ
  python build_facilities.py --geocode  … 住所から緯度・経度を取り直してから JS を作る
                                          （国土地理院の住所検索を使う。GitHub Actions の
                                            「データの自動更新」→ target: facilities でも実行できる）

CSV の列
  id, name, address, city, lat, lng, latlngFrom（sheet：チームの一覧の値 / gsi：住所から取得）,
  type（quick / normal）, network（Honda Charge / Honda販売店 / Tesla / 空）, kw, ports, hours,
  category, note, source（確かめた公式の一覧）, sourceUrl, checkedAt
施設を足すときは、CSV に1行足して、このスクリプトを実行する。
"""
import csv
import json
import math
import sys
import time
import urllib.parse
import urllib.request

CSV_PATH, JS_PATH = "facilities_official.csv", "facilities_official.js"
GSI = "https://msearch.gsi.go.jp/address-search/AddressSearch?q="
UA = "ev-life-simulator (Houga hackathon)"
HONDA_CHARGE_PRICE = "急速 55円/分〜（税込・Honda Chargeアプリで確認）"


def dist_km(a, b, c, d):
    r = math.radians
    h = math.sin(r(c - a) / 2) ** 2 + math.cos(r(a)) * math.cos(r(c)) * math.sin(r(d - b) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def geocode(address):
    req = urllib.request.Request(GSI + urllib.parse.quote(address), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read().decode("utf-8"))
    if not res:
        return None
    lng, lat = res[0]["geometry"]["coordinates"]
    return round(lat, 6), round(lng, 6), res[0]["properties"].get("title", "")


def read_rows():
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_rows(rows):
    with open(CSV_PATH, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def do_geocode(rows):
    moved, failed = [], []
    for row in rows:
        if not row["address"]:
            continue
        try:
            got = geocode(row["address"])
        except Exception as e:  # noqa: BLE001
            failed.append(f"{row['name']}（{e}）")
            continue
        time.sleep(0.3)
        if not got:
            failed.append(row["name"])
            continue
        lat, lng, title = got
        # 番地まで当たらず町名だけで当たったときは、地図上の位置がずれるので書き換えない
        if any(ch.isdigit() for ch in row["address"]) and not any(ch.isdigit() for ch in title):
            failed.append(f"{row['name']}（住所の途中までしか見つからない：{title}）")
            continue
        if row["lat"] and dist_km(float(row["lat"]), float(row["lng"]), lat, lng) > 1.5:
            moved.append(f"{row['name']}：{dist_km(float(row['lat']), float(row['lng']), lat, lng):.1f}km 動いた")
        row["lat"], row["lng"], row["latlngFrom"] = lat, lng, "gsi"
    print("位置が大きく変わった施設（地図で確かめる）:\n  " + "\n  ".join(moved or ["なし"]))
    print("住所から位置を取れなかった施設（前の値のまま）:\n  " + "\n  ".join(failed or ["なし"]))


def to_js(rows):
    facs = []
    for r in rows:
        if not r["lat"] or not r["lng"]:
            continue
        f = {
            "id": r["id"], "name": r["name"], "lat": float(r["lat"]), "lng": float(r["lng"]),
            "type": r["type"], "network": r["network"] or None,
            "kw": int(float(r["kw"])) if r["kw"] else None, "ports": int(float(r["ports"])) if r["ports"] else None,
            "hours": r["hours"] or None, "cat": r["category"] or None, "note": r["note"] or None,
            "priceText": HONDA_CHARGE_PRICE if r["network"] == "Honda Charge" and r["type"] == "quick" else None,
            "address": r["address"] or None, "source": "official", "sourceName": r["source"], "updatedAt": r["checkedAt"],
        }
        facs.append({k: v for k, v in f.items() if v not in (None, "")})
    with open(JS_PATH, "w", encoding="utf-8") as fp:
        fp.write("/* 自動で作られるファイル（build_facilities.py）。手で書き換えず、facilities_official.csv を直す。\n"
                 "   公式の一覧（e-Mobility Power・Honda Charge・Tesla）で確かめた充電施設。 */\n")
        fp.write("window.OFFICIAL_FACILITIES = [\n")
        fp.write(",\n".join(json.dumps(f, ensure_ascii=False) for f in facs))
        fp.write("\n];\n")
    print(f"{JS_PATH}：{len(facs)}件（位置が空の {len(rows) - len(facs)}件は出していません）")


if __name__ == "__main__":
    rows = read_rows()
    if "--geocode" in sys.argv:
        do_geocode(rows)
        write_rows(rows)
    to_js(rows)
