-- Additive serialization compatibility boundary;no new table or player-data
-- rewrite. Exact migration-manifest readiness rejects recipe-unaware builds
-- whose older strict workflow schema cannot read newly persisted recipes.
COMMENT ON COLUMN engine_hospitality_orders.workflow IS
 'Versioned immutable service workflow;optional ingredient recipes require a recipe-aware API. Preserve data and close the world on compatible code;do not downgrade to a pre-0038 migration manifest.';
