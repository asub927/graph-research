#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/publish.sh <path-to-item.md> [commit message]"
  exit 1
fi

FILE="$1"
MSG="${2:-Publish musing: $(basename "$FILE" .md)}"

npm run build
git add "$FILE"
git commit -m "$MSG"
git push
echo "Published $FILE"
