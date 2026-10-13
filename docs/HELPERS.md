# Local helper contracts

All commands run with the current project as cwd or explicit `--project PATH`. `config` and `doctor` inspect active locations. `init` ensures ignored storage; automatic flags initially default false. Exit helpers run only when exit saving is enabled. Manual record/save remain usable with hooks disabled.

## Capture

`capture --from hook.json` accepts the documented Codex hook object. Automatic entry point is `hook.js` on stdin. Required fields are `cwd`, `session_id`, `hook_event_name`; turn IDs are optional. Stop requires `last_assistant_message`. UserPromptSubmit requires `prompt`. PostToolUse recognizes Bash `tool_input.command` and `tool_response`; structured numeric `exit_code` is observed, raw verification stdout is reported. Other response formats are skipped. No transcript is read.

`record --session ACTUAL_ID --from note.json` persists already-visible current-session context:

```json
{"description":"Started the retry change; test failed and the change was reverted.","turnId":"optional-real-id","activityAt":"2026-10-13T10:00:00Z","references":["visible-result-reference"]}
```

Omit activityAt when unknown. Manual descriptions always remain reported; a reference does not promote them to independently verified outcomes. Never persist credentials or hidden reasoning. Deduplication hashes project, session, turn, kind, source discriminator and redacted description. Without a turn ID, identical descriptions within one session deduplicate conservatively.

## Gather and save

`evidence --format recap|standup|tweet --period today|yesterday|YYYY-MM-DD|session [--session ID]` returns activities, resolved period, timezone, language, coverage, limitations, and supporting Git context. It does not write prose or start an agent. It does not import historical sessions. A period filters each activity timestamp in the configured timezone.

`save --from draft.json` validates full source IDs against the project and requested period:

```json
{"format":"recap","period":"2026-10-13","content":"- Reported fixing duplicate retries; deployment remains pending.","sourceIds":["full-id-returned-by-evidence"]}
```

For session periods include `"sessionId":"actual-id"`. Optionally include `language`. For tweets replace content with exactly three `posts` strings (progress, lesson, problem solved). Each post must be at most 280 Unicode characters; internal paths and links are rejected. The agent remains responsible for supported claims, public-name removal and audience-appropriate wording. Helper validation cannot establish that arbitrary prose matches its sources.

Successful save returns `path`, `draftId`, `markdown`, `coverage`, and `limitations`. Markdown and a JSON sidecar carry provenance; sources stay separate from public text. Empty selections always save a “No captured activity found” result. Files are unique and never overwrite earlier manual drafts.

`render --period PERIOD` prints a deterministic recap of captured notes without a model. `exit --session ACTUAL_ID` exercises the same bounded saver as SessionEnd and reports elapsed milliseconds. Neither helper claims to create polished agent-powered prose.
