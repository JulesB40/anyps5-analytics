"""Fold data/prs.json, data/progress.json and data/community.json into the
compact data/dashboard.js the page loads, plus a single-file standalone.html."""
import json
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CATS = ["claude", "both", "gpt", "unknown", "human", "undeclared"]
TYPES = ["feat", "fix", "test", "perf", "refactor", "docs", "build", "ci", "chore", "style", "revert", "other"]
DISCLOSURE = ["yes", "no", "blank", "missing"]


def load(name, default=None):
    path = DATA / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def parse(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None


def rle(values):
    out = []
    for v in values:
        if out and out[-2] == v:
            out[-1] += 1
        else:
            out += [v, 1]
    return out


def main():
    prs = load("prs.json")["prs"]
    progress = load("progress.json", {"days": []})["days"]
    community = load("community.json", {})
    measurable = [date.fromisoformat(d["date"]) for d in progress if (d.get("lib") or [0, 0])[1] or (d.get("shd") or [0, 0])[1]]
    first = min([parse(p["created"]).date() for p in prs] + measurable[:1])
    last = datetime.now(timezone.utc).date()
    days = [(first + timedelta(days=i)).isoformat() for i in range((last - first).days + 1)]
    index = {d: i for i, d in enumerate(days)}

    authors = Counter(p["author"] for p in prs if not p["bot"])
    author_list = [a for a, _ in authors.most_common()]
    author_index = {a: i for i, a in enumerate(author_list)}
    others = sorted({o for p in prs for o in p["other"]})

    cols = {k: [] for k in ("c", "m", "x", "k", "a", "t", "ad", "de", "h", "d", "dr")}
    other_bits = {}
    for p in sorted((p for p in prs if not p["bot"]), key=lambda p: p["created"]):
        created, merged, closed = parse(p["created"]), parse(p["merged"]), parse(p["closed"])
        c = index[created.date().isoformat()]
        cols["c"].append(c)
        cols["m"].append(index[merged.date().isoformat()] - c if merged else -1)
        cols["x"].append(index[closed.date().isoformat()] - c if closed and not merged else -1)
        cols["k"].append(CATS.index(p["cat"]))
        cols["a"].append(author_index[p["author"]])
        cols["t"].append(TYPES.index(p["type"]))
        cols["ad"].append(p["additions"])
        cols["de"].append(p["deletions"])
        span = (merged - created).total_seconds() / 3600 if merged else -1
        cols["h"].append(-1 if span < 0 else round(span, 1) if span < 10 else round(span))
        cols["d"].append(DISCLOSURE.index(p["ai"]))
        cols["dr"].append(1 if p["draft"] and p["state"] == "OPEN" else 0)
        if p["other"]:
            other_bits[len(cols["c"]) - 1] = sum(1 << others.index(o) for o in p["other"])
    for key in ("k", "t", "d", "dr"):
        cols[key] = "".join(f"{v:x}" for v in cols[key])
    cols["o"] = other_bits

    lib_names = sorted({n for d in progress for n in d.get("libs", {})})
    enc_names = sorted({n for d in progress for n in d.get("enc", {})})
    by_day = {d["date"]: d for d in progress}
    prog = {"lib": [], "shd": [], "libs": {n: [] for n in lib_names}, "enc": {n: [] for n in enc_names}, "sha": []}
    carry = None
    for day in days:
        row = by_day.get(day) or carry or {}
        carry = row
        prog["sha"].append(row.get("sha"))
        prog["lib"].append(row.get("lib") if row.get("lib") and row["lib"][1] else None)
        prog["shd"].append(row.get("shd") if row.get("shd") and row["shd"][1] else None)
        for n in lib_names:
            prog["libs"][n].append(row.get("libs", {}).get(n, [0, 0]))
        for n in enc_names:
            prog["enc"][n].append(row.get("enc", {}).get(n, [0, 0]))
    prog["libs"] = {n: [rle([v[0] for v in s]), rle([v[1] for v in s])] for n, s in prog["libs"].items()}
    prog["enc"] = {n: [rle([v[0] for v in s]), rle([v[1] for v in s])] for n, s in prog["enc"].items()}

    def series(counts):
        return [counts.get(d, 0) for d in days]

    snaps = community.get("snapshots", {})
    out = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "prsFetched": load("prs.json")["fetchedAt"],
        "repo": "boykopovar/AnyPS5",
        "days": days,
        "cats": CATS,
        "types": TYPES,
        "disclosure": DISCLOSURE,
        "others": others,
        "authors": author_list,
        "prs": cols,
        "progress": prog,
        "community": {
            "stars": [snaps.get(d, {}).get("stars") for d in days],
            "openIssues": [snaps.get(d, {}).get("openIssues") for d in days],
            "watchers": [snaps.get(d, {}).get("watchers") for d in days],
            "trackedSince": min(snaps) if snaps else None,
            "forks": series(community.get("forks", {})),
            "issuesOpened": series(community.get("issues", {}).get("opened", {})),
            "issuesClosed": series(community.get("issues", {}).get("closed", {})),
        },
    }
    payload = json.dumps(out, separators=(",", ":"))
    (DATA / "dashboard.js").write_text(f"window.ANYPS5={payload};\n", encoding="utf-8")
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "app.css").read_text(encoding="utf-8")
    js = (ROOT / "app.js").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="app.css">', f"<style>{css}</style>")
    html = html.replace('<script src="data/dashboard.js"></script>', f"<script>window.ANYPS5={payload};</script>")
    html = html.replace('<script src="app.js"></script>', f"<script>{js}</script>")
    (ROOT / "standalone.html").write_text(html, encoding="utf-8")
    print(f"{len(days)} days, {len(prs)} PRs, {len(author_list)} authors, dashboard.js {len(payload) // 1024} KB")


if __name__ == "__main__":
    main()
