"""Replay AnyPS5's tools/progress.py over the last main commit of every UTC day.

The measuring script, its tokenizer and the RDNA ISA list are taken from the
newest main, so every day is counted with the same rules and the same total.
Days already in data/progress.json are kept unless --full is passed.
"""
import argparse
import importlib.util
import io
import json
import subprocess
import sys
import tarfile
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "progress.json"
PATHS = ("core/libs/prx", "core/shader/recompiler/RdnaDecoder/include")
TOOLS = ("tools/progress.py", "tools/nid_names.py", "tools/rdna_isa.txt")


def git(repo, *args, binary=False):
    proc = subprocess.run(["git", "-C", str(repo), *args], capture_output=True)
    if proc.returncode:
        raise RuntimeError(proc.stderr.decode(errors="replace"))
    return proc.stdout if binary else proc.stdout.decode("utf-8", errors="replace").strip()


def extract(repo, sha, paths, dest):
    present = [p for p in paths if git(repo, "ls-tree", "-d", "--name-only", sha, p) or
               git(repo, "ls-tree", "--name-only", sha, p)]
    if not present:
        return
    data = git(repo, "archive", "--format=tar", sha, *present, binary=True)
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        tar.extractall(dest, filter="data")


def load_progress_module(repo, ref, workdir):
    tools = workdir / "tools"
    tools.mkdir(parents=True)
    for path in TOOLS:
        (workdir / path).write_bytes(git(repo, "show", f"{ref}:{path}", binary=True))
    spec = importlib.util.spec_from_file_location("anyps5_progress", tools / "progress.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def measure(module, tree):
    module.PRX = tree / "core" / "libs" / "prx"
    module.OPCODES = tree / "core" / "shader" / "recompiler" / "RdnaDecoder" / "include" / "RdnaDecoder" / "RdnaOpcode.hpp"
    row = {}
    if module.PRX.is_dir():
        libs = module.collect_libraries()
        row["lib"] = [libs["done"], libs["total"]]
        row["libs"] = {g["name"]: [g["done"], g["done"] + g["todo"]] for g in libs["groups"] if g["done"] + g["todo"]}
    if module.OPCODES.is_file():
        try:
            shaders = module.collect_shaders()
            row["shd"] = [shaders["done"], shaders["total"]]
            row["enc"] = {g["name"]: [g["done"], g["done"] + g["todo"]] for g in shaders["groups"]}
        except AttributeError:
            pass
    return row


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--anyps5", type=Path, required=True, help="path to an AnyPS5 clone")
    parser.add_argument("--ref", default="origin/main")
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()
    repo = args.anyps5.resolve()
    existing = {} if args.full or not OUT.exists() else {d["date"]: d for d in json.loads(OUT.read_text())["days"]}
    first = git(repo, "log", args.ref, "--reverse", "--format=%cI", "--first-parent").splitlines()[0]
    day = datetime.fromisoformat(first).astimezone(timezone.utc).date()
    today = datetime.now(timezone.utc).date()
    with tempfile.TemporaryDirectory() as tmp:
        module = load_progress_module(repo, args.ref, Path(tmp) / "measure")
        cache = {}
        days = []
        while day <= today:
            key = day.isoformat()
            sha = git(repo, "rev-list", "-1", f"--before={key}T23:59:59Z", "--first-parent", args.ref)
            if key in existing and existing[key]["sha"] == sha[:10] and key != today.isoformat():
                days.append(existing[key])
            elif sha:
                if sha not in cache:
                    tree = Path(tmp) / sha[:10]
                    extract(repo, sha, PATHS, tree)
                    cache[sha] = measure(module, tree)
                row = {"date": key, "sha": sha[:10], **cache[sha]}
                days.append(row)
                lib = row.get("lib", ["-", "-"])
                shd = row.get("shd", ["-", "-"])
                print(f"{key} {sha[:10]} libraries {lib[0]}/{lib[1]} shaders {shd[0]}/{shd[1]}", flush=True)
            day += timedelta(days=1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                               "days": days}, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(days)} days to {OUT}")


if __name__ == "__main__":
    sys.exit(main())
