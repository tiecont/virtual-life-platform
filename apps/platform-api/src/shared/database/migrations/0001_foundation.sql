CREATE TABLE platform_metadata (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_metadata(singleton, schema_version) VALUES (true, 1);
