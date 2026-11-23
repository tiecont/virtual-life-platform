#!/usr/bin/env python3
"""Check hard-gate receipts and bound artifact bytes; cannot authenticate owner consent."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path

GATES = ('H1', 'H2', 'H3', 'H4')
REQUIRED_FILES = {
    'H1': 'face_neutral.png face_wireframe.png face_blink.png face_smile.png face_frown.png face_shout.png face_profile.png face_threequarter.png controls.json',
    'H2': 'front.png side90.png back.png threequarter.png wings_folded.png wings_spread.png bow_detached.png uv_checker.png budgets.json hierarchy.json',
    'H3': 'poses.mp4 contacts.json weights.json import.json actions.json',
    'H4': 'normal.mp4 reduced.mp4 off.mp4 contact_sheet.png profiler.json import.json',
}
STATES = ('PENDING_OWNER_REVIEW', 'REVISION_REQUIRED', 'OWNER_APPROVED')
RELEASE = 'DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC'
SHA = re.compile(r'^[a-f0-9]{40}$')
DIGEST = re.compile(r'^[a-f0-9]{64}$')


def hash_file(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open('rb') as reader:
        for block in iter(lambda: reader.read(1<<20), b''):
            digest.update(block)
    return digest.hexdigest()


def inspect(root: Path) -> dict:
    root = root.resolve()
    report, errors = [], []
    prior_receipt_digest = None
    prior_approved = True
    for gate in GATES:
        receipt_file = root / gate / 'receipt.json'
        if receipt_file.parent.is_symlink():
            errors.append(f'{gate}: symlinked gate directory')
            report.append({'gate':gate,'status':'INVALID'})
            prior_approved = False
            prior_receipt_digest = None
            continue
        if receipt_file.is_symlink() or not receipt_file.is_file():
            report.append({'gate':gate,'status':'MISSING'})
            prior_approved = False
            prior_receipt_digest = None
            continue
        local_errors=[]
        try:
            receipt_bytes = receipt_file.read_bytes()
            data=json.loads(receipt_bytes)
            if not isinstance(data,dict):
                raise ValueError('receipt must be an object')
        except (ValueError,UnicodeError,OSError) as exc:
            report.append({'gate':gate,'status':'INVALID','errors':[str(exc)]})
            errors.append(f'{gate}: invalid receipt: {exc}')
            prior_approved = False
            prior_receipt_digest = None
            continue
        state = data.get('status')
        if data.get('schemaVersion')!=1 or data.get('gate')!=gate or state not in STATES:
            local_errors.append('schemaVersion/gate/status invalid')
        if data.get('releaseState')!=RELEASE:
            local_errors.append('releaseState must stay DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC')
        artifacts=data.get('artifactHashes')
        if not isinstance(artifacts,dict) or not artifacts:
            local_errors.append('artifactHashes must be a nonempty map')
            artifacts={}
        for relative,digest in artifacts.items():
            if not isinstance(relative,str) or not isinstance(digest,str) or not DIGEST.fullmatch(digest):
                local_errors.append(f'Invalid artifact ref/hash {relative}')
                continue
            path=Path(relative)
            if path.is_absolute() or '..' in path.parts or not path.parts or relative=='receipt.json':
                local_errors.append(f'Unsafe artifact path {relative}')
                continue
            file=root/gate/path
            if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to((root/gate).resolve()):
                local_errors.append(f'Missing or unsafe artifact {relative}')
            elif hash_file(file)!=digest:
                local_errors.append(f'Artifact hash mismatch {relative}')
        if state=='OWNER_APPROVED':
            for name in REQUIRED_FILES[gate].split():
                if name not in artifacts:
                    local_errors.append(f'Missing required evidence {name}')
            if not SHA.fullmatch(str(data.get('sourceRevision',''))):
                local_errors.append('Approved gate requires git 40-character sourceRevision')
            if not isinstance(data.get('ownerApprovalRef'),str) or not data['ownerApprovalRef'].strip():
                local_errors.append('Approved gate requires ownerApprovalRef')
            if not isinstance(data.get('ownerApprovedAt'),str) or not data['ownerApprovedAt'].strip():
                local_errors.append('Approved gate requires ownerApprovedAt')
            if not isinstance(data.get('commands'),list) or not data['commands']:
                local_errors.append('Approved gate requires real recorded commands')
            if gate!='H1' and (not prior_approved or data.get('previousGateReceiptSha256')!=prior_receipt_digest):
                local_errors.append('Previous gate not approved or previous receipt hash mismatch')
        current_digest=hashlib.sha256(receipt_bytes).hexdigest()
        if local_errors:
            errors.extend(f'{gate}: {error}' for error in local_errors)
        report.append({'gate':gate,'status':state if not local_errors else 'INVALID','errors':local_errors,
                       'receiptSha256':current_digest})
        prior_approved = state=='OWNER_APPROVED' and not local_errors
        prior_receipt_digest = current_digest
    accepted=not errors and all(x['status']=='OWNER_APPROVED' for x in report)
    return {'status':'SCHEMA_AND_HASH_PASS_NOT_AUTHENTICATED' if accepted else 'NOT_FULLY_APPROVED',
            'gates':report,'errors':errors,
            'warning':'This verifier cannot prove an approval was genuinely provided by the owner. CTO must verify source message, identity and exact asset versions; do not self-approve.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',type=Path)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    result=inspect(args.root)
    content=json.dumps(result,indent=2,ensure_ascii=False)+'\n'
    print(content,end='')
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(content,encoding='utf-8')
    return int(result['status']!='SCHEMA_AND_HASH_PASS_NOT_AUTHENTICATED')

if __name__ == '__main__':
    raise SystemExit(main())
