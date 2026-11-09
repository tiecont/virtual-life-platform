#!/usr/bin/env python3
"""Validate VirtualLife planning package (stdlib only).  No repository access or side effects."""
from pathlib import Path
import json, hashlib, sys
R=Path(__file__).resolve().parent.parent
J=lambda p:json.loads((R/p).read_text(encoding='utf-8'))
taskdoc=J('06-execution/TASKS.json'); tasks=taskdoc['tasks']; state=J('06-execution/STATE.json')
errors=[]; warnings=[]
ids=[t['id'] for t in tasks]; idset=set(ids); ix={s:i for i,s in enumerate(['G0','G1','G2','G3','G4','G5','G6','G7'])}
if len(ids)!=len(idset):errors.append('duplicate IDs')
if len(ids)!=taskdoc['taskCount']:errors.append('taskCount mismatch')
if set(state['tasks'])!=idset:errors.append('state task keys differ from task IDs')
required={'id','phase','lane','title','objective','acceptance','depends_on','evidence_required','external_gates','priority','status'}
for t in tasks:
 tid=t['id']
 if not required.issubset(t):errors.append(tid+' missing mandatory fields')
 if not t['objective'].strip() or not t['acceptance'] or any(not a.strip() for a in t['acceptance']):errors.append(tid+' no measurable acceptance')
 if t['phase'] not in ix:errors.append(tid+' unknown phase')
 if tid in t['depends_on']:errors.append(tid+' self dependency')
 for dep in t['depends_on']:
  if dep not in idset:errors.append(tid+' invalid dep '+dep)
  elif ix.get(next(x for x in tasks if x['id']==dep)['phase'],999)>ix.get(t['phase'],-1):errors.append(tid+' depends on later phase '+dep)
 if state['tasks'].get(tid,{}).get('status') not in ('TODO','RESERVED','IN_PROGRESS','IN_REVIEW','VERIFIED','FAILED','BLOCKED_EXTERNAL','DEFERRED_APPROVED'):
  errors.append(tid+' unknown status')
 if state['tasks'].get(tid,{}).get('status')=='VERIFIED' and not state['tasks'][tid]['evidenceRefs']:
  errors.append(tid+' VERIFIED without evidenceRefs')
visited=set();active=set();adj={t['id']:t['depends_on'] for t in tasks}
def visit(n):
 if n in active:errors.append('dependency cycle at '+n);return
 if n in visited:return
 active.add(n)
 for d in adj[n]:
  if d in adj:visit(d)
 active.remove(n);visited.add(n)
for k in ids:visit(k)
paths=['01-architecture/ADR-003-DESKTOP-FIRST.md','01-architecture/NATIVE-CLIENT-ARCHITECTURE.md','01-architecture/UNITY-URP-RENDERING.md','01-architecture/OFFICIAL-WEBSITE-ARCHITECTURE.md','01-architecture/DESKTOP-PATCHING-DISTRIBUTION.md','01-architecture/GRAPHICS-QUALITY-BUDGETS.md','01-architecture/CLIENT-NETCODE.md','04-delivery/DESKTOP-FIRST-ROADMAP.md','04-delivery/MIGRATION-V1-TO-V1.1.md','04-delivery/PERFORMANCE-GO-NOGO.md','07-visuals/VirtualLife-official-site-prototype.html','07-visuals/VirtualLife-desktop-architecture.svg','START-HERE.md','README.md','AGENTS.md','04-delivery/PHASE-GATES.md','04-delivery/ORIGINAL-PLAN-CROSSWALK.md','01-architecture/ADR-001-STACK.md','02-world-design/MAP-TELEPORT.md','03-design/BRAND-AND-UI.md','05-contracts/rpc/game-runtime.proto','07-visuals/VirtualLife-logo.svg','07-visuals/VirtualLife-city-map.svg','07-visuals/VirtualLife-ui-prototype.html','07-visuals/VirtualLife-key-art-concept.webp','08-references/PROVENANCE.md']
for p in paths:
 if not (R/p).is_file():errors.append('missing '+p)
 if (R/p).is_file() and (R/p).stat().st_size==0:errors.append('empty '+p)
cat=J('05-contracts/content-catalog.example.json')
if len({p['id'] for p in cat['places']})!=len(cat['places']):errors.append('duplicate POI ID')
if taskdoc.get('status')!='PLANNING_ONLY':warnings.append('task status no longer PLANNING_ONLY')
if (R/'FILE-MANIFEST.json').exists():
 manifest=J('FILE-MANIFEST.json')
 for rel,hash in manifest['files'].items():
  p=R/rel
  if not p.is_file():errors.append('manifest file missing '+rel)
  elif hashlib.sha256(p.read_bytes()).hexdigest()!=hash:errors.append('checksum mismatch '+rel)
 if len(manifest['files'])!=sum(1 for p in R.rglob('*') if p.is_file() and p.name!='FILE-MANIFEST.json'):
  warnings.append('manifest file count differs (possibly new evidence/art files)')
if len(tasks)!=110:errors.append('v1.1 expected 110 task IDs')
print(f'VirtualLife plan: {len(tasks)} tasks | {len(visited)} visited | {len(cat["places"])} POIs')
for line in warnings:print('WARNING: '+line)
if errors:
 for line in errors:print('ERROR: '+line,file=sys.stderr)
 sys.exit(1)
print('PASS: schema, dependencies, asset presence, state and checksums')
