# Plan-only validation utilities

Requires Python 3.9+ stdlib (Pillow NOT required to validate/extract plan).

```
python3 tools/validate_plan.py
python3 tools/next_task.py
python3 tools/next_task.py G0
```
Tools do not execute agents, modify code or mark old N/PA tasks completed. `next_task.py` only lists TODO tasks whose **new VL** dependencies are VERIFIED, not proof that external gates are satisfied.

`FILE-MANIFEST.json` contains SHA256 content hashes of packaged files, excluding itself. Changing a file after review requires intentional manifest regeneration and code review. Do not treat this plan archive as a production artifact or a repo HEAD snapshot.
