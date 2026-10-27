"""Search-engine friendly extras for the published page: a crawlable summary,
structured data and a sitemap, all regenerated with every data refresh."""
import json
from collections import Counter
from html import escape

URL = "https://julesb40.github.io/anyps5-analytics/"
TITLE = "AnyPS5 analytics: pull requests by AI tool, PS5 library and shader progress"
DESCRIPTION = ("Hourly analytics for AnyPS5, the PS5 executable relinker: pull requests by AI tool "
               "(Claude, GPT / Codex, other), merge rates, system library and GPU shader progress, "
               "games unblocked and contributors.")
AI = ("claude", "both", "gpt", "unknown")


def pct(part, whole):
    return f"{100 * part / whole:.1f}%" if whole else "0%"


def summary(prs, progress, games, generated):
    prs = [p for p in prs if not p["bot"]]
    total = len(prs)
    merged = sum(1 for p in prs if p["merged"])
    cats = Counter(p["cat"] for p in prs)
    ai = sum(cats[c] for c in AI)
    lib = next((d["lib"] for d in reversed(progress) if d.get("lib") and d["lib"][1]), None)
    shd = next((d["shd"] for d in reversed(progress) if d.get("shd") and d["shd"][1]), None)
    per_game = Counter(t for p in prs if p["merged"] for t in (p.get("unblocks") or []))
    authors = len({p["author"] for p in prs})
    day = generated[:10]
    top = "".join(
        f"<li>{escape(games.get(t, {}).get('name') or t)} ({t}): {n} merged PRs</li>"
        for t, n in per_game.most_common(10))
    lines = [
        f"<h1>AnyPS5 analytics</h1>",
        f"<p>{escape(DESCRIPTION)}</p>",
        f"<p>As of {day}: {total:,} pull requests opened by {authors:,} contributors, {merged:,} merged. "
        f"{pct(ai, total)} declare or show AI assistance: Claude only {cats['claude']:,}, "
        f"GPT / Codex only {cats['gpt']:,}, Claude and GPT {cats['both']:,}, unknown or other AI {cats['unknown']:,}, "
        f"no AI {cats['human']:,}, undeclared {cats['undeclared']:,}.</p>",
    ]
    if lib:
        lines.append(f"<p>System library functions implemented: {lib[0]:,} of {lib[1]:,} ({pct(lib[0], lib[1])}).</p>")
    if shd:
        lines.append(f"<p>GPU shader instructions decoded: {shd[0]:,} of {shd[1]:,} ({pct(shd[0], shd[1])}).</p>")
    if per_game:
        lines.append(f"<p>{len(per_game):,} games have had a merged pull request that unblocks them. Most worked on:</p><ul>{top}</ul>")
    return f'<div class="static-summary">{"".join(lines)}</div>'


def structured(generated):
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": "AnyPS5 analytics",
        "description": DESCRIPTION,
        "url": URL,
        "dateModified": generated,
        "isAccessibleForFree": True,
        "creator": {"@type": "Person", "name": "JulesB40", "url": "https://github.com/JulesB40"},
        "isBasedOn": "https://github.com/boykopovar/AnyPS5",
        "keywords": ["AnyPS5", "PS5", "relinker", "AI-assisted development", "Claude", "Codex", "open source analytics"],
        "temporalCoverage": f"2026-09-10/{generated[:10]}",
    }, separators=(",", ":"))


def sitemap(generated):
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"  <url><loc>{URL}</loc><lastmod>{generated}</lastmod><changefreq>hourly</changefreq></url>\n"
            "</urlset>\n")


def decorate(html, prs, progress, games, generated):
    head = (f'<meta name="description" content="{escape(DESCRIPTION)}">\n'
            f'<link rel="canonical" href="{URL}">\n'
            f'<meta property="og:type" content="website">\n'
            f'<meta property="og:title" content="{escape(TITLE)}">\n'
            f'<meta property="og:description" content="{escape(DESCRIPTION)}">\n'
            f'<meta property="og:url" content="{URL}">\n'
            f'<meta property="og:image" content="{URL}og.png">\n'
            f'<meta property="og:image:width" content="1200">\n'
            f'<meta property="og:image:height" content="630">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n'
            f'<meta name="twitter:title" content="{escape(TITLE)}">\n'
            f'<meta name="twitter:description" content="{escape(DESCRIPTION)}">\n'
            f'<meta name="twitter:image" content="{URL}og.png">\n'
            f'<script type="application/ld+json">{structured(generated)}</script>\n')
    html = html.replace("<title>AnyPS5 analytics</title>", f"<title>{escape(TITLE)}</title>\n{head}", 1)
    return html.replace('<main id="view"></main>', f'<main id="view">{summary(prs, progress, games, generated)}</main>', 1)
