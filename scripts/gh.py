import json
import subprocess
import sys
import time

REPO_OWNER = "boykopovar"
REPO_NAME = "AnyPS5"


def graphql(query, **variables):
    args = ["gh", "api", "graphql", "-f", f"query={query}"]
    for key, value in variables.items():
        if value is None:
            continue
        flag = "-F" if isinstance(value, (int, bool)) else "-f"
        args += [flag, f"{key}={json.dumps(value) if isinstance(value, bool) else value}"]
    for attempt in range(6):
        proc = subprocess.run(args, capture_output=True, text=True, encoding="utf-8")
        if proc.returncode == 0:
            data = json.loads(proc.stdout)
            if "errors" not in data:
                return data["data"]
            message = json.dumps(data["errors"])[:300]
        else:
            message = proc.stderr.strip()[:300]
        wait = 5 * (attempt + 1)
        if "rate limit" in message.lower():
            wait = 60
        print(f"  graphql retry {attempt + 1}: {message} (sleep {wait}s)", file=sys.stderr)
        time.sleep(wait)
    raise RuntimeError("GraphQL request kept failing")


def paginate(query, path, page_size, stop=None, **variables):
    cursor = None
    while True:
        data = graphql(query, owner=REPO_OWNER, name=REPO_NAME, first=page_size, cursor=cursor, **variables)
        conn = data
        for key in path:
            conn = conn[key]
        nodes = conn["nodes"]
        yield nodes
        if stop and stop(nodes):
            return
        if not conn["pageInfo"]["hasNextPage"]:
            return
        cursor = conn["pageInfo"]["endCursor"]
