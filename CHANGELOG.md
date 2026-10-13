# v0.1.0 — 2026-10-13

First working Codex release of Did Stuff: “You did stuff. Here’s what.”

- Reusable `did-stuff` skill for recap, standup and three tweet drafts using the current agent.
- Local, redacted, per-event JSON capture with UTC timestamps and project/session scoping.
- Optional reviewed Codex lifecycle hooks and bounded deterministic session/daily saving at normal exit.
- Unique Markdown drafts with provenance, timezone and coverage; edited automatic drafts preserved.
- Standalone installer/removal, native plugin compatibility package, diagnostics and configuration.
- No separate model API, backend, database, X account or public posting.

Tested with Codex CLI 0.162.1 and Node 22.17.0 on macOS. Complete interactive standalone smoke test; native plugin installation, namespaced discovery and hooks discovery checked. Other host versions/surfaces remain unverified. Automatic descriptions are captured reports, not guaranteed independently verified accomplishments. Raw Bash stdout without an exit status remains reported. No historical import, crash-exit guarantee, or multi-project aggregation.
