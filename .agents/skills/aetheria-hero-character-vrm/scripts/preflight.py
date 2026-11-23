#!/usr/bin/env python3
"""Structural native input preflight. Does not approve visual design or signatures."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path
from PIL import Image

PNG_RULES = {
    '01_front_apose.png': (1024, 1536),
    '02_side_apose.png': (1024, 1536),
    '03_back_apose.png': (1024, 1536),
    '04_face_closeup.png': (1024, 1024),
    '05_wings_or_tail.png': (1024, 1024),
    '06_weapon_prop.png': (1024, 1024),
}
RELEASE = 'DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC'
HEX = re.compile(r'^#[0-9A-Fa-f]{6}$')


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def inspect(folder: Path, profile: str = 'generic') -> dict:
    errors, checks = [], []
    folder = folder.resolve()
    data = None
    spec_path = folder / '07_spec.json'
    if spec_path.is_symlink() or not spec_path.is_file():
        errors.append('Missing regular file 07_spec.json')
    else:
        try:
            data = json.loads(spec_path.read_text(encoding='utf-8'))
            if not isinstance(data, dict):
                raise ValueError('root must be a JSON object')
        except (ValueError, UnicodeError, OSError) as exc:
            errors.append(f'Invalid 07_spec.json: {exc}')
            data = None
    if data is None:
        data = {}
    hashes = data.get('referenceHashes', {})
    if not isinstance(hashes, dict):
        errors.append('referenceHashes must be an object')
        hashes = {}
    for name, (min_width, min_height) in PNG_RULES.items():
        file = folder / name
        if file.is_symlink() or not file.is_file():
            errors.append(f'Missing regular PNG {name}')
            continue
        try:
            with Image.open(file) as img:
                if img.format != 'PNG':
                    raise ValueError('file is not a native PNG')
                img.verify()
            with Image.open(file) as img:
                img.load()
                width, height, mode = img.width, img.height, img.mode
            if width < min_width or height < min_height:
                errors.append(f'{name} insufficient pixel resolution {width}x{height} (minimum {min_width}x{min_height})')
            if mode not in ('RGB', 'RGBA'):
                errors.append(f'{name} unsupported color mode {mode}; RGB/RGBA required')
            calculated = hash_file(file)
            if hashes.get(name) != calculated:
                errors.append(f'{name} missing/mismatched SHA256 in referenceHashes')
            checks.append({'file': name, 'width': width, 'height': height, 'sha256': calculated})
        except (ValueError, OSError, SyntaxError, Image.UnidentifiedImageError) as exc:
            errors.append(f'{name} invalid PNG: {exc}')
    expected_str = ['characterId', 'designRevision', 'signatureOpcode', 'designApprovalReference']
    for key in expected_str:
        if not isinstance(data.get(key), str) or not data[key].strip():
            errors.append(f'{key} requires a nonempty string')
    revision = data.get('designRevision', '')
    if isinstance(revision, str) and ('RECONCILE' in revision or 'PLACEHOLDER' in revision):
        errors.append('designRevision must be a reconciled real approval revision')
    ref = data.get('designApprovalReference', '')
    if isinstance(ref, str) and ('ADD_' in ref or 'PLACEHOLDER' in ref):
        errors.append('designApprovalReference must refer to a real owner approval')
    height = data.get('heightMeters')
    if isinstance(height, bool) or not isinstance(height, (float, int)) or not .1 <= height <= 25:
        errors.append('heightMeters must be a numeric meter value between 0.1 and 25')
    palette = data.get('paletteHex', {})
    if not isinstance(palette, dict) or not palette or any(not isinstance(v, str) or not HEX.fullmatch(v) for v in palette.values()):
        errors.append('paletteHex must contain at least one #RRGGBB color')
    if data.get('paletteReviewStatus') != 'OWNER_APPROVED':
        errors.append('paletteReviewStatus must be OWNER_APPROVED; example palette is provisional')
    if not isinstance(data.get('materials'), list) or not data['materials'] or any(not isinstance(x, str) for x in data['materials']):
        errors.append('materials requires a nonempty list of material names')
    for axis, expected in [('upAxis', 'Y'), ('forwardAxis', '-Z')]:
        if data.get(axis) != expected:
            errors.append(f'{axis} must be {expected} for Unity export convention (Blender scene is Z-up)')
    if data.get('releaseState') != RELEASE:
        errors.append('releaseState must remain DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC')
    if data.get('schemaVersion') != 1:
        errors.append('schemaVersion must equal 1')
    if profile == 'icarus':
        expected = {
            'characterId': 'pet-v3-fire-icarus',
            'signatureOpcode': 'FIRE_ZONE',
            'anatomy': 'adult_human_no_tail_no_beast_legs',
            'rigImportType': 'Generic',
        }
        for key, value in expected.items():
            if data.get(key) != value:
                errors.append(f'Icarus {key} must equal {value}')
        if height != 1.68:
            errors.append('Icarus heightMeters must equal 1.68')
        appendages = data.get('appendages')
        if not isinstance(appendages, dict) or any(appendages.get(k) != v for k,v in {
            'type': 'pair_of_feather_wings', 'count': 2,
            'attachment': 'upper_back', 'foldable': True,
        }.items()):
            errors.append('Icarus requires exactly two foldable feather wings rooted at upper back')
        weapon = data.get('weapon')
        if not isinstance(weapon, dict) or any(weapon.get(k) != v for k,v in {
            'type': 'bow', 'name': 'Phoenix Fire Bow', 'separateProp': True,
        }.items()):
            errors.append('Icarus requires separate Phoenix Fire Bow prop')
    return {'status': 'BLOCKED' if errors else 'STRUCTURAL_PREFLIGHT_PASS_NOT_ART_APPROVAL',
            'profile': profile, 'errors': errors, 'pngs': checks,
            'warning': 'Valid pixel resolution/hash does NOT prove real HD source detail, A-pose, consistent art, no text, true orthogonality, owner approval or rights.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--profile', choices=('generic','icarus'), default='generic')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = inspect(args.folder,args.profile)
    content = json.dumps(result, indent=2, ensure_ascii=False)+'\n'
    print(content, end='')
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content, encoding='utf-8')
    return int(result['status']=='BLOCKED')

if __name__ == '__main__':
    raise SystemExit(main())
