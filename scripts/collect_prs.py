"""Fetch every AnyPS5 pull request and classify its AI disclosure.

Writes data/prs.json (slim, committed) and .cache/prs_raw.json (bodies and
commit messages, local only) so the classifier can be re-run with --reclassify
without hitting the API again.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from gh import paginate

ROOT = Path(__file__).resolve().parent.parent
SLIM = ROOT / "data" / "prs.json"
RAW = ROOT / ".cache" / "prs_raw.json"
CLASSIFIER_VERSION = 2

FIELDS = """
number title state isDraft createdAt mergedAt closedAt updatedAt
additions deletions changedFiles headRefName body
author { login }
labels(first: 15) { nodes { name } }
commits(first: 25) {
  totalCount
  nodes { commit { message authors(first: 4) { nodes { name email } } } }
}
"""

QUERY = """
query($owner: String!, $name: String!, $first: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: $first, after: $cursor, orderBy: {field: %s, direction: %s}) {
      pageInfo { hasNextPage endCursor }
      nodes { %s }
    }
  }
}
"""

COMMENT = re.compile(r"<!--.*?-->", re.S)
DISCLOSURE = re.compile(r"ai[\s-]*assist(?:ed|ance)?\s*[:\-–]?\s*(.*)", re.I)
NOT_A_MENTION = re.compile(r"claude\.md|agents\.md|\.claude/|claude_code_oauth|\bgpt\s+(?:partition|header|table|disk)|(?<![\w-])(?:codex|claude)/[\w./-]+", re.I)
CLAUDE = re.compile(r"\bclaude\b|anthropic|noreply@anthropic\.com|claude\.(?:ai|com)", re.I)
GPT = re.compile(r"\bcodex\b|openai|chatgpt|\bgpt[-\s]?(?:\d|o\b|oss)", re.I)
OTHER = {
    "Gemini": re.compile(r"\bgemini\b|antigravity|\bjules\.google", re.I),
    "Copilot": re.compile(r"\bcopilot\b", re.I),
    "Cursor": re.compile(r"\bcursor\s+(?:ai|agent|ide|composer)\b|\bcursor\.(?:com|sh)\b|cursoragent", re.I),
    "Grok": re.compile(r"\bgrok\b|\bxai\b", re.I),
    "DeepSeek": re.compile(r"deepseek", re.I),
    "Qwen": re.compile(r"\bqwen", re.I),
    "Kimi": re.compile(r"\bkimi\b|moonshot", re.I),
    "GLM": re.compile(r"\bglm[-\s]?\d|zhipu|z\.ai", re.I),
    "Devin": re.compile(r"\bdevin\b", re.I),
    "Windsurf": re.compile(r"windsurf|codeium", re.I),
    "Mistral": re.compile(r"mistral|devstral", re.I),
    "Junie": re.compile(r"\bjunie\b", re.I),
    "Trae": re.compile(r"\btrae\b", re.I),
    "Cana": re.compile(r"cana\.build|\bcana\b(?=\]|\s+agent)", re.I),
}
CONVENTIONAL = re.compile(r"^\s*([a-zA-Z]+)(?:\([^)]*\))?!?\s*:")
TYPES = {"feat", "fix", "test", "docs", "refactor", "perf", "build", "ci", "chore", "style", "revert"}
TRAILER = re.compile(r"(?im)^[ \t>*-]*(?:co-authored-by|assisted-by|generated-by|ai-assistant|tool)[ \t]*:.*$")
FOOTER = re.compile(r"(?im)\b(?:generated|made|created|written|built|prepared|authored|implemented|developed)\s+(?:with|by|using|in)\s+\[?[^\n]{0,60}")
UNBLOCKS = re.compile(r"(?im)^[ \t>*\-\[\]xX]*unblocks[ \t]*:[ \t]*(.*)$")
TITLE_ID = re.compile(r"\b([A-Z]{4}\d{5})\b", re.I)
NOTHING = re.compile(r"^\W*(?:none|n/?a|no\b|nothing|-|—|–|tbd|unknown)", re.I)


def disclosure(body):
    text = COMMENT.sub(" ", body or "")
    for line in text.splitlines():
        line = line.strip().lstrip("-*[] xX").strip()
        match = DISCLOSURE.match(line)
        if not match:
            continue
        value = match.group(1).strip().lower()
        if re.match(r"(?:yes|y\b|true|partially|partly|some)", value):
            return "yes", match.group(1)
        if re.match(r"(?:no|none|n\b|false)", value):
            return "no", match.group(1)
        if value:
            return "yes" if CLAUDE.search(value) or GPT.search(value) else "blank", match.group(1)
        return "blank", ""
    return "missing", ""


def unblocks(body):
    match = UNBLOCKS.search(COMMENT.sub(" ", body or ""))
    if not match:
        return None
    value = match.group(1).strip()
    if not value or NOTHING.match(value) or re.match(r"(?i)\W*(?:gpus tested|ai-assisted|fixes|depends on)\s*:", value):
        return []
    ids = []
    for found in TITLE_ID.findall(value):
        found = found.upper()
        if found not in ids:
            ids.append(found)
    return ids


def group(claude, gpt, ai, other):
    if claude and gpt:
        return "both"
    if claude:
        return "claude"
    if gpt:
        return "gpt"
    if ai == "yes" or other:
        return "unknown"
    if ai == "no":
        return "human"
    return "undeclared"


def classify(raw):
    body = COMMENT.sub(" ", raw.get("body") or "")
    ai, ai_text = disclosure(raw.get("body"))
    branch = (raw.get("headRefName") or "").lower()
    commits = raw.get("commits", [])
    authors = [f'{a["name"]} <{a["email"]}>' for c in commits for a in c["authors"]]
    everything = NOT_A_MENTION.sub(" ", "\n".join([body, raw.get("headRefName") or ""] + [c["message"] for c in commits] + authors))
    sources = [body] + [c["message"] for c in commits]
    strong_parts = [ai_text] + authors
    for text in sources:
        strong_parts += TRAILER.findall(text) + FOOTER.findall(text)
    strong = NOT_A_MENTION.sub(" ", "\n".join(strong_parts))
    evidence = {}
    for tool, rx, prefix in (("claude", CLAUDE, "claude/"), ("gpt", GPT, "codex/")):
        if rx.search(strong) or branch.startswith(prefix):
            evidence[tool] = "strong"
        elif rx.search(everything):
            evidence[tool] = "mention"
    other = sorted(name for name, rx in OTHER.items() if rx.search(everything))
    cat = group("claude" in evidence, "gpt" in evidence, ai, other)
    strict = group(evidence.get("claude") == "strong", evidence.get("gpt") == "strong",
                   "yes" if ai == "yes" or evidence else ai, other)
    title = raw.get("title") or ""
    match = CONVENTIONAL.match(title)
    kind = match.group(1).lower() if match else "other"
    if kind not in TYPES:
        kind = "other"
    author = raw.get("author") or "ghost"
    return {
        "number": raw["number"],
        "title": title,
        "author": author,
        "state": raw["state"],
        "draft": raw.get("isDraft", False),
        "created": raw["createdAt"],
        "merged": raw.get("mergedAt"),
        "closed": raw.get("closedAt"),
        "updated": raw.get("updatedAt"),
        "additions": raw.get("additions", 0),
        "deletions": raw.get("deletions", 0),
        "files": raw.get("changedFiles", 0),
        "commits": raw.get("commitCount", 0),
        "branch": raw.get("headRefName"),
        "labels": raw.get("labels", []),
        "type": kind,
        "ai": ai,
        "ai_note": ai_text.strip()[:80] if ai_text and ai_text.strip().lower() not in ("yes", "no") else "",
        "evidence": evidence,
        "other": other,
        "cat": cat,
        "cat_strict": strict,
        "unblocks": unblocks(raw.get("body")),
        "bot": author.endswith("[bot]") or author in ("dependabot", "github-actions", "Copilot"),
    }


def slim_raw(node):
    return {
        "number": node["number"],
        "title": node["title"],
        "state": node["state"],
        "isDraft": node["isDraft"],
        "createdAt": node["createdAt"],
        "mergedAt": node["mergedAt"],
        "closedAt": node["closedAt"],
        "updatedAt": node["updatedAt"],
        "additions": node["additions"],
        "deletions": node["deletions"],
        "changedFiles": node["changedFiles"],
        "headRefName": node["headRefName"],
        "body": node["body"],
        "author": (node["author"] or {}).get("login", "ghost"),
        "labels": [l["name"] for l in node["labels"]["nodes"]],
        "commitCount": node["commits"]["totalCount"],
        "commits": [
            {"message": c["commit"]["message"],
             "authors": [{"name": a["name"] or "", "email": a["email"] or ""} for a in c["commit"]["authors"]["nodes"]]}
            for c in node["commits"]["nodes"]
        ],
    }


def load(path):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def fetch(full, page_size):
    raw = {} if full else {str(r["number"]): r for r in (load(RAW) or {}).get("prs", [])}
    slim = {} if full else {str(r["number"]): r for r in (load(SLIM) or {}).get("prs", [])}
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    stored = load(SLIM) or {}
    previous = None if full else stored.get("fetchedAt")
    if previous and stored.get("classifier") != CLASSIFIER_VERSION:
        print(f"classifier changed ({stored.get('classifier')} -> {CLASSIFIER_VERSION}); refetching every PR")
        previous, raw, slim = None, {}, {}
    if previous:
        since = (datetime.fromisoformat(previous.replace("Z", "+00:00")) - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        query = QUERY % ("UPDATED_AT", "DESC", FIELDS)
        stop = lambda nodes: bool(nodes) and nodes[-1]["updatedAt"] < since
        print(f"incremental fetch of PRs updated since {since}")
    else:
        query = QUERY % ("CREATED_AT", "ASC", FIELDS)
        stop = None
        print("full fetch of every PR")
    seen = 0
    for nodes in paginate(query, ("repository", "pullRequests"), page_size, stop=stop):
        for node in nodes:
            r = slim_raw(node)
            raw[str(r["number"])] = r
            slim[str(r["number"])] = classify(r)
        seen += len(nodes)
        print(f"  {seen} PRs fetched (last #{nodes[-1]['number'] if nodes else '-'})", flush=True)
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_text(json.dumps({"fetchedAt": started, "prs": sorted(raw.values(), key=lambda r: r["number"])}), encoding="utf-8")
    write_slim(started, slim.values())


def write_slim(fetched_at, records):
    SLIM.parent.mkdir(parents=True, exist_ok=True)
    out = {"fetchedAt": fetched_at, "classifier": CLASSIFIER_VERSION, "prs": sorted(records, key=lambda r: r["number"])}
    SLIM.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(out['prs'])} PRs to {SLIM}")


def reclassify():
    raw = load(RAW)
    if not raw:
        sys.exit("no raw cache; run a fetch first")
    write_slim(raw["fetchedAt"], [classify(r) for r in raw["prs"]])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="refetch every PR instead of only recently updated ones")
    parser.add_argument("--reclassify", action="store_true", help="re-run the classifier on the local raw cache")
    parser.add_argument("--page-size", type=int, default=40)
    args = parser.parse_args()
    if args.reclassify:
        reclassify()
    else:
        fetch(args.full, args.page_size)


if __name__ == "__main__":
    main()
