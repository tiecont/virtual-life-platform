#!/usr/bin/env python3
"""Compare Fire and Water against unpublished bundles using the Rust example.

From the repository root:
  cargo build --locked --release -p aetheria-pet-arena --example arena8_coop_balance
  python3 scripts/coop-balance-study.py --output PATH-TO-RESULTS --stage confirmation \
    --seed-start 101 --seed-count 18

Use --binary to choose the example binary when Cargo uses a custom target directory.
"""
import argparse
import concurrent.futures
import copy
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BOSSES = ("cinder-terraces-warden", "tideglass-lagoon-warden")
COALWHISK = "fire-coalwhisk"
DEWSKIP = "water-dewskip"
CLODKIN = "ground-clodkin"
PARTIES = {
    "starters": (COALWHISK, DEWSKIP, CLODKIN, DEWSKIP),
    "same-species": (COALWHISK,) * 4,
    "ground": (CLODKIN, CLODKIN, CLODKIN, DEWSKIP),
    "sustain": (DEWSKIP, "pet-v31-light-aurelune", "pet-v31-water-marivell", CLODKIN),
    "offense": (COALWHISK, "pet-v31-electric-quorion", "pet-v31-fire-cindrelis", "pet-v31-ghost-vesperyn"),
    "icarus": ("pet-v3-fire-icarus", "pet-v31-electric-quorion", CLODKIN, DEWSKIP),
}

def dump(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")

def lower_pressure(bundle):
    """Longer telegraphs and lower boss pressure at unchanged HP and board damage."""
    for boss_id, (base, per_round, phase_scale) in zip(BOSSES, ((60, 4, 1125), (75, 5, 1150))):
        boss = next(row for row in bundle["bosses"] if row["id"] == boss_id)
        boss["attackModel"].update(baseDamage=base, perRoundDamage=per_round)
        boss["phase"]["phase2AttackPm"] = phase_scale
        boss["telegraphTurns"] = 3

def resource_burst(bundle):
    """Terrain cadence remains fixed. Visible multiplier and elemental decisions matter more."""
    for boss_id, (base, per_round) in zip(BOSSES, ((80, 5), (95, 5))):
        boss = next(row for row in bundle["bosses"] if row["id"] == boss_id)
        boss["attackModel"].update(baseDamage=base, perRoundDamage=per_round)
        boss["telegraphTurns"] = 3
    for stage in bundle["multiplier"]["schedule"]:
        for tier in stage["tiers"]:
            if tier["multiplier"] > 1:
                tier["damageWeightPm"] = 2000 * tier["multiplier"] - 1000
    bundle["resources"].update(manaPerTile=5, ragePerTile=4)
    set_effectiveness(bundle, "fire", "water", 500)
    heal = next(skill for skill in bundle["skills"] if skill["id"] == "water-dewskip-springwell")
    heal["rageCost"] = 32
    heal["effect"]["value"] = 105

def set_effectiveness(bundle, attacker, defender, permille):
    source = next(row for row in bundle["elements"] if row["element"] == attacker)
    entry = next(row for row in source["effectiveness"] if row["element"] == defender)
    entry["permille"] = permille

def shared_pressure(bundle):
    """Water retains self-immunity but distributes pressure and rewards a protected threat."""
    resource_burst(bundle)
    selected = {boss["id"]: boss for boss in bundle["bosses"]}
    fire, water = (selected[boss_id] for boss_id in BOSSES)
    fire["maxHp"] = 9000
    fire["attackModel"].update(baseDamage=85, perRoundDamage=5)
    water["maxHp"] = 8500
    water["attackModel"].update(baseDamage=75, perRoundDamage=5, targetPriority="highest-mana")
    water["telegraphTurns"] = 4
    set_effectiveness(bundle, "ground", "water", 1000)

def functional_reference(bundle):
    """Reproduce the tested co-op candidate B on the supplied functional revision."""
    fire, water = (next(b for b in bundle["bosses"] if b["id"] == name) for name in BOSSES)
    for boss, health in ((fire, 3500), (water, 3800)):
        boss["maxHp"] = health
        boss["attackModel"].update(baseDamage=45, perRoundDamage=3)

def tideglass_endurance(bundle):
    """Compare slower Water attack growth at candidate B's original boss health."""
    functional_reference(bundle)
    water = next(b for b in bundle["bosses"] if b["id"] == BOSSES[1])
    water["attackModel"].update(baseDamage=30, perRoundDamage=1)

def tideglass_vitality(bundle):
    """Compare a shorter Water encounter at candidate B's original attack pressure."""
    functional_reference(bundle)
    water = next(b for b in bundle["bosses"] if b["id"] == BOSSES[1])
    water["maxHp"] = 2200

ELEMENTAL_VARIANTS = {"lower-pressure": lower_pressure, "resource-burst": resource_burst,
                      "shared-pressure": shared_pressure}
FUNCTIONAL_VARIANTS = {"functional-b": functional_reference, "tideglass-endurance": tideglass_endurance,
                       "tideglass-vitality": tideglass_vitality}

def party(name, level, gear):
    result = []
    for i, pet in enumerate(PARTIES[name], 1):
        definitions = {
            "none": [],
            "starter-core": [("core", "core-emberglass", 1)],
            "trained-core": [("core", "core-emberglass", 2)],
            "cinder-core": [("core", "core-amberlattice", 1)],
            "stormcoil-loadout": [
                ("core", "core-amberlattice", 1),
                ("aegis", "aegis-bastionplate", 1),
                ("rune", "rune-mistquill", 1),
            ],
        }[gear]
        artifacts = [
            {
                "slot": slot,
                "artifactId": f"cc111111-0000-4000-8000-{i * 10 + j:012d}",
                "definitionId": definition,
                "upgradeLevel": upgrade,
            }
            for j, (slot, definition, upgrade) in enumerate(definitions)
        ]
        skills = []
        if gear == "trained-core" and pet == COALWHISK:
            skills.append({"skillId": "fire-coalwhisk-ember-lance", "level": 2})
        result.append({"petId": pet, "level": level, "artifacts": artifacts, "skillLevels": skills})
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--binary", type=Path, default=ROOT / "artifacts/rust/target/release/examples/arena8_coop_balance")
    parser.add_argument("--baseline", type=Path, default=ROOT / "config/gameplay/arena8-coop-v2.seed.json")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed-count", type=int, default=6)
    parser.add_argument("--seed-start", type=int, default=1)
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--bundles", nargs="+", choices=["baseline", *ELEMENTAL_VARIANTS, *FUNCTIONAL_VARIANTS])
    parser.add_argument("--stage", choices=["progression", "composition", "confirmation"], default="progression")
    args = parser.parse_args()
    if not 1 <= args.seed_count <= 25 or not 1 <= args.seed_start <= 2**32 - 1 or args.jobs < 1:
        parser.error("use 1–25 seeds per row, a nonzero u32 first seed and at least one worker")
    prefix = args.output.resolve()
    prefix.mkdir(parents=True, exist_ok=True)
    binary = args.binary.resolve()
    if not binary.is_file():
        parser.error(f"build the Rust example, or set --binary: {binary}")
    base = json.loads(args.baseline.read_text())
    capability = base.get("engineCapability")
    if capability not in ("arena8-coop-v1", "arena8-coop-v2"):
        parser.error("unsupported engine capability in study input")
    functional = capability == "arena8-coop-v2"
    variants = FUNCTIONAL_VARIANTS if functional else ELEMENTAL_VARIANTS
    selected = args.bundles or (["baseline"] if functional else ["baseline", *variants])
    if any(name != "baseline" and name not in variants for name in selected):
        parser.error(f"requested balance variant is incompatible with {capability}")
    bundles = {"baseline": args.baseline.resolve()}
    for name, patch in variants.items():
        if name not in selected:
            continue
        bundle = copy.deepcopy(base)
        patch(bundle)
        bundles[name] = prefix / f"{name}.json"
        dump(bundles[name], bundle)
    bundles = {name: path for name, path in bundles.items() if name in selected}
    if args.stage == "progression":
        scenarios = [("starters", level, gear)
                     for level in (1, 5, 10, 20, 40, 60)
                     for gear in ("none", "starter-core")]
    elif args.stage == "composition":
        scenarios = [(name, 20 if name in ("starters", "same-species", "ground") else 40, "starter-core")
                     for name in PARTIES]
        scenarios += [
            ("same-species", 20, "trained-core"),
            ("starters", 20, "cinder-core"),
            ("starters", 40, "stormcoil-loadout"),
        ]
    else:
        scenarios = [("starters", 10, "starter-core"), ("starters", 20, "starter-core"),
                     ("starters", 40, "starter-core"), ("starters", 60, "starter-core"),
                     ("ground", 40, "starter-core"), ("icarus", 40, "starter-core")]

    def run(case):
        bundle, (name, level, gear) = case
        stem = f"{args.stage}-{name}-{level}-{gear}"
        party_path = prefix / "parties" / f"{stem}.json"
        command = [binary, bundles[bundle], party_path, str(args.seed_start), str(args.seed_count), *BOSSES]
        value = {"bundle": bundle, "engineCapability": capability, "party": name, "level": level, "gear": gear,
                 "seedStart": args.seed_start, "seedCount": args.seed_count,
                 "command": list(map(str, command)), "rows": json.loads(subprocess.check_output(command))}
        dump(prefix / f"{stem}-{bundle}.json", value)
        return value

    (prefix / "parties").mkdir(exist_ok=True)
    for name, level, gear in scenarios:
        dump(prefix / "parties" / f"{args.stage}-{name}-{level}-{gear}.json", party(name, level, gear))
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as executor:
        results = list(executor.map(run, ((bundle, case) for case in scenarios for bundle in bundles)))
    dump(prefix / f"{args.stage}-results.json", results)
    dump(prefix / f"{args.stage}-digests.json", {item["bundle"]: item["rows"][0]["contentDigest"] for item in results})

if __name__ == "__main__":
    main()
