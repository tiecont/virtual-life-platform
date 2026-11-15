#!/usr/bin/env python3
"""Offline candidate contract validation. Never writes DB or grants publication."""
import collections
import hashlib
import json
import re
import sys
from pathlib import Path


def validate(root, upstream=None):
    def get(name):
        return json.loads((root / name).read_text())
    def require(condition, message):
        if not condition:
            raise ValueError(message)
    manifest = get('catalog_manifest.json')
    require(manifest['state'] == 'DRAFT_ONLY' and manifest['enabled'] is False and manifest['publishAllowed'] is False, 'manifest safety')
    require(manifest['catalog'] == 'pets_initial_240.json' and manifest['assets'] == 'pet_asset_manifest_240.json', 'canonical files')
    for name, digest in manifest['files'].items():
        require(Path(name).name == name and re.fullmatch(r'[a-f0-9]{64}', digest), 'unsafe manifest entry')
        require(hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, 'hash mismatch: '+name)
    catalog = get(manifest['catalog'])
    pets = catalog['pets']
    require(catalog['state'] == 'DRAFT_ONLY' and catalog['enabled'] is False and catalog['publishAllowed'] is False, 'catalog safety')
    require(len(pets) == 240 and len({p['id'] for p in pets}) == 240 and len({p['name'].casefold() for p in pets}) == 240, '240 unique identities')
    expected = set('normal fire water grass electric ice fighting poison ground flying psychic bug rock ghost dragon dark steel fairy light'.split())
    elements = get('elements.json')['elements']
    require(len(elements) == 19 and {e['id'] for e in elements} == expected, 'canonical19')
    matrix = get('element_effectiveness_matrix.json')['attackerRowsDefenderColumns']
    require(set(matrix) == expected and all(set(row) == expected for row in matrix.values()), '361 matchups')
    require(all(v in [0, 800, 1000, 1250] for row in matrix.values() for v in row.values()), 'bounded matchup')
    for e in elements:
        for key, value in [('strongAgainst', 1250), ('resistedBy', 800), ('noEffectAgainst', 0)]:
            require(all(matrix[e['id']][d] == value for d in e[key]), 'matrix relation')
    require(collections.Counter(p['source'] for p in pets) == {'map_regular':209, 'map_legendary':19, 'limited_event_gacha':6, 'standard_gacha':6}, 'source composition')
    require(collections.Counter(p['rank'] for p in pets) == {'B':133, 'A':76, 'S':31}, 'rank composition')
    races = get('races.json')['races']; skills = {s['id']:s for s in get('skills_16.json')['skills']}
    require(len(races) == 22 and len({r['id'] for r in races}) == 22, '22 races')
    for p in pets:
        require(re.fullmatch(r'[a-z][a-z0-9_-]{0,63}', p['id']) and re.fullmatch(r'[A-Z][A-Za-z]*', p['name']), 'identity format')
        require(p['element'] in expected and p['race'] in {r['id'] for r in races}, 'taxonomy')
        require(p['availability'] == 'DRAFT_ONLY' and p['assetStatus'] == 'MISSING' and p['published'] is False and p['productionReady'] is False, 'draft safety')
        require(p['seedSafety'] == {'dbWriteAllowed':'unpublished_drafts_only','playerEntitlementGrant':False,'autoPublish':False}, 'grant safety')
        require(p['ownedLevelCap'] == 100 and p['evolution']['maxStars'] == 3 and p['awakening']['maxConstellation'] == 6 and p['awakening']['copiesToMax'] == 7, 'progression caps')
        stats = p['combat']['statProfile']
        require(set(stats) == {'hp','attack','defense','speed'} and all(type(v) is int and 800 <= v <= 1200 for v in stats.values()) and sum(stats.values()) == 4000, 'stat budget')
        require(1 <= len(p['combat']['skillRefs']) <= 4 and all(s in skills for s in p['combat']['skillRefs']), 'skill references')
        limited = p['source'] == 'limited_event_gacha'; banner = p['source'] in ['standard_gacha','limited_event_gacha']
        require((p['combat']['signatureCard'] is not None) == limited and p['combat']['hasExclusiveBoardSkill'] == limited, 'Limited-only signature')
        require(p['rank'] in (['B','A'] if p['source'] == 'map_regular' else ['S']), 'source rank')
        require(p['capture']['requiredUniqueWins'] == (0 if banner else 5 if p['rank'] == 'S' else 3), '3/5 recruitment')
        require((p['mapId'] is None) == banner and p['capture']['requiresWinReceipts'] == (not banner), 'map exclusion')
    old = get('upstream_114_id_manifest.json')['species']
    actual = {p['id']:p['name'] for p in pets if p['sourceCatalog'] == 'repo-existing-v2-candidate'}
    require(len(actual) == 114 and set(actual) == {p['id'] for p in old}, 'upstream IDs')
    if upstream:
        original = json.loads(upstream.read_text())['species']
        require(actual == {p['id']:p['displayName'] for p in original}, 'actual upstream114 identities')
    by_id = {p['id']:p for p in pets}
    maps = get('maps_19.json')['maps']; require(len(maps) == 19, '19 maps')
    for m in maps:
        entries = [p for p in pets if p['mapId'] == m['id']]
        require(collections.Counter(p['rank'] for p in entries) == {'B':7,'A':4,'S':1}, 'map composition')
        require(set(m['regularPetIds']) == {p['id'] for p in entries if p['rank'] != 'S'} and by_id[m['legendaryPetId']]['mapId'] == m['id'], 'map references')
    require(all(any(p['name'] == name and p['rank'] in ['B','A'] for p in pets) for name in ['Emberpaw','Brooklet','Thornwick','Galehorn','Mireshade','Frostel']), 'ordinary examples preserved')
    standards = [p for p in pets if p['source'] == 'standard_gacha']
    require(get('standard_gacha_pets_6.json')['pets'] == standards, 'Standard projection drift')
    require({p['name'] for p in standards} == {'Cindrelis','Marivell','Quorion','Vesperyn','Gravorn','Aurelune'}, 'Standard names')
    for p in standards:
        s = p['standard']; require(p['awakening']['applies'] is True and s['signatureCardAllowed'] is False, 'Standard awakening')
        require(s['progression']['minLevel'] == 1 and s['progression']['maxLevel'] == 100 and 1 <= s['progression']['growthPermillePerLevel'] <= 50, 'Standard growth')
        require(s['progression']['skillUnlocks'] == [{'skillId':k,'level':skills[k]['unlockLevel']} for k in p['combat']['skillRefs']], 'unlock references')
        require(s['equipmentCompatibility']['limitedSignatureCards'] is False and s['awakeningRule'] == 'standard_shared_v1', 'equipment/awakening')
        require(0 <= s['effectLimits']['powerPermille'] <= 2000 and 1 <= s['effectLimits']['maxTargets'] <= 3 and s['effectLimits']['controlActionsSkipped'] == 0, 'effect bounds')
    assets = get(manifest['assets'])['petAssets']
    require(len(assets) == 240 and {a['petId'] for a in assets} == set(by_id), 'asset coverage')
    require(all(a['assetStatus'] == 'MISSING' and a['productionReady'] is False and a['bespokeLimited'] == (by_id[a['petId']]['source'] == 'limited_event_gacha') for a in assets), 'asset safety')
    animations = get('standard_animation_profiles.json')['petAnimations']
    require(len(animations) == 6 and {a['petId'] for a in animations} == {p['id'] for p in standards}, 'animation coverage')
    for a in animations:
        require({'idle','move','normal_sword_hit','rage_sword_100','skill_cast','hurt','defend','status','victory','defeat','world_follow','summon'} <= set(a['actions']) and a['serverOutcomeIndependent'] is True and a['assetStatus'] == 'MISSING', 'animation contract')
    g = get('gacha_economy.json'); pool = g['standardPool']
    require(g['enabled'] is False and g['purchasesEnabled'] is False and g['candidateOnly'] is True, 'gacha safety')
    require(len(pool) == 6 and {r['petId'] for r in pool} == {p['id'] for p in standards} and all(type(r['weight']) is int and r['weight'] == 1 for r in pool), 'initial equal Standard pool')
    require(g['limitedBanner']['failedFeaturedRank'] == 'S' and g['limitedBanner']['failedFeaturedSPoolRef'] == 'standardPool' and g['limitedBanner']['nextSFeaturedGuaranteedIfRateUpMiss'] is True, 'miss guarantee')
    require(g['standardBanner']['limitedGuaranteeMutation'] is False and g['poolPolicy']['mapLegendaryAllowed'] is False, 'independent families')
    require(g['limitedBanner']['softPityCurve'] is None and g['limitedBanner']['softPityCurveStatus'] == 'UNAPPROVED_RELEASE_BLOCKER', 'no invented launch curve')
    curve = get('level_progression_100.json')['levelRows']
    require(len(curve) == 100 and curve[-1]['xpToNextLevel'] == 0 and all(curve[i]['xpToNextLevel'] < curve[i+1]['xpToNextLevel'] for i in range(98)), 'Lv100 curve')
    board = get('board_rules_10x10.json'); normal = board['skillVsUltimateBoardContract']['normalSkill']
    require(board['board']['cellCount'] == 100 and normal['gridVisible'] and normal['cellPositionStable'] and not normal['tilesDeleted'] and not normal['refill'] and not normal['shuffle'], 'stationary10x10')
    require(get('weekly_boss_and_lobby.json')['partyRules']['maxTotalPlayers'] == 4, 'four-player boss')
    return 'PASS: 240 draft Pets = 209 B/A +19 map S +6 Limited S +6 Standard S; 19 elements /361 matchups; upstream114 stable; no publication/grants'


if __name__ == '__main__':
    repo = Path(__file__).resolve().parents[1]
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else repo/'specs/pet-arena/v3.1/data'
    upstream = repo/'specs/pet-arena/catalog-v2.json'
    print(validate(root, upstream if upstream.exists() else None))
