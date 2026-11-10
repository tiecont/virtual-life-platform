-- Synthetic expand-only compatibility fixture; never a production migration.
CREATE TABLE vnext_compat_probe(id integer PRIMARY KEY, marker text NOT NULL);
INSERT INTO vnext_compat_probe VALUES(1,'synthetic-expand');
