# ADR0099 — Network-disabled candidates and compatible API recovery

Status: accepted for offline M23-02 implementation;actual drill outcomes are recorded separately.

Cached M21 images contain36 migrations. Current code contains38,including the strict recipe reader boundary,so neither a cached tag nor a successful historical rollback certifies current code. A fresh ordinary Dockerfile build would require unavailable base/install network work contrary to the offline scope.

Use the inspected cached image only as an external-dependency base. Reject changed external versions or lockfile dependency graphs;verify selected source hashes against the requested commit. Overlay curated compiled outputs after removing old compiled trees,retain nonroot runtime,create workspace aliases and validate all copied hashes/imports/38migrations inside a network-none container. No environment,original source checkout,data archive or host dependency directory enters the new context.

Select a genuinely earlier38-compatible API/package source revision3a2de59 for rollback,compiled independently with the same external graph. Keep the current web artifact fixed and record that limitation. The rehearsal refuses a36image before stack mutation,backs up and restores actual38 data on empty disposable PostgreSQL,then exercises failed canary/stop/compatible API rollback/roll-forward on a loopback TLS production-mode stack with all worlds closed. Gameplay/report/block acceptance remains separate isolated test-profile evidence because production correctly rejects local installers.

No schema downgrade,public deployment,real staffing or image-distribution approval results. Cached development dependencies/old source layers remain an image-hardening and supply-chain review gate. A same-manifest check is necessary but not a general proof of every old consumer contract;the exercised paths and failures must remain explicit.
