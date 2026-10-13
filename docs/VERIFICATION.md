# v0.1.0 verification

Environment: macOS, Node 22.17.0, npm 10.9.2, Codex CLI **0.162.1**, 2026-10-13. Existing Codex authentication was used; Did Stuff has no API-key configuration. No personal session history or credentials are included in release artifacts.

## Inside Codex

1. Installed the standalone skill and four hooks into a disposable Git project.
2. Used the normal project trust and hook-review UI; no bypass flags or trust-store edits.
3. Completed a retry implementation and two real tests. Confirmed UserPromptSubmit and Stop records, including the recorded remaining test gaps.
4. Used normal `/exit`; confirmed session and daily Markdown with separately stored evidence metadata.
5. Reopened Codex and invoked **`$did-stuff standup today`**, then **`$did-stuff tweet today`**. Both displayed supported text and saved Markdown plus provenance. Three post counts were 141, 194 and 167. Independent execution of the actual tests passed.
6. Confirmed those two manual writing turns did not add activity records.
7. Disabled and uninstalled the integration; checked unrelated hook/configuration and saved drafts remained.
8. Reinstalled the updated adapter and completed an additional real coding turn: first/third success cases, four tests passing. Verification stdout was captured as reported; no structured exit status was fabricated.

The unrelated hook added for the preservation check intentionally printed invalid Stop output and produced its own host warning in the follow-up run. Did Stuff’s hook still returned `{}` and captured the completed turn. It does not suppress or change unrelated hooks.

## Native package checks

In an isolated Codex home, the actual CLI accepted:

```text
codex plugin marketplace add <checkout> --json
codex plugin add did-stuff@did-stuff-local --json
codex plugin list --json
```

Read-only app-server `skills/list` returned the actual name **`did-stuff:did-stuff`** with enabled=true; `hooks/list` discovered bundled lifecycle hooks. Installation/removal were tested. A portable root manifest exposed the skill but omitted hooks on this installed version; the final package uses only the supported `.codex-plugin/plugin.json` compatibility layout.

The complete interactive coding/capture/exit/writing flow was tested with standalone installation. A separate real `$did-stuff:did-stuff recap today` invocation through `codex exec --sandbox workspace-write` displayed and saved a supported recap, reconciled the earlier test gap with later work, and distinguished captured test stdout from assistant-reported exit status. A read-only attempt correctly reported no saved copy. Native plugin hook execution was not independently live-tested; discovery is the verified boundary. Desktop, IDE, Windows, other host versions, and cloud surfaces remain unverified.

## Focused tests

`npm test` covers multiple sessions, duplicate delivery, resumed sessions/local midnight, weekend yesterday, DST date interpretation, empty periods, malformed/missing/oversized input, failed/unfinished actions, fake success in stdout, own-summary exclusion, concurrent immutable writes, interrupted temporary files, dead-process lock recovery, redaction, repeated/concurrent exits, edited automatic drafts, unique manual drafts, source-ID checks, character counts, project isolation and unrelated-setting preservation.

Ordinary exit benchmark: 30 records, real hook subprocess including Node startup, **79–89 ms** on this machine. The automated threshold is one second. Deterministic exit saving has a 650 ms read/processing budget and a one-second host timeout; large datasets may skip exit saving while retaining all activity. No network or model calls occur in the hook.

`npm run check` validates TypeScript. The bundled skill-creator validator passed after installing its PyYAML prerequisite in a temporary environment. Prebuilt runtime and standalone installation from the release archive are checked before publication. Fixture tests establish edge-case behavior; the live run establishes the specifically listed host behavior.
