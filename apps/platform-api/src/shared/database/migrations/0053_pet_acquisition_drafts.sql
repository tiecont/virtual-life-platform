-- Canonical v3.1 acquisition metadata only; no ownership, purchase or publication.
CREATE TABLE pet_acquisition_drafts (
 id uuid PRIMARY KEY,
 content_version text NOT NULL CHECK (content_version='3.1'),
 schema_version integer NOT NULL CHECK (schema_version=3),
 ruleset text NOT NULL CHECK (ruleset='pet-arena-pve-v3'),
 source_hash text NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
 content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 upstream_hash text NOT NULL CHECK (upstream_hash ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'DRAFT_ONLY' CHECK (state='DRAFT_ONLY'),
 enabled boolean NOT NULL DEFAULT false CHECK (NOT enabled),
 publish_allowed boolean NOT NULL DEFAULT false CHECK (NOT publish_allowed),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE pet_acquisition_maps (
 draft_id uuid NOT NULL REFERENCES pet_acquisition_drafts(id),
 map_id text NOT NULL CHECK (map_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
 element text NOT NULL CHECK (element IN ('normal','fire','water','grass','electric','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy','light')),
 PRIMARY KEY(draft_id,map_id), UNIQUE(draft_id,element), UNIQUE(draft_id,map_id,element)
);
CREATE TABLE pet_acquisition_species (
 draft_id uuid NOT NULL REFERENCES pet_acquisition_drafts(id),
 species_id text NOT NULL CHECK (species_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
 display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 64 AND display_name=btrim(display_name)),
 element text NOT NULL,
 race text NOT NULL CHECK (race IN ('beast','dragonkin','spirit','celestial','demon','avian','flora','aquatic','undead','construct','machine','slime','insectoid','mythborn','humanoid','elemental','fungal','arthropod','amorphous','crystalborn','living_artifact','cephalopod')),
 body_plan text NOT NULL CHECK (body_plan IN ('quadruped','floating','insectoid','serpentine','avian','humanoid','golem','plant','slime','spectral','amorphous','mechanical','centaur','aquatic','radial','hexapod')),
 rig text NOT NULL,
 legacy_rarity text CHECK (legacy_rarity IN ('common','uncommon','rare','epic','legendary')),
 rank text NOT NULL CHECK (rank IN ('B','A','S')),
 source text NOT NULL CHECK (source IN ('map_regular','map_legendary','limited_event_gacha','standard_gacha')),
 map_id text,
 required_unique_wins integer NOT NULL,
 signature_card text CHECK (signature_card ~ '^[a-z][a-z0-9_-]{0,63}$'),
 awakening_enabled boolean NOT NULL,
 PRIMARY KEY(draft_id,species_id),
 FOREIGN KEY(draft_id,element) REFERENCES pet_acquisition_maps(draft_id,element),
 FOREIGN KEY(draft_id,map_id,element) REFERENCES pet_acquisition_maps(draft_id,map_id,element),
 CHECK (rig=CASE body_plan WHEN 'quadruped' THEN 'rig_q4' WHEN 'floating' THEN 'rig_float' WHEN 'insectoid' THEN 'rig_insect' WHEN 'serpentine' THEN 'rig_serpent' WHEN 'avian' THEN 'rig_avian' WHEN 'humanoid' THEN 'rig_humanoid' WHEN 'golem' THEN 'rig_heavy' WHEN 'plant' THEN 'rig_flora' WHEN 'slime' THEN 'rig_soft' WHEN 'spectral' THEN 'rig_spectral' WHEN 'amorphous' THEN 'rig_soft' WHEN 'mechanical' THEN 'rig_machine' WHEN 'centaur' THEN 'rig_centaur' WHEN 'aquatic' THEN 'rig_aquatic' WHEN 'radial' THEN 'rig_aquatic' WHEN 'hexapod' THEN 'rig_insect' END),
 CHECK (CASE source
  WHEN 'map_regular' THEN rank IN ('B','A') AND map_id IS NOT NULL AND required_unique_wins=3 AND signature_card IS NULL AND NOT awakening_enabled
  WHEN 'map_legendary' THEN rank='S' AND map_id IS NOT NULL AND required_unique_wins=5 AND signature_card IS NULL AND NOT awakening_enabled
  WHEN 'limited_event_gacha' THEN rank='S' AND map_id IS NULL AND required_unique_wins=0 AND signature_card IS NOT NULL AND awakening_enabled
  WHEN 'standard_gacha' THEN rank='S' AND map_id IS NULL AND required_unique_wins=0 AND signature_card IS NULL AND awakening_enabled END)
);
CREATE UNIQUE INDEX pet_acquisition_species_name ON pet_acquisition_species(draft_id,lower(display_name));
CREATE UNIQUE INDEX pet_acquisition_map_legendary ON pet_acquisition_species(draft_id,element) WHERE source='map_legendary';
REVOKE ALL ON pet_acquisition_drafts,pet_acquisition_maps,pet_acquisition_species FROM PUBLIC;
