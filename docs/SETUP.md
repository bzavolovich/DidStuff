# Setup

The [README](../README.md) covers native plugin installation and manual summaries. History imports work without hooks. Codex CLI must be on `PATH` and able to read its local state.

## Standalone skill and automatic recaps

For automatic capture and recaps on normal CLI exit, use the standalone installation path tested in the [verification report](VERIFICATION.md):

```sh
git clone https://github.com/bzavolovich/DidStuff.git
node ./DidStuff/dist/cli.js install --hooks --project /absolute/path/to/your-project
```

Prebuilt JavaScript is included; no build is required. Omit `--hooks` for manual-only installation. Restart Codex in the target project and review/trust the handlers through `/hooks`. Invoke the standalone skill as `$did-stuff recap today`.

Choose either the native plugin or standalone skill for a project. With the native plugin, optional capture requires running the checkout helper’s `init` and `enable` commands for each project and reviewing `/hooks`. Native plugin hook discovery was verified; the complete coding/exit workflow was tested through standalone installation. Crashes and forced termination do not guarantee an exit recap.

## Configuration and troubleshooting

Run these from your project, replacing `/path/to/DidStuff` with the checkout path:

```sh
node /path/to/DidStuff/dist/cli.js doctor
node /path/to/DidStuff/dist/cli.js history --period all
node /path/to/DidStuff/dist/cli.js configure --timezone Europe/Moscow --language English
node /path/to/DidStuff/dist/cli.js configure --history false
node /path/to/DidStuff/dist/cli.js disable
```

`doctor` shows storage, configuration and history sync status. `disable` stops hook capture and exit recaps; `enable` restores them. History syncing is controlled separately by `--history true|false`.

If the skill is missing, restart Codex. If automatic capture is missing, check `/hooks`. If history is empty, inspect the sync status: active, undated, forked, deleted or remote-only sessions may be unavailable. See [helper contracts](HELPERS.md) for details.

## Removal

For the native plugin, disable automation in each configured project, then run:

```sh
codex plugin remove did-stuff@did-stuff-local
codex plugin marketplace remove did-stuff-local
```

For the standalone skill:

```sh
node /path/to/DidStuff/dist/cli.js uninstall --project /absolute/path/to/your-project
```

Removal preserves `.did-stuff/` activity and drafts. Standalone removal also preserves unrelated hooks and edited skill files.
