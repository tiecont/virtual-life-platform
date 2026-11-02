# ADR 0006 — Project name and local repository origin

Status: Owner-directed, 2026-11-02.

Owner named the project `virtual-life-platform` and supplied `git@github.com:tiecont/virtual-life-platform.git`. Root package/manifest/docs and visible web branding now use that project name. Virtual City remains the source product/plan codename; original references, historical evidence, API/cookie/database/package identifiers are preserved to avoid unrelated compatibility/data changes.

Local Git origin is configured to the supplied SSH URL. The prior instruction to code offline remains in effect: no push, fetch, remote API/PR operation, publication or deployment performed. Hosted CI and branch protection remain NOT_RUN. The active workspace directory remains /home/tiecont/Projects/virtual-city to preserve the session environment and artifact links; this does not affect repository/project name.

No schema migration, token reset or legacy modification. Validate frozen install/build and existing responsive browser journeys after metadata/branding changes. A directory move can be done explicitly outside active processes when requested; no directory relocation is implied by changing project identity.
