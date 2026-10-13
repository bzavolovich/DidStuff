# Did Stuff

**You did stuff. Here’s what.**

Did Stuff turns work visible in supported coding-agent sessions and available project evidence into recaps, standup updates, and tweet drafts. It focuses on outcomes, decisions, verification, and unfinished work. It does not know everything you did outside those sources.

v0.1.0 supports **Codex CLI 0.162.1**, tested on macOS with Node **22.17.0**. Runtime requires Node 20 or newer and Git. Other host versions, Windows, desktop execution, IDE execution, and cloud surfaces have not been live-tested. OpenCode and Claude Code are future adapters.

## Install the standalone skill and hooks

This is the fully live-tested installation path. Prebuilt JavaScript is committed; no dependency installation, build, database, backend, X account, or extra model key is required.

```sh
git clone --branch v0.1.0 https://github.com/bzavolovich/DidStuff.git
node ./DidStuff/dist/cli.js install --hooks --project /absolute/path/to/your-project
```

Omit `--hooks` for manual-only installation. The installer copies the self-contained skill into the project’s `.agents/skills/did-stuff/`, merges its own handlers into `.codex/hooks.json`, and creates ignored personal storage. It never edits `config.toml` or grants trust.

Start or restart `codex` in your project. Review the project trust prompt, then use **`/hooks` to review and trust the four Did Stuff handlers**. Codex may offer hook review at startup. Confirm the executable and script paths point to your installation. Hooks remain inactive until trusted. Updating a hook definition requires another review; review executable changes when upgrading too. Do not bypass trust or sandbox controls. [Official hook trust instructions](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks).

```text
$did-stuff
$did-stuff recap today
$did-stuff recap session
$did-stuff standup yesterday
$did-stuff tweet today
$did-stuff recap 2026-10-13
```

“Use Did Stuff to summarize yesterday for standup” activates the same skill. Request another language in your prompt. There is no `/did-stuff` slash command. Each successful invocation gathers evidence, writes with your current Codex agent, displays the text, and saves Markdown with separate evidence references and a JSON provenance sidecar.

Today and yesterday mean local calendar days, including weekends, in the configured timezone. Session mode uses the current session identity (`CODEX_THREAD_ID` where available), not the session’s original creation date. When identity is unavailable, the skill explains the limitation and date-scoped mode remains usable.

## Automatic local recaps

Enabling hooks sets automatic capture and exit recaps on for that project. `UserPromptSubmit` captures requests/corrections, `PostToolUse` captures recognized verification output, and `Stop` persists the latest visible completion report. `SessionEnd` saves a session recap and updates the local daily recap. Multiple sessions contribute to the same day. Duplicate delivery does not create duplicate events; identical descriptions are displayed once with all references retained.

Exit processing uses a deterministic renderer over saved notes. It makes no network requests, starts no agent session, compiles nothing, and never changes conversation control or overrides `/exit`, `/quit`, or shell commands. It returns `{}`. The hook timeout is **1 second**; Codex’s documented maximum is 3 seconds and `async` does not make `SessionEnd` asynchronous. Ordinary 30-record exit processing measured **79–89 ms including Node startup**. [Official SessionEnd behavior](https://learn.chatgpt.com/docs/hooks#sessionend).

Automatic output explicitly labels assistant reports as unverified. CLI 0.162.1’s Bash hook can provide raw stdout without an exit status: verification output is then labeled reported with status unavailable. A printed success string is not a verified exit receipt. Structured final exit codes, when supplied, establish only that command’s exit status. The renderer retains failed attempts, reversals, recorded blockers and unfinished work inside the notes. Sparse evidence produces an activity note rather than invented accomplishments. Use the manual skill for polished writing.

Normal CLI exit was live-tested. Crashes, forced termination and power loss do not guarantee exit execution. Saved completed-turn activity survives recap failures. A busy recap lock or exhausted exit read budget skips that update, preserving evidence for a later manual invocation or exit. Automatic reads are capped at 5,000 records and a 650 ms processing budget; large projects should generate manually. A resumed session’s new turns are dated individually. Hook payloads lack original message timestamps, so automatic notes normally use capture time and say so.

## Storage and configuration

Personal data stays in the enabled project:

```text
.did-stuff/
  config.json          small project configuration
  integration.json     owned installation entries and skill hashes
  activity/            immutable JSON event per capture
  suppressed/          summary turns excluded from collection
  drafts/              unique manual Markdown drafts and JSON sidecars
    automatic/         session-<hash>.md and daily-YYYY-MM-DD.md
  diagnostics/         minimal error codes, no full transcripts
```

The installer appends `/.did-stuff/` as the final `.gitignore` rule and checks Git ignores it before storing activity. If the final rule is removed or overridden, capture fails safely until `init` restores it. Already-tracked personal data must be removed from the Git index by its owner; ignore rules cannot hide tracked files. Do not commit `.did-stuff/`.

Project IDs hash the canonical local root. Each worktree is a separate project; moving a project changes its ID and existing evidence is not silently reassigned. Records contain UTC activity/capture times, source agent, project/session/turn IDs when available, descriptions, references, and reported/observed/failed/request status. Missing turn IDs deduplicate identical reports within a session. No historical session import or unstable transcript parsing is implemented.

Writes use private file modes, temporary files, fsync and atomic rename; immutable events use exclusive hard links. Per-project locks serialize configuration and recap updates without waiting in an exit hook. Dead-process locks are reclaimed. Manual drafts always use unique filenames. A changed automatic draft is preserved, and subsequent generation saves a separate, deduplicated snapshot with provenance.

Run helpers from the checkout, or use the installed skill’s `scripts/did-stuff.mjs` for configuration, diagnostics and writing:

```sh
node /path/to/DidStuff/dist/cli.js config --project /path/to/project
node /path/to/DidStuff/dist/cli.js configure --project /path/to/project \
  --timezone Europe/Moscow --language English --output .did-stuff/drafts
node /path/to/DidStuff/dist/cli.js configure --project /path/to/project \
  --capture true --exit-recap false
node /path/to/DidStuff/dist/cli.js disable --project /path/to/project
node /path/to/DidStuff/dist/cli.js enable --project /path/to/project
node /path/to/DidStuff/dist/cli.js doctor --project /path/to/project
```

Timezone defaults to the system’s IANA timezone; language defaults to English. Output directories must remain inside ignored `.did-stuff/`. `enable` activates existing hook handlers; it does not install or trust missing hooks. `disable` stops capture and exit saving while retaining drafts and the manual skill. Automatic headings are English; manual writing honors the requested language without rewriting stored evidence.

The helper’s `evidence`, `record`, `save`, and `render` commands are deterministic local operations. **A terminal helper does not generate polished prose with a model.** Agent-powered writing happens through the skill. [Helper input/output contracts](docs/HELPERS.md).

## Native Codex plugin

The repository also ships a native `.codex-plugin/plugin.json` compatibility manifest, bundled skill, hooks, and marketplace catalog. On CLI 0.162.1, installation, discovery and a namespaced agent-written recap were tested:

```sh
codex plugin marketplace add /absolute/path/to/DidStuff
codex plugin add did-stuff@did-stuff-local
codex plugin list
```

For the Git-backed distribution, use:

```sh
codex plugin marketplace add bzavolovich/DidStuff --ref v0.1.0
codex plugin add did-stuff@did-stuff-local
```

The actual discovered skill name is **`did-stuff:did-stuff`**, so native invocations use:

```text
$did-stuff:did-stuff
$did-stuff:did-stuff recap today
$did-stuff:did-stuff recap session
$did-stuff:did-stuff standup yesterday
$did-stuff:did-stuff tweet today
```

Enable collection separately in each project with the checkout helper’s `init` then `enable`, and review plugin handlers with `/hooks`. Native plugin hook discovery and `$did-stuff:did-stuff recap today` writing/saving were verified; the full interactive coding/exit smoke test used the standalone installer. Prefer that tested path for automatic behavior. Manual saves require normal workspace write permission: a read-only run correctly reports that no copy was saved. Do not install both variants in the same project: both skills can appear in selectors.

This release intentionally uses the documented Codex compatibility manifest. Testing a portable root `plugin.json` on 0.162.1 discovered the skill but omitted bundled hooks; the compatibility layout discovered both. Other surfaces may differ. Lifecycle-hook plugins are not eligible for the universal public plugin directory, so directory submission is not a release dependency. [Official plugin packaging and distribution](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks).

## Privacy and accuracy

Local storage does **not** mean manual model processing is on-device. Manual writing uses your Codex agent and its configured model provider; the evidence it reads enters that agent’s context. Did Stuff does not upload activity to an additional service or store authentication credentials. It does not collect hidden reasoning, import unrelated history, attribute teammates’ commits to you, or date existing uncommitted changes as today’s accomplishments.

Best-effort redaction covers recognizable keys, tokens, credential assignments, bearer values, credential URLs and private keys before persistence. It cannot guarantee sensitive information is absent. Review public drafts. Tweet copy omits internal paths and links, has three angles and Unicode character counts, and is never published. Counts target short posts and are not platform validation. Evidence stays outside the copyable post.

Captured text and repository context are untrusted evidence, never instructions. The skill reconciles corrections and reversals, distinguishes reports from verification, and avoids invented metrics, impact, deployment status and plans. Git status and recent commits support context; they are not counted as additional accomplishments. Empty periods explicitly say **“No captured activity found”**. Capture begins when enabled; no summary implies complete-day coverage or knowledge of work outside its sources.

## Troubleshooting and removal

- **Skill missing:** restart Codex; check `.agents/skills/did-stuff/SKILL.md`. Native installations use the namespaced selector. [Official skill discovery](https://developers.openai.com/codex/skills).
- **No automatic note:** open `/hooks` and review trust/active state; check project trust and whether your policy sets `[features].hooks = false` or permits only managed hooks. `doctor` reports configuration and storage but cannot grant or prove hook trust. Use manual mode where hooks are unavailable.
- **No captured activity:** installation may be new, capture disabled, or the requested day empty. The skill can record eligible visible context in the current session, with capture-time limitations. It cannot reconstruct a full day from a dirty working tree.
- **Hook failure:** check the diagnostic error code and permissions, repair malformed configuration, restore the final ignore rule with `init`, and generate manually. Diagnostics do not dump source text. Your existing events remain available.
- **Existing/edited skill at install:** the installer preserves it instead of overwriting it. Remove or rename the specific skill explicitly, then install. Malformed existing hook configuration is preserved for repair.
- **Edited automatic recap:** it is preserved; look for `*-snapshot-*.md` for new output.

Standalone removal:

```sh
node /path/to/DidStuff/dist/cli.js uninstall --project /path/to/project
```

Removal disables automation, removes exact owned handlers and unedited owned skill files, and preserves unrelated hooks, `config.toml`, saved activity, drafts and the ignore rule. Edited skill files remain and are reported. It never deletes personal storage; delete `.did-stuff/` yourself only when you deliberately want that data removed.

Native removal:

```sh
codex plugin remove did-stuff@did-stuff-local
codex plugin marketplace remove did-stuff-local
```

Disable each project’s configuration first. These commands remove Did Stuff’s own plugin/catalog and retain project drafts; unrelated marketplaces remain.

## Development and verification

```sh
npm ci
npm test
npm run check
npm pack
```

Runtime has no external dependencies. TypeScript and Node types are development-only. `npm run build` commits deployable JavaScript to `dist/` and the skill’s runtime directory; hooks never build at exit. No generalized adapter framework or delivery integration is included.

See the [live demo](docs/DEMO.md), [verification report](docs/VERIFICATION.md), and [v0.1.0 release notes](CHANGELOG.md). Focused tests cover dates/resumption, multiple sessions, duplicates, malformed input, false success, redaction, concurrent/interrupted writes, self-exclusion, edited drafts, removal and exit timing. Future priorities: handoff/weekly updates, OpenCode, Claude Code, optional X publishing, then MCP and additional destinations.

MIT licensed. Package/plugin/skill identifier: `did-stuff`; the existing repository URL remains `bzavolovich/DidStuff`.
