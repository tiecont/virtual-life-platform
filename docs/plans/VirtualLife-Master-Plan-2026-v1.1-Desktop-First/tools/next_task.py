#!/usr/bin/env python3
"""Print all ready VL tasks. Does not mutate state or bypass manual external gates."""
from pathlib import Path
import json,sys
R=Path(__file__).resolve().parent.parent
plan=json.loads((R/'06-execution/TASKS.json').read_text())
state=json.loads((R/'06-execution/STATE.json').read_text())['tasks']
phase=sys.argv[1] if len(sys.argv)>1 else None
ready=[]
for t in plan['tasks']:
 if phase and t['phase']!=phase:continue
 if state[t['id']]['status']!='TODO':continue
 if not all(state[dep]['status']=='VERIFIED' for dep in t['depends_on']):continue
 ready.append(t)
print('READY tasks (requires coordinator reservation; external gates not automatically satisfied):')
for t in ready:
 print(f"{t['id']} [{t['phase']}] [{t['lane']}] {t['title']}")
 if t['external_gates']:print('  MANUAL EXTERNAL GATES: '+' | '.join(t['external_gates']))
if not ready:print('None — resolve dependencies or review state/evidence. Do not forge status.')
