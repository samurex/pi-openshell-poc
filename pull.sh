#!/usr/bin/env bash
# Copy pi's edits back out of the sandbox for manual review.
# Usage: ./pull.sh [project-path] [dest]
#   project-path  host project path Zed opened (default: $PWD)
#   dest          where to download (default: <project>.sandbox-copy next to it)
set -euo pipefail
SANDBOX="${OPENSHELL_SANDBOX:-pi}"
SANDBOX_BASE="${SANDBOX_BASE:-/tmp/w}"
PROJECT="$(cd "${1:-$PWD}" && pwd)"
DEST="${2:-${PROJECT}.sandbox-copy}"

mkdir -p "$DEST"
echo "downloading $SANDBOX:$SANDBOX_BASE$PROJECT -> $DEST"
openshell sandbox download "$SANDBOX" "$SANDBOX_BASE$PROJECT" "$DEST"
# download may nest the folder like upload does; normalise
[ -d "$DEST/$(basename "$PROJECT")" ] && echo "(files are in $DEST/$(basename "$PROJECT"))"
echo "review with: diff -ru --exclude=.git --exclude=node_modules \"$PROJECT\" \"$DEST\""
