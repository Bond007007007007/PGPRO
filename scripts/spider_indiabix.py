#!/usr/bin/env python3
"""Spider IndiaBIX MCQ sections -> JSONL.
Usage: spider_indiabix.py <subdomain> [--limit N] [--out file.jsonl]
Subdomains: biochemistry, biotechnology, microbiology, biochemical-engineering,
            aptitude, verbal-ability, logical-reasoning
"""
import re, sys, json, time, urllib.request, urllib.parse

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9"}

def fetch(url, retries=2):
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if i == retries:
                print(f"  ! fetch fail {url}: {e}", file=sys.stderr)
                return None
            time.sleep(2)

def parse_questions(html):
    qs = []
    blocks = re.split(r'<div class="bix-div-container">', html)[1:]
    for b in blocks:
        # question text: content ends at the FIRST closing div (qtxt row)
        qt = re.search(r'class="bix-td-qtxt[^"]*">(.*?)</div>', b, re.S)
        if not qt:
            continue
        qtext = re.sub(r'<[^>]+>', ' ', qt.group(1))
        qtext = re.sub(r'\s+', ' ', qtext).strip()
        # options in order
        opts_raw = re.findall(r'class="bix-td-option-val[^"]*"[^>]*>.*?class="flex-wrap">(.*?)</div>', b, re.S)
        opts = [re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', o)).strip() for o in opts_raw]
        opts = [o for o in opts if o]
        # answer letter from hidden input
        ans = re.search(r'class="jq-hdnakq"[^>]*value="([A-Da-d])"', b)
        # explanation
        expl = re.search(r'class="bix-ans-description[^"]*">(.*?)</div>', b, re.S)
        if expl:
            expl = re.sub(r'<[^>]+>', ' ', expl.group(1))
            expl = re.sub(r'\s+', ' ', expl).strip()
        else:
            expl = ""
        if ans and len(opts) >= 2:
            qs.append({"q": qtext, "options": opts[:4], "answer": ans.group(1).upper(), "explain": expl})
    return qs

def topic_pages(html, topic_path):
    """find section code + max page: /path/{sec}0{NN} -> sec, N"""
    links = re.findall(r'href="https://www\.indiabix\.com/' + re.escape(topic_path) + r'/(\d{6})"', html)
    m = re.search(r'of (\d+)', html)
    page_txt = m.group(1) if m else ""
    pages = set()
    for lnk in links:
        sec = lnk[:3]
        n = int(lnk[3:])
        pages.add((sec, n))
    # guess: if "of N" found, section is first 3 digits of first link
    if pages:
        sec0 = min(sec for sec, _ in pages)
        maxn = max(n for s, n in pages if s == sec0)
        return sec0, maxn, len(links)
    return None, None, 0

def main():
    sub = sys.argv[1]
    limit = None
    out = "indiabix_" + sub + ".jsonl"
    for i, a in enumerate(sys.argv):
        if a == "--limit":
            limit = int(sys.argv[i + 1])
        if a == "--out":
            out = sys.argv[i + 1]
    base = f"https://www.indiabix.com/{sub}/"
    idx = fetch(base + "questions-and-answers/") or fetch(base)
    if not idx:
        print("FATAL: no index", file=sys.stderr); sys.exit(1)
    # topic links (skip questions-and-answers itself, discussions)
    topics = []
    for m in re.finditer(r'href="(https://www\.indiabix\.com/' + re.escape(sub) + r'/([a-z0-9\-]+)/)"', idx):
        url, slug = m.group(1), m.group(2)
        if slug in ("questions-and-answers",) or "/discussion" in url:
            continue
        if (slug, url) not in topics and not re.search(r'\d{6}', slug):
            topics.append((slug, url))
    seen = set()
    topics = [(s, u) for s, u in topics if not (s in seen or seen.add(s))]
    print(f"topics: {len(topics)}")
    all_qs = []
    t0 = time.time()
    for ti, (slug, url) in enumerate(topics):
        h = fetch(url)
        if not h:
            continue
        sec, maxn, nlinks = topic_pages(h, sub + "/" + slug)
        qs = parse_questions(h)
        pages_fetched = 1
        if sec and maxn and maxn > 1:
            for n in range(2, maxn + 1):
                pu = f"https://www.indiabix.com/{sub}/{slug}/{sec}{n:03d}"
                ph = fetch(pu)
                if ph:
                    qs += parse_questions(ph)
                    pages_fetched += 1
                time.sleep(0.15)
        for q in qs:
            q["source"] = f"IndiaBIX {sub}/{slug}"
            q["topic"] = slug.replace("-", " ").title()
            all_qs.append(q)
        print(f"[{ti+1}/{len(topics)}] {slug}: {len(qs)} Qs ({pages_fetched}p) tot={len(all_qs)} elapsed={int(time.time()-t0)}s")
        if limit and len(all_qs) >= limit:
            break
        time.sleep(0.2)
    with open(out, "w") as f:
        for q in all_qs:
            f.write(json.dumps(q) + "\n")
    print(f"DONE: {len(all_qs)} questions -> {out}")

if __name__ == "__main__":
    main()