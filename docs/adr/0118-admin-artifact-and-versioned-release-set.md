# ADR0118: independently runnable admin image and versioned release set

Date:2026-11-06. Status:accepted for local implementation; publishing/deployment remain gated.

N07-02 supplies a separate admin application, so the verified-artifact contract can now include it. Package its Next standalone closure in a separate nonroot runtime using the pinned existing Node/toolchain. Share the exact-origin configuration parser between the BFF and startup. Keep private read credentials at runtime and validate real production browser assets with explicit synthetic build markers.

Release schema1 keeps its strict API/web shape for existing candidates. Schema2 requires exactly API/web/admin, each carrying the same explicit source revision as the source-bound Quality run; no mixed-source or mutable-tag candidate is accepted. Producer, publisher, remote metadata verification and immutable promotion payload allowlists derive their target/file sets from the validated version. Current publishing policy requires schema2, while historical schema1 verification remains possible. Registry authorization, fresh hosted proof and disabled activation gates remain intact.

Existing Kubernetes resources cover API/web only. Bind the complete schema2 manifest hash and retain the two existing transforms; do not implicitly create admin ingress/deployments or expand Git/cluster permissions. Nine immutable release JSON files produce at most eleven promotion edits; schema1 keeps seven/nine respectively. N07-05 must qualify private admin deployment and compatible admin-only rollback separately.

Local image verification uses a disposable private API/database, actual out-of-band synthetic operator CLI, generated-certificate TLS and real browser sessions. The six admin scenarios and API/web checks are executable work and require captured results before task verification. Local registry rehearsals prove OCI mechanics only. No registry publish, GitHub write, real operator or public release is authorized.
