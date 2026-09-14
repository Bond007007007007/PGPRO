#!/usr/bin/env python3
"""Examveda biology practice MCQ spider.
Topics from /biology-gk-chapter-wise/; each topic: N pages of 10 Qs each.
JSONL output: {q, options[], answer(A-D), explain, source, topic}
"""
import json, re, sys, time, html as ihtml

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
BASE = "https://www.examveda.com/biology-gk-chapter-wise/practice-mcq-question-on-{slug}/"

def fetch(url, tries=3):
    import subprocess
    for i in range(tries):
        r = subprocess.run(["curl", "-s", "-L", "-A", UA, url], capture_output=True, text=True, timeout=30)
        if r.returncode == 0 and r.stdout:
            return r.stdout
        time.sleep(2)
    return ""

def parse_page(html):
    qs = []
    pages = [int(m) for m in re.findall(r'/practice-mcq-question-on-[^"]*\?page=(\d+)', html)]
    last = max(pages) if pages else 1
    blocks = re.split(r'<div class="question-main">', html)[1:]
    for b in blocks:
        qm = re.search(r'(.*?)</div>\s*</h2>', b, re.S)
        if not qm:
            continue
        q = re.sub(r"<[^>]+>", "", qm.group(1))
        q = ihtml.unescape(re.sub(r"\s+", " ", q)).strip()
        opts = re.findall(r'<label[^>]*>([A-D])\.\s*</label>\s*<input[^>]*>\s*<label[^>]*>(.*?)</label>', b, re.S)
        am = re.search(r'id="answer_(\d+)" value="(\d+)"', b)
        if not q or len(opts) < 2 or not am:
            continue
        letters = {x[0]: ihtml.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", x[1]))).strip() for x in opts}
        options = [letters[k] for k in sorted(letters)[:4]]
        ans_letter = "ABCD"[min(int(am.group(2)) - 1, 3)]
        expl = ""
        amc = re.search(r'<div class="row answer_container"[^>]*>(.*?)(?:<article|<div class="question)', b, re.S)
        if amc:
            raw = amc.group(1)
            expl_m = re.search(r"Explanation[:\s]*(.*?)(?:Let.?s Discuss|$)", raw, re.S)
            if expl_m:
                expl = ihtml.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", expl_m.group(1)))).strip()
            if not expl:
                em = re.search(r"Answer: Option ([A-D])(.*?)(?:Let.?s Discuss|$)", raw, re.S)
                if em:
                    expl = ihtml.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", em.group(2)))).strip()
        qs.append({"q": q, "options": options, "answer": ans_letter, "explain": expl})
    return qs, last

def crawl(slug, topic, out):
    n = 0
    page = 1
    last = 1
    while page <= max(last, 1) and page <= 60:
        url = BASE.format(slug=slug) if page == 1 else BASE.format(slug=slug) + f"?page={page}"
        h = fetch(url)
        if not h:
            print(f"  page {page}: fetch fail, stop")
            break
        qs, last = parse_page(h)
        if not qs:
            print(f"  page {page}: no questions, stop")
            break
        for q in qs:
            q["source"] = f"Examveda {topic}"
            q["topic"] = topic
            out.append(q)
            n += 1
        page += 1
        time.sleep(0.7)
    print(f"  {slug}: {n} Qs ({page-1} pages)")
    return n

TOPICS = [
    ("microbiology", "Microbiology"),
    ("biotechnology", "Biotechnology"),
    ("cell-biology", "Cell Biology"),
    ("plant-anatomy-and-physiology", "Plant Anatomy And Physiology"),
    ("plant-kindom", "Plant Kingdom"),
    ("animal-kindom", "Animal Kingdom"),
    ("human-anatomy-and-physiology", "Human Anatomy And Physiology"),
    ("human-diseases", "Human Diseases"),
    ("genetics-and-evolution", "Genetics And Evolution"),
    ("gentics-and-evoloution", "Genetics And Evolution"),
    ("economic-biology", "Economic Biology"),
]

if __name__ == "__main__":
    for slug, topic in TOPICS:
        out = []
        crawl(slug, topic, out)
        with open(f"/tmp/opencode/pool/examveda_{slug}.jsonl", "w") as f:
            for q in out:
                f.write(json.dumps(q) + "\n")
        print(f"  saved examveda_{slug}.jsonl ({len(out)})")
    print("DONE", flush=True)