#!/usr/bin/env python3
"""Validate offline editorial coverage and canonical constraints; never claim art acceptance."""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / 'specs/pet-arena/design/pet-lore-design-240.json'


def validate(path):
    draft = json.loads(path.read_text(encoding='utf-8'))
    base = ROOT / 'specs/pet-arena/v3.1/data'
    source = json.loads((base / 'pets_initial_240.json').read_text())['pets']
    races = {r['id']: r for r in json.loads((base / 'races.json').read_text())['races']}
    maps = {m['id'] for m in json.loads((base / 'maps_19.json').read_text())['maps']}
    entries = draft['pets']
    assert draft['state'] == 'DRAFT_ONLY'
    assert draft['enabled'] is False and draft['publishAllowed'] is False
    assert draft['productionReady'] is False and draft['artAcceptance'] == 'NOT_RENDERED'
    assert draft['styleTarget'] == 'UNVALIDATED_TARGET'
    assert len(entries) == len(source) == 240, 'exactly 240 entries required'
    ids = [p['id'] for p in entries]
    assert len(set(ids)) == 240, 'duplicate editorial IDs'
    assert ids == [p['id'] for p in source], 'canonical ID coverage/order drift'
    assert len({p['storyVi'] for p in entries}) == 240, 'duplicate stories'
    assert len({p['designPrompt'] for p in entries}) == 240, 'duplicate prompts'
    expected_paths = {str((base / f).relative_to(ROOT)) for f in
                      ('pets_initial_240.json', 'maps_19.json', 'races.json')}
    assert {s['path'] for s in draft['sources']} == expected_paths
    for item in draft['sources']:
        assert hashlib.sha256((ROOT / item['path']).read_bytes()).hexdigest() == item['sha256'], item['path']
    flagged = 0
    for entry, pet in zip(entries, source):
        ident = pet['id']
        assert set(entry) == {'id', 'name', 'storyVi', 'designPrompt', 'visualConstraints'}, ident
        assert entry['name'] == pet['name'], ident
        c = entry['visualConstraints']
        expected = {k: pet[k] for k in ('id', 'name', 'element', 'race', 'bodyPlan', 'rigArchetype', 'rank', 'source', 'mapId')}
        expected.update({k: pet['design'][k] for k in ('silhouette', 'primaryColor', 'secondaryColor')})
        assert c['canonical'] == expected, f'{ident}: canonical field drift'
        assert pet['mapId'] is None or pet['mapId'] in maps, ident
        override = c['raceDefaultOverride']
        race_default = races[pet['race']]['defaultBodyPlan']
        assert override == {'explicitInCatalog': pet['bodyPlan'] != race_default,
                            'raceDefaultBodyPlan': race_default, 'effectiveBodyPlan': pet['bodyPlan']}, ident
        story, prompt = entry['storyVi'], entry['designPrompt']
        assert len(story.split()) >= 65 and len(story) >= 300, f'{ident}: incomplete story'
        assert pet['name'] in story and re.search('[ăâđêôơưĂÂĐÊÔƠƯ]', story), f'{ident}: expected Vietnamese story'
        assert len(prompt.split()) >= 180, f'{ident}: incomplete prompt'
        for token in (ident, pet['name'], pet['element'], pet['race'], pet['bodyPlan'],
                      pet['design']['primaryColor'], pet['design']['secondaryColor']):
            assert token in prompt, f'{ident}: missing prompt identity/palette {token}'
        review = c['silhouetteReview']
        assert review['status'] in ('OWNER_APPEARANCE_OVERRIDE', 'CONFLICT_OR_AMBIGUITY_FLAGGED',
                                     'COMPATIBLE_CONCEPT_INTERPRETATION'), ident
        if review['status'] != 'COMPATIBLE_CONCEPT_INTERPRETATION':
            flagged += 1
            assert review['issue'] and review['issue'] in prompt, f'{ident}: undisclosed conflict'
        else:
            assert review['issue'] is None, ident
        assert c['appearanceAuthority'] == ('OWNER_ICARUS_V3' if ident == 'pet-v3-fire-icarus'
                                            else 'CANONICAL_V31_WITH_PROPOSED_DETAILS'), ident
        if ident == 'pet-v3-fire-icarus':
            for phrase in ('168 cm', 'pastel-pink hair', 'white feather wings', 'No tail', 'Phoenix Fire Bow'):
                assert phrase in prompt, f'Icarus owner constraint missing: {phrase}'
    ref = draft['referencePolicy']['icarusOnly']
    assert re.fullmatch('[a-f0-9]{64}', ref['sha256'])
    # The owner's machine-local image is optional in CI; if present, verify the exact inspected bytes.
    if Path(ref['path']).is_file():
        assert hashlib.sha256(Path(ref['path']).read_bytes()).hexdigest() == ref['sha256']
    print(f'PASS: 240 unique stories/prompts; exact canonical IDs/names/taxonomy/maps/colors; {flagged} disclosed silhouette/appearance notes.')
    print('DRAFT_ONLY; textual integrity only. Story quality, generated image likeness, rig compatibility and production acceptance are not automated PASS claims.')


if __name__ == '__main__':
    try:
        validate(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT)
    except (AssertionError, KeyError, ValueError, OSError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        sys.exit(1)
