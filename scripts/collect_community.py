"""Daily forks and issues for AnyPS5 plus a star/fork snapshot per run, written to data/community.json.

GitHub does not list stargazers for this repository, so star history is built
from one snapshot per day going forward."""
import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from gh import REPO_NAME, REPO_OWNER, graphql, paginate

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "community.json"

SNAPSHOT = """
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    stargazerCount forkCount watchers { totalCount }
    openIssues: issues(states: OPEN) { totalCount }
    openPrs: pullRequests(states: OPEN) { totalCount }
  }
}
"""

FORKS = """
query($owner: String!, $name: String!, $first: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    forks(first: $first, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes { createdAt }
    }
  }
}
"""

ISSUES = """
query($owner: String!, $name: String!, $first: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(first: $first, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes { createdAt closedAt stateReason }
    }
  }
}
"""


def daily(query, path, field, known):
    counts = Counter()
    newest_known = max(known) if known else None
    stop = (lambda nodes: bool(nodes) and nodes[-1][field][:10] < newest_known) if newest_known else None
    total = 0
    for nodes in paginate(query, path, 100, stop=stop):
        for node in nodes:
            day = node[field][:10]
            if newest_known and day < newest_known:
                continue
            counts[day] += 1
        total += len(nodes)
        if total % 2000 < 100:
            print(f"  {path[-1]}: {total}", flush=True)
    merged = {d: c for d, c in known.items() if not newest_known or d < newest_known}
    merged.update(counts)
    return dict(sorted(merged.items()))


def snapshot(known):
    repo = graphql(SNAPSHOT, owner=REPO_OWNER, name=REPO_NAME)["repository"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    known = dict(known)
    known[today] = {"stars": repo["stargazerCount"], "forks": repo["forkCount"], "watchers": repo["watchers"]["totalCount"],
                    "openIssues": repo["openIssues"]["totalCount"], "openPrs": repo["openPrs"]["totalCount"]}
    return dict(sorted(known.items()))


def issues():
    opened, closed, completed = Counter(), Counter(), Counter()
    for nodes in paginate(ISSUES, ("repository", "issues"), 100):
        for node in nodes:
            opened[node["createdAt"][:10]] += 1
            if node["closedAt"]:
                closed[node["closedAt"][:10]] += 1
                if node["stateReason"] == "COMPLETED":
                    completed[node["closedAt"][:10]] += 1
    return {"opened": dict(sorted(opened.items())), "closed": dict(sorted(closed.items())),
            "completed": dict(sorted(completed.items()))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    out = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "snapshots": snapshot(old.get("snapshots", {})),
        "forks": daily(FORKS, ("repository", "forks"), "createdAt", {} if args.full else old.get("forks", {})),
        "issues": issues(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"stars {out['snapshots'][max(out['snapshots'])]['stars']} forks {sum(out['forks'].values())} "
          f"issues {sum(out['issues']['opened'].values())}")


if __name__ == "__main__":
    main()
