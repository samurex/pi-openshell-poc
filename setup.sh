#!/usr/bin/env bash
# One-time setup: image, opencode provider, long-lived "pi" sandbox.
set -euo pipefail
cd "$(dirname "$0")"

SANDBOX="${OPENSHELL_SANDBOX:-pi}"
IMAGE="${IMAGE:-pi-agent:local}"

echo "==> building $IMAGE"
docker build -t "$IMAGE" .

echo "==> importing opencode provider profile"
if openshell profile describe opencode >/dev/null 2>&1; then
  openshell profile update -f provider-opencode.yaml opencode || echo "(profile unchanged)"
else
  openshell profile lint -f provider-opencode.yaml
  openshell profile import -f provider-opencode.yaml
fi

if [ -z "${OPENCODE_API_KEY:-}" ]; then
  # Reuse the key from local pi auth (~/.pi/agent/auth.json -> opencode.key)
  OPENCODE_API_KEY="$(node -e 'try{const a=require(process.env.HOME+"/.pi/agent/auth.json");process.stdout.write(a.opencode?.key||"")}catch{}')"
fi
[ -n "$OPENCODE_API_KEY" ] || { echo "OPENCODE_API_KEY not set and not found in ~/.pi/agent/auth.json" >&2; exit 1; }
export OPENCODE_API_KEY

echo "==> creating provider 'opencode'"
if openshell provider get opencode >/dev/null 2>&1; then
  echo "(provider exists)"
else
  openshell provider create --name opencode --type opencode --from-existing
fi

echo "==> creating sandbox '$SANDBOX'"
if openshell sandbox get "$SANDBOX" >/dev/null 2>&1; then
  echo "(sandbox exists; delete it with: openshell sandbox delete $SANDBOX)"
else
  openshell sandbox create --name "$SANDBOX" --from "$IMAGE" --provider opencode \
    --no-auto-providers --detach -- sleep infinity
fi

echo "==> smoke test"
openshell sandbox exec -n "$SANDBOX" --no-tty -- sh -c 'node -v; pi --version; command -v pi-acp; echo "OPENCODE_API_KEY=${OPENCODE_API_KEY:+<set>}"' </dev/null

echo "done. Add the Zed agent_servers entry from README.md."
