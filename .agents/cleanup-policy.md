# Local cleanup policy (Aetheria workstation)

Incident: on 2026-11-28 around 18:45 +07 a local cleanup deleted
`artifacts/private-workspace` (909 files, 215 directories) together with several
build trees. Nothing was in Trash, `/home` has no btrfs snapshots, and the
directory is gitignored, so the canonical art masters stored there are gone.
`~/Projects/Aetheria-Workspace` is a symlink to that directory and is used by the
character and 3D skills.

## Restore path

Most of this workspace is published to the public pet CDN and recorded in
`specs/pet-arena/mvp-wave1-cdn-assets.json`:

```sh
pnpm cdn:pull:dry   # what is missing or hash-mismatched
pnpm cdn:pull       # restore missing files, verify sha256 + size
```

`pnpm assets:pull` does **not** cover this data — it replays `assets/manifests/*`
into the assets cache for a different pipeline. R04 jewel masters and any art
that was never uploaded stay unrecoverable; see
`artifacts/private-workspace/r04-jewels/STATUS.md`.

## Charakuru kit

The kit is a GitHub release extracted into the workspace, so it can always be
rebuilt; only its project files are irreplaceable.

```sh
ws="$HOME/Projects/Aetheria/artifacts/private-workspace/tools/charakuru"
ver=charakuru-1.1.1-2026-11-02T09-36-05-842Z
mkdir -p "$ws" && cd "$ws"
curl -L -o "$ver.zip" "https://github.com/nanocle/Charakuru/releases/download/v1.1.1/$ver.zip"
unzip -q "$ver.zip" && ln -sfn "$ver" current
python3 - "$ws/$ver" <<'PY'
import json,hashlib,os,sys
root=sys.argv[1]; m=json.load(open(os.path.join(root,'RELEASE-MANIFEST.json')))
bad=[f['path'] for f in m['files'] if hashlib.sha256(open(os.path.join(root,f['path']),'rb').read()).hexdigest()!=f['sha256']]
print('files',len(m['files']),'bad',len(bad)); raise SystemExit(1 if bad else 0)
PY
systemctl --user restart charakuru.service && curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8766/
```

Version 1.1.1 is the latest release. The user unit
`~/.config/systemd/user/charakuru.service` must keep
`WorkingDirectory=/home/tiecont/Projects/Aetheria-Workspace/tools/charakuru/$ver`.

## Rules

1. Never `rm -rf` anything under `artifacts/private-workspace/`. It holds
   canonical, non-rebuildable provider masters (R04 jewels, pet concepts,
   character VRM exports, Charakuru kit installs).
2. Before deleting any path inside the repository, run
   `.agents/bin/check-cleanup-target.sh <path>`. A non-zero exit means the path is
   protected or referenced by `config/`, `specs/`, `scripts/` or `.agents/` and
   needs owner review first.
3. `artifacts/` is gitignored. Anything that must survive belongs somewhere with a
   backup (source-controlled `assets/source/`, or the external SSD with a copy).
   Build output, campaign logs and scratch worktrees may live here; masters may not.
4. Live campaign directories (`artifacts/campaign-v4/` and the current wave
   directory) are in use by running agents. Do not delete them mid-run.
5. Deleting a directory that is the target of a symlink leaves a dangling link.
   Check with `find ~ -maxdepth 2 -xtype l` before and after any bulk cleanup.

## Protected paths

- `artifacts/private-workspace/` (all of it)
- `~/Projects/Aetheria-Workspace`, `~/Aetheria-Workspace` (symlinks)
- `artifacts/wave-d4-art/`, `artifacts/wave-d4-functional-gems/`
- `artifacts/campaign-v4/` while a campaign is running
- `specs/`, `config/development-plan.json`, `.agents/skills/`
- `Projects/Aetheria/.git`, `Unity/Hub/Editor/6000.3.14f1` (project editor)

## Recovery references

- `artifacts/private-workspace/r04-jewels/STATUS.md` — required hashes for the
  lost jewel masters.
- `artifacts/private-workspace/mvp-wave1/review/README.md` — what was rebuilt and
  from where.
