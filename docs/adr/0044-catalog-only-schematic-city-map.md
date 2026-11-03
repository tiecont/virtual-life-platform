# ADR0044 — Catalog-only schematic pixel city

Status: locally verified; evidence m14-map-checks.json.

The home page previously provided readiness only and claimed no travel existed. It now preserves actual readiness and adds original SVG pixel-town navigation. The art is code-authored, static and decorative, not authoritative room geometry. Provenance identifies its source component and keeps release approval false; no external artwork, raster generator or rights assignment is involved.

Hotspots come exclusively from the authenticated versioned world catalog. No real-world placeholders, hidden dating destination, peer identity or live occupancy is invented. Each link carries the exact slug/availability and focuses its matching native-list heading. Available places link to existing guarded cafe/travel flows; closed/offline metadata does not offer entry. Seeing a catalog place never grants admission or reserves capacity.

The four current local fixtures all use(.5,.5). A deterministic slug-ordered nearest-free plot allocation keeps their markers distinct. The map is schematic; server coordinates are a display preference, not a physical city claim. Twelve static slots bound map density, while all up to100 approved catalog entries remain in the native list. Overflow is explicitly described. Duplicate/malformed catalog entries fail closed.

Catalog reads are no-store, timed/abortable, and clear previous metadata before refresh. Logout/identity replacement cancels old reads; a delayed old response cannot repopulate the map. Offline/error states remove hotspots/list and offer retry without a successful-looking stale catalog. No proof or private inventory enters URLs/storage. Fragments contain only approved world slugs.

Native links/list/headings support keyboard navigation; markers retain44pixel targets across the tested desktop/mobile viewports, with no animation. Browser acceptance uses actual approved synthetic catalogs and real cafe entry/identity. Live occupancy/schedules, shared header, route preselection/failure UX and activity ranking remain M14-02..05. No API/schema/migration/backend behavior changes in this slice; prior M13-05 full311integration baseline remains separate from this UI verification.
