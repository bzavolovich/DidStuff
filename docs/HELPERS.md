# Local helper contracts

All commands run with the current project as cwd or explicit `--project PATH`. `config` and `doctor` inspect active locations. `init` ensures ignored storage; hook automation initially defaults false and `historyImport` defaults true (also for older configuration files). Exit helpers run only when exit saving is enabled. Manual record/save and history remain usable with hooks disabled.

## Historical sessions

`history [--period all|today|yesterday|YYYY-MM-DD|session] [--session ID]` imports available local Codex history into ignored project activity. The default is `all`. It starts a local `codex app-server`, initializes the protocol, pages active and archived `thread/list` results and reads eligible threads with `thread/read`. No thread is resumed and no model turn is started. Codex must be on PATH and able to access its local state under its normal permissions and `CODEX_HOME`.

Thread metadata is used to match the canonical project root, including existing subdirectories. Nested repositories and other worktrees are separate projects. Unrelated thread contents are never requested. Forked threads (which contain copied history), spawned subagents, active turns, undated items, hidden reasoning, raw tool output and attachments are excluded. Deleted, moved or remote-only sessions may be unavailable. Assistant reports remain unverified; a structured command exit code establishes only that command's exit status.

Historical requests use turn start time, and final assistant messages/command results use turn completion time. This preserves resumed-session dates, but a turn spanning midnight has no finer item timestamps. Repeated imports and matching hook captures deduplicate by source identity and redacted content. Imports rescan eligible threads to pick up appended turns and retry previously unreadable ones. Unknown or unreadable data is reported; existing evidence is retained.

The JSON result includes resolved `period`, `status` (`complete`, `partial`, `unavailable`), `threadsRead`, `imported`, `duplicates`, skipped counts and `limitations`. `complete` describes the scan, not complete-day coverage. The latest result is stored in `.did-stuff/history/latest.json` and shown by `doctor`. Explicit `history` exits nonzero on partial/unavailable reads. Each request has a 15-second timeout; scanning stops between requests after 45 seconds. Oversized responses above 32 MiB are rejected with a limitation.

`configure --history false` disables automatic sync; `configure --history true` re-enables it. Explicit `history` still works when auto-sync is off. `disable` controls hooks and exit recaps only. No history work runs in lifecycle hooks.

## Capture

`capture --from hook.json` accepts the documented Codex hook object. Automatic entry point is `hook.js` on stdin. Required fields are `cwd`, `session_id`, `hook_event_name`; turn IDs are optional. Stop requires `last_assistant_message`. UserPromptSubmit requires `prompt`. PostToolUse recognizes Bash `tool_input.command` and `tool_response`; structured numeric `exit_code` is observed, raw verification stdout is reported. Other response formats are skipped. No transcript is read.

`record --session ACTUAL_ID --from note.json` persists already-visible current-session context:

```json
{"description":"Started the retry change; test failed and the change was reverted.","turnId":"optional-real-id","activityAt":"2026-10-13T10:00:00Z","references":["visible-result-reference"]}
```

Omit activityAt when unknown. Manual descriptions always remain reported; a reference does not promote them to independently verified outcomes. Never persist credentials or hidden reasoning. Deduplication hashes project, session, turn, kind, source discriminator and redacted description. Without a turn ID, identical descriptions within one session deduplicate conservatively.

## Gather and save

`evidence --format recap|standup|tweet --period today|yesterday|YYYY-MM-DD|session [--session ID] [--no-history]` initializes missing configuration and syncs history for the requested selection by default. It returns activities, resolved period, timezone, language, coverage, limitations, history sync result, and supporting Git context. It does not write prose or start an agent. If history is unavailable, existing evidence is still returned with that limitation. A period filters each activity timestamp in the configured timezone. `--no-history` skips the sync without hiding previously imported evidence.

`save --from draft.json` validates full source IDs against the project and requested period:

```json
{"format":"recap","period":"2026-10-13","content":"- Reported fixing duplicate retries; deployment remains pending.","sourceIds":["full-id-returned-by-evidence"]}
```

For session periods include `"sessionId":"actual-id"`. Optionally include `language`. For tweets replace content with exactly three `posts` strings (progress, lesson, problem solved). Each post must be at most 280 Unicode characters; internal paths and links are rejected. The agent remains responsible for supported claims, public-name removal and audience-appropriate wording. Helper validation cannot establish that arbitrary prose matches its sources.

Successful save returns `path`, `draftId`, `markdown`, `coverage`, and `limitations`. Markdown and a JSON sidecar carry provenance; sources stay separate from public text. Empty selections always save a “No captured activity found” result. Files are unique and never overwrite earlier manual drafts.

`render --period PERIOD [--no-history]` syncs history by default and prints a deterministic recap without a model. `exit --session ACTUAL_ID` exercises the same bounded saver as SessionEnd and reports elapsed milliseconds, without syncing history. Neither helper claims to create polished agent-powered prose.
