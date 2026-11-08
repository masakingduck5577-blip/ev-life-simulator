"""
市町の補助金ページが変わっていないか確かめる（毎週、GitHub Actions が実行する）。

  python watch_local_subsidy.py

・local_subsidy.csv の url を順に開き、補助金に関係する行（金額・受付・予算など）だけを取り出して前回と比べる。
・変わったページがあれば local_subsidy_issue.md を作り、Actions が Issue で知らせる。
  → 人がページを読んで local_subsidy.csv を直す（金額は自動では書き換えない：間違った金額を出さないため）。
・確認日（checked）が古くなった市町も知らせる。
前回の内容は local_subsidy_watch.json に入れておく。
"""
import csv, hashlib, html, json, os, re, sys, time, urllib.request
from datetime import date, datetime, timedelta, timezone

SRC, STATE, ISSUE = "local_subsidy.csv", "local_subsidy_watch.json", "local_subsidy_issue.md"
STALE_DAYS = 30          # この日数より前に確かめた市町は「確認日が古い」と知らせる
FAIL_NOTICE = 3          # この回数続けて開けなかったら知らせる
KEY = re.compile(r"電気自動車|ＥＶ|EV|PHEV|PHV|補助|報奨|受付|予算|残額|残高|終了|再開|円|令和|年度|申請|期間")
JST = timezone(timedelta(hours=9))


def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (EV Life Simulator; subsidy watcher)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        cs = r.headers.get_content_charset() or "utf-8"
    try:
        s = raw.decode(cs, errors="replace")
    except LookupError:
        s = raw.decode("utf-8", errors="replace")
    s = re.sub(r"(?is)<(script|style|noscript|header|footer|nav)\b.*?</\1>", " ", s)
    s = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h\d|td|th|dd|dt)>", "\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    lines = [re.sub(r"\s+", " ", l).strip() for l in s.split("\n")]
    # 補助金に関係する行だけ（アクセス数や「今日の日付」などで毎回変わる行を避ける）
    keep = [l for l in lines if 4 <= len(l) <= 300 and KEY.search(l) and not re.search(r"アクセス|閲覧数|ページの先頭", l)]
    return keep


def main():
    with open(SRC, encoding="utf-8-sig", newline="") as f:
        rows = [{k: (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]
    state = json.load(open(STATE, encoding="utf-8")) if os.path.exists(STATE) else {}
    changed, failed, stale = [], [], []
    today = datetime.now(JST).date()

    for r in rows:
        if r.get("checked"):
            try:
                if (today - date.fromisoformat(r["checked"])).days > STALE_DAYS and r["status"] != "none":
                    stale.append(r)
            except ValueError:
                pass
        url = r.get("url")
        if not url:
            continue
        prev = state.get(r["id"], {})
        try:
            lines = fetch_text(url)
        except Exception as e:
            n = prev.get("fails", 0) + 1
            prev["fails"] = n
            state[r["id"]] = prev
            if n >= FAIL_NOTICE:
                failed.append((r, f"{type(e).__name__}: {e}"[:120]))
            print(f"× {r['name']}：開けませんでした（{n}回目）")
            time.sleep(1)
            continue
        h = hashlib.sha256("\n".join(lines).encode()).hexdigest()
        if prev.get("hash") and prev["hash"] != h:
            old = set(prev.get("lines", []))
            added = [l for l in lines if l not in old][:8]
            removed = [l for l in prev.get("lines", []) if l not in set(lines)][:5]
            changed.append((r, added, removed))
            print(f"! {r['name']}：ページが変わりました")
        else:
            print(f"○ {r['name']}")
        state[r["id"]] = {"hash": h, "lines": lines[:80], "fails": 0,
                          "seen": datetime.now(JST).strftime("%Y-%m-%d")}
        time.sleep(1)  # 市町のサーバーに負担をかけないよう、1秒ずつ空ける

    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1)

    notify = ""
    if changed or failed:
        notify = "changed"
        md = ["市町の補助金ページに変化がありました。ページを開いて内容を確かめ、変わっていたら `local_subsidy.csv` を直してください。",
              "直したら `checked` を確かめた日にしてアップロードすると、アプリに自動で反映されます。", ""]
        for r, added, removed in changed:
            md.append(f"### {r['name']}（今のアプリの表示：{r['status']}・{int(r['amount'] or 0):,}円）")
            md.append(f"- ページ：{r['url']}")
            if added:
                md.append("- 増えた・変わった行：")
                md += [f"  - {a}" for a in added]
            if removed:
                md.append("- なくなった行：")
                md += [f"  - ~~{a}~~" for a in removed]
            md.append("")
        if failed:
            md.append(f"### {FAIL_NOTICE}回続けて開けなかったページ（URLが変わった可能性）")
            md += [f"- {r['name']}：{r['url']}（{err}）" for r, err in failed]
        open(ISSUE, "w", encoding="utf-8").write("\n".join(md) + "\n")
    if stale:
        md = [f"次の市町は、最後に確かめてから{STALE_DAYS}日以上たっています。公式ページを確かめて `local_subsidy.csv` の `checked` を直してください。", ""]
        md += [f"- {r['name']}（確認日 {r['checked']}）：{r['url'] or 'ページなし'}" for r in stale]
        open("local_subsidy_stale.md", "w", encoding="utf-8").write("\n".join(md) + "\n")
        notify = notify or "stale"
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as f:
            f.write(f"notify={notify}\nstale={'true' if stale else 'false'}\n")
    print(f"変化 {len(changed)}件・開けない {len(failed)}件・確認日が古い {len(stale)}件")


if __name__ == "__main__":
    main()
