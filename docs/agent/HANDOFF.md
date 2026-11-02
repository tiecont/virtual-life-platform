# Session handoff

- Current wave W0; AUD-01..08, M00-01..05 and M01-01..06 VERIFIED for local/offline scope. See task-state.json and PROGRESS.md; no public release.
- Implementation commit c7ec45b9ffb2c5643890fd5a3db6787f3758c556, branch main. Checkpoint commit follows; git log -1 identifies it.
- Owner explicitly requested offline code only; remote creation later. No remote/PR/hosted CI/publication attempted. M01-05 local acceptance documented in ADR 0002; remote settings NOT_RUN.
- Last full checks: pnpm check → 0 (7 governance/boundary + 6 unit + 3 PG integration), E2E → 0 (2 desktop/mobile), fresh source offline frozen install → 0, README dev startup smoke → 0.
- Both legacy working trees remain independent/dirty; do not alter them. No legacy .env read/copied. City ignored .env generated for local DB only; dev DB stopped retaining volume.
- Next exact action: read plans/02-architecture-boundaries.md and implement/verify M02 deliverables, then M03 identity. Never skip DAG gates. Read apps/portal-web/AGENTS.md and relevant node_modules/next/dist/docs before web changes; Next dev generated that instruction file.
- Known risks: incomplete legacy gameplay; unknown redistribution licenses; hosted CI/production gates not run. All worlds OFF. Original status-page CSS only, no production art claims.
