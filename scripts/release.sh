#!/usr/bin/env bash
set -euo pipefail

# Explicit public release for the existing repository; no personal capture directories are staged.
test "$(git branch --show-current)" = main
test "$(node -p 'require("./package.json").version')" = 0.1.0
git add -- .gitignore README.md LICENSE CHANGELOG.md package.json package-lock.json tsconfig.json src dist skills hooks scripts test docs .codex-plugin .agents/plugins/marketplace.json .github/workflows/test.yml
git diff --cached --check
git commit -m "Release Did Stuff v0.1.0"
git push origin HEAD:main
git tag -a v0.1.0 -m "Did Stuff v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 did-stuff-0.1.0.tgz --repo bzavolovich/DidStuff --title "Did Stuff v0.1.0" --notes-file CHANGELOG.md
