"""
国のCEV補助金（次世代自動車振興センター）を確かめて subsidy.js を書き換える。
GitHub Actions から毎日実行する（.github/workflows/update-data.yml）。

確かめること
  1. 受付の状況（申請受付中／受付終了）            … 補助金のページ
  2. 受付終了の見込み時期と発表日                  … 「申請受付終了見込み時期」のお知らせ
  3. Honda車の車種ごとの補助金額と表の日付         … 「銘柄ごとの補助金交付額」の表（PDF）

読み取れなかった項目は、前回の値をそのまま残す。
変化があったとき・読み取れなかったときは、GitHubのIssueで知らせるための文を subsidy_issue.md に書く。

使うもの：Python 3.10以上、pdftotext（poppler-utils）
"""
import datetime as dt
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.parse
import urllib.request
from html.parser import HTMLParser

PAGE_URL = "https://www.cev-pc.or.jp/hojo/cev.html"
OUT_JS = "subsidy.js"
ISSUE_MD = "subsidy_issue.md"
UA = "ev-life-simulator (Houga hackathon; GitHub Actions; contact via GitHub repo)"
JST = dt.timezone(dt.timedelta(hours=9))

# アプリの車種キー → 表の中で探す文字（車名、グレード）
CARS = {
    "n-one-e": ("N-ONE e:", "e:G"),
    "super-one": ("Super-ONE", None),
    "insight": ("INSIGHT", None),
    "n-van-e": ("N-VAN e:", "e:G"),
}
AMOUNT_RANGE = (100_000, 2_000_000)  # これを外れる金額は読み間違いとみなす


# ---------------------------------------------------------------- 文字の整え方
def norm(s: str) -> str:
    """全角数字・記号をそろえ、波線をすべて ~ にする"""
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"[～〜~]", "~", s)


def reiwa(y: int) -> int:
    return 2018 + y


def jp_iso(y, m, d) -> str:
    return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"


# ---------------------------------------------------------------- 取得
def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def decode_html(b: bytes) -> str:
    m = re.search(rb'charset=["\']?([\w-]+)', b[:3000], re.I)
    for enc in ([m.group(1).decode()] if m else []) + ["utf-8", "cp932"]:
        try:
            return b.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return b.decode("utf-8", "replace")


def pdf_text(b: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(b)
        path = f.name
    try:
        out = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", path, "-"], capture_output=True, check=True)
        return out.stdout.decode("utf-8", "replace")
    finally:
        os.unlink(path)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self._href, self._buf, self.text = [], None, [], []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href, self._buf = dict(attrs).get("href"), []
        if tag == "img" and self._href is not None:
            self._buf.append(dict(attrs).get("alt") or "")

    def handle_data(self, data):
        self.text.append(data)
        if self._href is not None:
            self._buf.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.links.append((self._href, norm("".join(self._buf)).strip()))
            self._href = None


def parse_page(raw: str, base: str):
    p = Links()
    p.feed(raw)
    links = [(urllib.parse.urljoin(base, h), t) for h, t in p.links if h]
    return links, norm(html.unescape(" ".join(p.text)))


# ---------------------------------------------------------------- 読み取り（ネットにつながなくても試せる部分）
JUN = {"上旬": (1, 10), "中旬": (11, 20), "下旬": (21, None), "": (1, None)}


def month_end(y, m):
    return (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1)).day


def parse_end_estimate(text: str):
    """「令和8年12月上旬~12月下旬目処」などを読む。返り値：endText, endFrom, endTo"""
    t = norm(text)
    m = re.search(r"令和(\d+)年(\d+)月(上旬|中旬|下旬)?\s*~\s*(?:令和(\d+)年)?(\d+)月(上旬|中旬|下旬)?", t)
    if m:
        y1, m1, j1 = reiwa(int(m.group(1))), int(m.group(2)), m.group(3) or ""
        y2 = reiwa(int(m.group(4))) if m.group(4) else (y1 + (int(m.group(5)) < m1))
        m2, j2 = int(m.group(5)), m.group(6) or ""
    else:
        m = re.search(r"令和(\d+)年(\d+)月(上旬|中旬|下旬)?(?:頃|ごろ|目処|目途|見込み)", t)
        if not m:
            return None
        y1 = y2 = reiwa(int(m.group(1)))
        m1 = m2 = int(m.group(2))
        j1 = j2 = m.group(3) or ""
    d1 = JUN[j1][0]
    d2 = JUN[j2][1] or month_end(y2, m2)
    if y1 == y2 and m1 == m2:
        txt = f"{y1}年{m1}月{j1}" + (f"〜{j2}" if j2 and j2 != j1 else "")
    elif y1 == y2:
        txt = f"{y1}年{m1}月{j1}〜{m2}月{j2}"
    else:
        txt = f"{y1}年{m1}月{j1}〜{y2}年{m2}月{j2}"
    return {"endText": txt, "endFrom": jp_iso(y1, m1, d1), "endTo": jp_iso(y2, m2, d2)}


def parse_first_date(text: str):
    m = re.search(r"令和(\d+)年(\d+)月(\d+)日", norm(text))
    return jp_iso(reiwa(int(m.group(1))), m.group(2), m.group(3)) if m else None


def parse_table_range(text: str):
    """表の見出し「車両登録日:R8.4.1~」「R7.4.1~R7.12.31」を読む"""
    m = re.search(r"車両登録日\s*[:：]?\s*R(\d+)\.(\d+)\.(\d+)\s*~\s*(?:R(\d+)\.(\d+)\.(\d+))?", norm(text))
    if not m:
        return None
    start = dt.date(reiwa(int(m.group(1))), int(m.group(2)), int(m.group(3)))
    end = dt.date(reiwa(int(m.group(4))), int(m.group(5)), int(m.group(6))) if m.group(4) else None
    return start, end


def parse_table_asof(text: str):
    m = re.search(r"令和(\d+)年(\d+)月(\d+)日\s*現在", norm(text))
    return jp_iso(reiwa(int(m.group(1))), m.group(2), m.group(3)) if m else None


TOKEN = re.compile(r"\d[\d,]*(?:\s*年)?")
AMOUNT_K = (50, 2000)  # 補助金額の列は千円単位。この範囲の数字だけを金額とみなす


def row_amounts(line: str):
    """表の1行から（今の期間の金額, 2027年1月以降の金額）を円で返す。
    1行の並び：車両コード → 定価(円) → 補助金額(千円) R8.4.1~R8.12.31 → R9.1.1以降 → 処分制限期間(◯年)
    定価（10万以上の数字）を目印にして、その後ろの千円単位の数字だけを読む。
    車両コード（1020 など）や「4年」は金額として読まない。"""
    toks = TOKEN.findall(line)
    vals = []
    for t in toks:
        if "年" in t:
            continue
        v = t.replace(",", "").strip()
        if v.isdigit():
            vals.append(int(v))
    price_i = next((i for i, v in enumerate(vals) if v >= 100_000), None)
    if price_i is None:
        return None
    ams = [v for v in vals[price_i + 1:] if AMOUNT_K[0] <= v <= AMOUNT_K[1]]
    if not ams:
        return None
    # 期間ごとに「自家用・貸自動車業用」の2列が並ぶ表なら 1つ目と3つ目、そうでなければ 1つ目と2つ目
    now = ams[0] * 1000
    later = (ams[2] if len(ams) >= 4 else ams[1] if len(ams) >= 2 else None)
    return now, (later * 1000 if later else None)


def parse_amounts(text: str, today: dt.date = None):
    """表の文字からHonda車の補助金額（円）を読む。返り値：{key: (今の期間, 2027年1月以降)}"""
    lines = [norm(l) for l in text.splitlines()]
    found = {}
    for key, (name, grade) in CARS.items():
        for ln in lines:
            if name not in ln or (grade and not re.search(re.escape(grade) + r"(?![\w])", ln)):
                continue
            got = row_amounts(ln.split(name, 1)[1])
            if got:
                found[key] = got
                break
    return found


# 車種ごとに「ありえる金額」の範囲。外れたら読み間違いとみなして使わない
SANE = {
    "n-one-e": (200_000, 800_000),
    "n-van-e": (200_000, 800_000),
    "super-one": (300_000, 1_500_000),
    "insight": (300_000, 1_500_000),
}
MAX_CHANGE = 0.30  # 前回より3割以上変わったら自動では反映せず、Issueで知らせる


def check_amount(key, new, old):
    lo, hi = SANE.get(key, AMOUNT_RANGE)
    if not (lo <= new <= hi):
        return f"{key}：読み取った金額 {new:,}円 はありえない範囲なので使いませんでした"
    if old and abs(new - old) / old > MAX_CHANGE:
        return f"{key}：金額が {old:,}円 → {new:,}円 と大きく変わったので、自動では反映していません（表を確かめて、正しければ subsidy.js を手で直してください）"
    return None


def parse_closed(page_text: str):
    t = norm(page_text)
    if "申請受付中" in t:
        return False
    return bool(re.search(r"申請受付を?終了(いた)?しました|受付を終了いたしました|受付終了しました", t))


# ---------------------------------------------------------------- 前回の値
def load_prev():
    try:
        s = open(OUT_JS, encoding="utf-8").read()
        m = re.search(r"window\.SUBSIDY_AUTO\s*=\s*(\{.*\});", s, re.S)
        return json.loads(m.group(1)) if m else None
    except FileNotFoundError:
        return None


def write_js(data):
    body = json.dumps(data, ensure_ascii=False, indent=2)
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("/* 自動で作られるファイル（update_subsidy.py）。手で書き換えない。\n"
                "   国のCEV補助金の受付状況・受付終了の見込み・Honda車の補助金額。\n"
                "   読み込めないときや中身が null のときは cars.js の値を使う。 */\n")
        f.write(f"window.SUBSIDY_AUTO = {body};\n")


def set_output(k, v):
    p = os.environ.get("GITHUB_OUTPUT")
    if p:
        with open(p, "a", encoding="utf-8") as f:
            f.write(f"{k}={v}\n")


# ---------------------------------------------------------------- 本体
def main():
    today = dt.datetime.now(JST).date()
    prev = load_prev() or {"subsidy": {}, "amounts": {}, "sources": {}}
    sub, amounts, sources = dict(prev.get("subsidy") or {}), dict(prev.get("amounts") or {}), dict(prev.get("sources") or {})
    amounts2027 = dict(prev.get("amounts2027") or {})
    errors = []

    raw = decode_html(fetch(PAGE_URL))
    links, page_text = parse_page(raw, PAGE_URL)
    sources["page"] = PAGE_URL

    # 1. 受付の状況
    sub["closed"] = parse_closed(page_text)

    # 2. 受付終了の見込み（お知らせ。PDFのことも、ページのこともある）
    notice = next(((u, t) for u, t in links if "終了見込" in t), None)
    if notice:
        u = notice[0]
        try:
            if u.lower().endswith(".pdf"):
                ntext = pdf_text(fetch(u))
            else:
                nraw = decode_html(fetch(u))
                nlinks, ntext = parse_page(nraw, u)
                pdf = next((x for x, _ in nlinks if x.lower().endswith(".pdf") and ("oshirase" in x or "cev" in x.lower())), None)
                if pdf:
                    ntext += "\n" + pdf_text(fetch(pdf))
                    u = pdf
            est = parse_end_estimate(ntext)
            if est:
                sub.update(est)
                sub["noticeDate"] = parse_first_date(ntext) or sub.get("noticeDate")
                sources["notice"] = u
            else:
                errors.append("お知らせから受付終了の見込み時期を読み取れませんでした")
        except Exception as e:  # noqa: BLE001
            errors.append(f"お知らせを読み込めませんでした：{e}")
    else:
        errors.append("補助金のページに「受付終了見込み」のお知らせが見つかりませんでした（見込みが未発表、またはページの作りが変わった可能性）")

    # 3. 車種ごとの金額（今日の登録日が入る表を選ぶ）
    tables = [u for u, t in links if u.lower().endswith(".pdf") and ("meigara" in u.lower() or "銘柄" in t)]
    best = None
    for u in tables[:8]:
        try:
            text = pdf_text(fetch(u))
        except Exception as e:  # noqa: BLE001
            errors.append(f"表を読み込めませんでした（{u}）：{e}")
            continue
        rng = parse_table_range(text)
        if not rng or "電気自動車" not in norm(text):
            continue
        start, end = rng
        if start <= today and (end is None or today <= end) and (best is None or start > best[0]):
            best = (start, u, text)
    if best:
        got = parse_amounts(best[2], today)
        missing = [k for k in CARS if k not in got]
        for k, (now_v, later_v) in got.items():
            msg = check_amount(k, now_v, amounts.get(k))
            if msg:
                errors.append(msg)
            else:
                amounts[k] = now_v
            if later_v:
                msg = check_amount(k, later_v, amounts2027.get(k))
                if msg:
                    errors.append("（2027年1月以降）" + msg)
                else:
                    amounts2027[k] = later_v
        sub["amountAsOf"] = parse_table_asof(best[2]) or sub.get("amountAsOf")
        sources["table"] = best[1]
        if missing:
            errors.append("表から金額を読み取れなかった車種：" + "、".join(missing))
    else:
        errors.append("今日の登録日に当てはまる「銘柄ごとの補助金交付額」の表が見つかりませんでした")

    data = {"subsidy": sub, "amounts": amounts, "amounts2027": amounts2027, "sources": sources}
    before = {"subsidy": prev.get("subsidy") or {}, "amounts": prev.get("amounts") or {}, "amounts2027": prev.get("amounts2027") or {}}
    changed = before != {"subsidy": sub, "amounts": amounts, "amounts2027": amounts2027}
    data["updatedAt"] = today.isoformat() if changed else prev.get("updatedAt", today.isoformat())
    data["checkedAt"] = data["updatedAt"]
    if changed or not os.path.exists(OUT_JS):
        write_js(data)

    # Issue の文
    lines = []
    if changed:
        lines.append("## 補助金の情報が変わりました\n")
        for k in sorted(set(before["subsidy"]) | set(sub)):
            if before["subsidy"].get(k) != sub.get(k):
                lines.append(f"- {k}: {before['subsidy'].get(k)} → **{sub.get(k)}**")
        for k in sorted(set(before["amounts"]) | set(amounts)):
            if before["amounts"].get(k) != amounts.get(k):
                lines.append(f"- {k} の補助金額: {before['amounts'].get(k)} → **{amounts.get(k)}**")
        for k in sorted(set(before["amounts2027"]) | set(amounts2027)):
            if before["amounts2027"].get(k) != amounts2027.get(k):
                lines.append(f"- {k} の補助金額（2027年1月以降）: {before['amounts2027'].get(k)} → **{amounts2027.get(k)}**")
        if sub.get("closed"):
            lines.append("\n**補助金の受付が終了した可能性があります。** アプリでは補助金を0円として計算します。")
        lines.append("\nアプリ（subsidy.js）は自動で更新しました。念のため、ページで内容を確かめてください。")
    if errors:
        lines.append("\n## 自動で読み取れなかったこと\n")
        lines += [f"- {e}" for e in errors]
        lines.append("\n読み取れなかった項目は、前回の値のままです。ページを確かめて、必要なら cars.js を手で直してください。")
    lines.append(f"\n確かめたページ：{PAGE_URL}")
    for k, v in sources.items():
        if k != "page":
            lines.append(f"- {k}: {v}")
    if changed or errors:
        with open(ISSUE_MD, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    set_output("notify", "changed" if changed else ("failed" if errors else ""))
    print("\n".join(lines))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # ページ自体に届かないときなど
        with open(ISSUE_MD, "w", encoding="utf-8") as f:
            f.write(f"## 補助金のページを確かめられませんでした\n\n{type(e).__name__}: {e}\n\n{PAGE_URL}\n")
        set_output("notify", "failed")
        print(e, file=sys.stderr)
