-- Metadata drafts only. No runtime selection, publication or player rewards.
CREATE TABLE pet_content_drafts (
 id uuid PRIMARY KEY,
 source_hash text NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
 schema_version integer NOT NULL CHECK (schema_version=2),
 ruleset text NOT NULL CHECK (ruleset='pet-arena-pve-v2'),
 revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
 state text NOT NULL DEFAULT 'draft' CHECK (state='draft'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE pet_content_elements (
 draft_id uuid NOT NULL REFERENCES pet_content_drafts(id),
 element_id text NOT NULL CHECK (element_id IN ('normal','fire','water','grass','electric','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy','light')),
 display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 64),
 PRIMARY KEY(draft_id,element_id)
);
CREATE TABLE pet_content_effectiveness (
 draft_id uuid NOT NULL,
 attacker text NOT NULL,
 defender text NOT NULL,
 permille integer NOT NULL CHECK (permille IN (0,800,1000,1250)),
 PRIMARY KEY(draft_id,attacker,defender),
 FOREIGN KEY(draft_id,attacker) REFERENCES pet_content_elements(draft_id,element_id),
 FOREIGN KEY(draft_id,defender) REFERENCES pet_content_elements(draft_id,element_id)
);
CREATE TABLE pet_content_profiles (
 draft_id uuid NOT NULL REFERENCES pet_content_drafts(id),
 profile_id text NOT NULL CHECK (profile_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
 hp integer NOT NULL CHECK (hp BETWEEN 800 AND 1200),
 attack integer NOT NULL CHECK (attack BETWEEN 800 AND 1200),
 defense integer NOT NULL CHECK (defense BETWEEN 800 AND 1200),
 speed integer NOT NULL CHECK (speed BETWEEN 800 AND 1200),
 CHECK (hp+attack+defense+speed=4000),
 PRIMARY KEY(draft_id,profile_id)
);
CREATE TABLE pet_content_growth (
 draft_id uuid NOT NULL REFERENCES pet_content_drafts(id),
 growth_id text NOT NULL CHECK (growth_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
 per_level_permille integer NOT NULL CHECK (per_level_permille BETWEEN 1 AND 50),
 max_level integer NOT NULL CHECK (max_level=100),
 PRIMARY KEY(draft_id,growth_id)
);
CREATE TABLE pet_content_skills (
 draft_id uuid NOT NULL REFERENCES pet_content_drafts(id),
 skill_id text NOT NULL CHECK (skill_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
 opcode text NOT NULL CHECK (opcode IN ('damage','shield','heal','dot','cleanse','attack_buff','shield_damage','initiative_debuff','resource_mana','damage_and_heal')),
 power_permille integer NOT NULL CHECK (power_permille BETWEEN 0 AND 2000),
 mana_cost integer NOT NULL CHECK (mana_cost BETWEEN 0 AND 100),
 cooldown integer NOT NULL CHECK (cooldown BETWEEN 1 AND 5),
 target text NOT NULL CHECK (target IN ('self','enemy')),
 stack_cap integer NOT NULL CHECK (stack_cap BETWEEN 1 AND 3),
 duration_turns integer CHECK (duration_turns BETWEEN 1 AND 3),
 PRIMARY KEY(draft_id,skill_id)
);
CREATE TABLE pet_content_species (
 draft_id uuid NOT NULL,
 species_id text NOT NULL CHECK (species_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
 display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 64),
 element_id text NOT NULL,
 rarity text NOT NULL CHECK (rarity IN ('common','uncommon','rare','epic','legendary')),
 profile_id text NOT NULL,
 growth_id text NOT NULL,
 level_cap integer NOT NULL CHECK (level_cap=100),
 asset_state text NOT NULL DEFAULT 'MISSING' CHECK (asset_state='MISSING'),
 production_ready boolean NOT NULL DEFAULT false CHECK (production_ready=false),
 PRIMARY KEY(draft_id,species_id),
 FOREIGN KEY(draft_id,element_id) REFERENCES pet_content_elements(draft_id,element_id),
 FOREIGN KEY(draft_id,profile_id) REFERENCES pet_content_profiles(draft_id,profile_id),
 FOREIGN KEY(draft_id,growth_id) REFERENCES pet_content_growth(draft_id,growth_id)
);
CREATE TABLE pet_content_species_skills (
 draft_id uuid NOT NULL,
 species_id text NOT NULL,
 slot integer NOT NULL CHECK (slot BETWEEN 0 AND 1),
 skill_id text NOT NULL,
 PRIMARY KEY(draft_id,species_id,slot),
 UNIQUE(draft_id,species_id,skill_id),
 FOREIGN KEY(draft_id,species_id) REFERENCES pet_content_species(draft_id,species_id),
 FOREIGN KEY(draft_id,skill_id) REFERENCES pet_content_skills(draft_id,skill_id)
);
REVOKE ALL ON pet_content_drafts,pet_content_elements,pet_content_effectiveness,
 pet_content_profiles,pet_content_growth,pet_content_skills,pet_content_species,
 pet_content_species_skills FROM PUBLIC;
