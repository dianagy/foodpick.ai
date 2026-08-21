#!/usr/bin/env bash
# One command instead of the ~5-step manual sequence: run the required test
# suites, commit, push. Does NOT run tests/dish-photos.test.mjs (needs real
# network access the dev machine may not have to Wikimedia) and does NOT
# dispatch a deploy -- run `gh workflow run preview.yml --ref <branch>`
# separately once you're ready to publish.
#
#   scripts/ship.sh "commit message"

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: scripts/ship.sh \"commit message\"" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "==> Running pipeline sweep"
node tests/pipeline.test.mjs

echo "==> Running craving-analysis sweep"
node tests/craving-analysis.test.mjs

echo "==> Committing"
git add -A
git commit -m "$1"

branch="$(git rev-parse --abbrev-ref HEAD)"
echo "==> Pushing to origin/$branch"
git push -u origin "$branch"

echo "==> Done. Deploy separately with: gh workflow run preview.yml --ref $branch"
