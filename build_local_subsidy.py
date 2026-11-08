"""
市町のEV補助金の一覧（local_subsidy.csv）から、アプリが読む local-subsidy.js を作る。

  python build_local_subsidy.py

local_subsidy.csv を直して GitHub にアップロードすると、Actions がこれを自動で実行する。
CSV の列：
  id           英字の名前（変えない）
  name         市町の名前
  amount       EV（普通車）の補助額（円）。補助なしは 0
  amount_kei   軽EVの額が違うときだけ（円）
  status       open（受付中）/ soon（残りわずか）/ closed（受付終了）/ none（補助なし）
               / check（金額や受付状況を確認できていない）
  until        いつまで（画面に出す文）
  note         条件など（画面に出す文）
  url          市町の公式ページ
  checked      公式ページで確かめた日（YYYY-MM-DD）。確かめたら必ず直す
  page_updated 公式ページに書いてある更新日（分かれば）
"""
import csv, json, re, sys
from datetime import date

SRC, OUT = "local_subsidy.csv", "local-subsidy.js"
STATUS = {"open", "soon", "closed", "none", "check"}


def main():
    rows, errs = [], []
    with open(SRC, encoding="utf-8-sig", newline="") as f:
        for i, r in enumerate(csv.DictReader(f), start=2):
            r = {k: (v or "").strip() for k, v in r.items()}
            name = r.get("name") or f"{i}行目"
            if not re.fullmatch(r"[a-z0-9_-]+", r.get("id", "")):
                errs.append(f"{name}：id は英小文字で")
            if r.get("status") not in STATUS:
                errs.append(f"{name}：status は {' / '.join(sorted(STATUS))} のどれか")
            try:
                amount = int((r.get("amount") or "0").replace(",", ""))
                kei = int(r["amount_kei"].replace(",", "")) if r.get("amount_kei") else None
            except ValueError:
                errs.append(f"{name}：金額は数字だけで（例 100000）"); continue
            if r.get("status") in ("open", "soon") and amount <= 0:
                errs.append(f"{name}：受付中なのに金額が 0")
            if amount > 1_000_000:
                errs.append(f"{name}：金額が大きすぎます（円で入れているか確認）")
            if r.get("url") and not r["url"].startswith("http"):
                errs.append(f"{name}：url は http から")
            for k in ("checked", "page_updated"):
                if r.get(k) and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", r[k]):
                    errs.append(f"{name}：{k} は 2026-11-08 の形で")
            item = {"id": r["id"], "name": r["name"], "amount": amount, "status": r["status"],
                    "until": r.get("until") or "―", "note": r.get("note", ""), "url": r.get("url", ""),
                    "checked": r.get("checked", ""), "pageUpdated": r.get("page_updated", "")}
            if kei is not None:
                item["amountKei"] = kei
            rows.append(item)
    if errs:
        print("local_subsidy.csv に直すところがあります：\n  " + "\n  ".join(errs))
        sys.exit(1)
    checked = max((r["checked"] for r in rows if r["checked"]), default=date.today().isoformat())
    js = ("/* 自動で作ったファイルです。直すときは local_subsidy.csv を直してください（build_local_subsidy.py が作り直します） */\n"
          f"window.LOCAL_SUBSIDY_CHECKED = {json.dumps(checked)};\n"
          "window.LOCAL_SUBSIDY = [\n" +
          "".join("  " + json.dumps(r, ensure_ascii=False) + ",\n" for r in rows) +
          "];\n"
          'window.LOCAL_STATUS_LABEL = { open: "受付中", soon: "残りわずか", closed: "受付終了", check: "確認中", none: "補助なし" };\n')
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"{OUT} を作りました（{len(rows)}市町、最新の確認日 {checked}）")


if __name__ == "__main__":
    main()
