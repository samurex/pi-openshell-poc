# pi in NVIDIA OpenShell, driven from Zed over ACP (POC)

```
Zed ──stdio/ACP──> pi-acp-openshell.mjs (host proxy)
                     │  openshell sandbox exec -n pi --no-tty -- pi-acp-start
                     ▼
              OpenShell sandbox "pi"  (image pi-agent:local)
                pi-acp ──> pi --mode rpc ──> opencode.ai (only allowed host)
```

The proxy:
- uploads the project into the sandbox on `session/new`. The upload happens once per project and lands at `/tmp/w<host path>`, because host paths aren't writable in the sandbox.
- rewrites that path prefix in both directions, so Zed links point at your real files.

pi's edits stay **inside the sandbox**. Use `pull.sh` to get them out.

## Prereqs

- Docker Desktop running
- OpenShell: `curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh`, then `openshell status`
- An opencode key in `~/.pi/agent/auth.json` (from `pi /login`) or `OPENCODE_API_KEY`

## Setup

```sh
./setup.sh
```

## Zed

Add this to Zed's `settings.json`:

```json
"agent_servers": {
  "pi (OpenShell)": {
    "type": "custom",
    "command": "/absolute/path/to/pi-openshell-poc/pi-acp-openshell.mjs",
    "args": [],
    "env": {}
  }
}
```

Open the agent panel, pick **pi (OpenShell)**, and ask it to create a file.
Logs: `$TMPDIR/pi-acp-openshell.log` (`node -p os.tmpdir()`).

Env knobs (set them in `env` above):

| Variable | Default | Purpose |
|---|---|---|
| `OPENSHELL_SANDBOX` | `pi` | which sandbox to use |
| `SANDBOX_BASE` | `/tmp/w` | where projects land in the sandbox |
| `FORCE_UPLOAD` | unset | `1` re-uploads the project, overwriting pi's edits |
| `OPENSHELL_BIN` | `openshell` | path to the CLI, if Zed's PATH lacks it |

## Getting edits back

```sh
./pull.sh /path/to/project            # -> /path/to/project.sandbox-copy
diff -ru --exclude=.git /path/to/project /path/to/project.sandbox-copy
```

## Debug

```sh
openshell sandbox exec -n pi --tty -- bash        # poke around
openshell logs pi --tail                           # incl. denied network calls
openshell policy get pi --full
```

## Cleanup

```sh
openshell sandbox delete pi
```
