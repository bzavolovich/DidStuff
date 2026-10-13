# Did Stuff

**You did stuff. Here’s what.**

Turn your local Codex project sessions into recaps, standup updates, and tweet drafts. Past sessions, including archived ones, are imported automatically—no prior setup needed.

## Install

Requires Codex CLI, Node.js 20+, and Git. Tested with Codex CLI 0.162.1 on macOS.

```sh
codex plugin marketplace add bzavolovich/DidStuff --ref main
codex plugin add did-stuff@did-stuff-local
```

Restart Codex and open your project.

## Use

```text
$did-stuff:did-stuff recap today
$did-stuff:did-stuff recap session
$did-stuff:did-stuff standup yesterday
$did-stuff:did-stuff tweet today
```

You can also specify a date (`YYYY-MM-DD`) or request another language.

Drafts and evidence stay in the project’s ignored `.did-stuff/` directory; Markdown saves to `.did-stuff/drafts/`. Writing uses your current Codex agent—no extra API key. Nothing is published.

Summaries cover available project activity, not your entire day. Evidence enters your agent’s model context; review drafts before sharing.

[Setup, optional hooks & removal](docs/SETUP.md) · [Helpers](docs/HELPERS.md) · [Demo](docs/DEMO.md) · [Verification](docs/VERIFICATION.md) · [Changelog](CHANGELOG.md)

MIT licensed.
