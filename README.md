# AnyPS5 analytics

A dashboard for [boykopovar/AnyPS5](https://github.com/boykopovar/AnyPS5), styled after
[slopalytics.com/usage](https://slopalytics.com/usage). It tracks, day by day:

- **Pull requests**: opened, merged, closed, backlog, time to merge, Conventional Commit type, code churn
- **AI tools**: which PRs were written with Claude, GPT / Codex, both, an unknown AI, or no AI,
  plus merge rate and speed per group and how often the template's `AI-assisted` field is filled in
- **Progress**: system library functions and GPU shader instructions, measured by replaying
  AnyPS5's own `tools/progress.py` on the last `main` commit of every UTC day, per library and per encoding
- **Contributors**: active and first-time contributors, a leaderboard with each person's tool mix
- **Community**: forks, issues, and daily star snapshots

## View it

Open `standalone.html` (everything inlined, works offline) or `index.html` (loads `data/dashboard.js`).
No build step and no dependencies.

## Refresh the data

Needs Python 3.12+, an authenticated `gh` CLI and a clone of AnyPS5.

```sh
cd scripts
python collect_prs.py              # incremental; --full refetches every PR
python collect_community.py
python progress_history.py --anyps5 ../../AnyPS5   # --full replays every day
python build_dashboard.py
```

`.github/workflows/refresh.yml` runs the same steps every day at 03:17 UTC and commits the result.
`collect_prs.py` keeps PR bodies and commit messages in `.cache/` (git-ignored), so the classifier can be
tuned and re-run offline with `python collect_prs.py --reclassify`.

## How a PR is classified

| Group | Rule |
|---|---|
| Claude | Claude or Anthropic named in the body, a commit message or commit author, or a `claude/` branch |
| GPT / Codex | Codex, OpenAI, ChatGPT or a GPT model named the same way, or a `codex/` branch |
| Claude + GPT | both of the above |
| Unknown AI | `AI-assisted: yes` but neither named, or another lab (Gemini, Copilot, Cursor, …) named |
| No AI | `AI-assisted: no` and no trace of a tool |
| Undeclared | no answer in the template |

Bot PRs are excluded. Mentions of `CLAUDE.md` / `AGENTS.md` don't count.

GitHub hides the stargazer list for AnyPS5, so star history starts from the first snapshot.
