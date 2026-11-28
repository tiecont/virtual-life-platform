#!/usr/bin/env python3
"""Compare unpublished bundles with the authoritative Rust reducer.

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
    "jewel-support": ("pet-v31-light-aurelune", "pet-v31-water-marivell", "light-dawnarchon", CLODKIN),
}
JEWEL_CASES = (
    ("starters", 10, "none"),
    ("starters", 20, "starter-core"),
    ("same-species", 20, "trained-core"),
    ("ground", 40, "starter-core"),
    ("offense", 40, "stormcoil-loadout"),
    ("icarus", 40, "starter-core"),
    ("jewel-support", 20, "none"),
    ("jewel-support", 40, "stormcoil-loadout"),
)
HISTORICAL_COMPOSITIONS = tuple(name for name in PARTIES if name != "jewel-support")
WARDEN_CASES = tuple(
    (name, level, gear)
    for name in ("icarus", "offense", "sustain")
    for level, gear in (
        (40, "stormcoil-loadout"),
        (40, "prismheart-trained"),
        (60, "prismheart-trained"),
        (60, "temporal-trained"),
    )
)


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

# Factorial experiment for the timed ruleset. Retain each Warden's relative
# health and attack curve, and keep party, board and skill inputs identical.
def timed_warden_variant(bundle, *, lower_hp=False, lower_attack=False):
    for boss in bundle["bosses"]:
        if lower_hp:
            boss["maxHp"] = max(1, boss["maxHp"] // 4)
        if lower_attack:
            model = boss["attackModel"]
            model["baseDamage"] = max(1, model["baseDamage"] // 4)
            model["perRoundDamage"] //= 4


TIMED_VARIANTS = {
    "timed-hp-quarter": lambda bundle: timed_warden_variant(bundle, lower_hp=True),
    "timed-attack-quarter": lambda bundle: timed_warden_variant(bundle, lower_attack=True),
    "timed-hp-attack-quarter": lambda bundle: timed_warden_variant(bundle, lower_hp=True, lower_attack=True),
}


def shared_weights(bundle, weights):
    for entry in bundle["board"]["functionalTiles"]["spawnWeights"]:
        entry["weight"] = weights[entry["kind"]]


def warden_defense_support(bundle):
    """Isolate practical recovery between authored Warden impacts."""
    bundle["configId"] = "arena8-warden-defense-support-v1"
    bundle["contentRevision"] = 1
    tiles = bundle["board"]["functionalTiles"]
    # A plain match of three now has an authored yield of 90 healing or 105
    # shielding before the existing missing-health and shield-cap constraints.
    tiles["heart"]["amount"] = 30
    tiles["shield"]["amount"] = 35


# Study inputs only. None of these variants publishes an active configuration.
SHARED_VARIANTS = {
    "warden-defense-support": warden_defense_support,
    "shared-even": lambda bundle: shared_weights(bundle, dict.fromkeys(
        ("sword", "mana", "rage", "heart", "shield", "special", "nature", "frost", "astral"), 1000)),
    "shared-basic-heavy": lambda bundle: shared_weights(bundle, {
        "sword": 2000, "mana": 1600, "rage": 1600, "heart": 1400, "shield": 1400,
        "special": 1100, "nature": 350, "frost": 350, "astral": 200,
    }),
}


def party(name, level, gear, bundle):
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
            "prismheart-trained": [
                ("core", "core-prismheart", 5),
                ("aegis", "aegis-bastionplate", 5),
                ("rune", "rune-whisperknot", 5),
            ],
            "temporal-trained": [
                ("core", "core-prismheart", 5),
                ("aegis", "aegis-bastionplate", 5),
                ("rune", "rune-temporal-seal", 5),
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
        if gear in ("prismheart-trained", "temporal-trained"):
            bindings = next(row for row in bundle["pets"] if row["id"] == pet)
            skill_ids = {bindings.get(slot) for slot in ("guard", "skill", "signature", "ultimate", "fireZone")}
            skills.extend(
                {"skillId": row["id"], "level": 1 + len(row["upgradeLevels"])}
                for row in bundle["skills"]
                if row["id"] in skill_ids and row.get("upgradeLevels")
            )
        result.append({"petId": pet, "level": level, "artifacts": artifacts, "skillLevels": skills})
    return result


def jewel_bundles(advanced_path, output):
    """Hold the advanced ruleset and balance constant while isolating each source."""
    authored = json.loads(advanced_path.read_text())
    editions = {"advanced-control": None, "advanced-skill": "skills", "advanced-encounter": "opening"}
    results = {}
    for label, source in editions.items():
        bundle = copy.deepcopy(authored)
        config = bundle["advancedJewels"]
        if source is None:
            config["encounters"] = []
        else:
            encounters = config["encounters"]
            config["encounters"] = []
            for encounter in encounters:
                if not encounter.get(source):
                    continue
                entry = {"encounterId": encounter["encounterId"], "skills": []}
                entry[source] = encounter[source]
                config["encounters"].append(entry)
            if not config["encounters"]:
                raise ValueError(f"advanced candidate has no {source} to measure")
        results[label] = output / f"{label}.json"
        dump(results[label], bundle)
    return results


def summarize_row(item, row):
    diagnostics = row.get("diagnostics", {})
    board = diagnostics.get("board")
    combat = diagnostics.get("combat")
    row_summary = {
        "bundle": item["bundle"],
        "contentDigest": row["contentDigest"],
        "party": item["party"],
        "level": item["level"],
        "gear": item["gear"],
        "mode": item["mode"],
        "bossId": row["bossId"],
        "policy": row["policy"],
        "seeds": row["seeds"],
        "wins": row["wins"],
        "losses": row["losses"],
        "unresolved": row["unresolved"],
        "roundLimitDefeats": diagnostics.get("roundLimitDefeats", 0),
        "teamWipes": diagnostics.get("teamWipes", 0),
        "averageRounds": row["averageRoundsMilli"] / 1000,
        "averageActions": row["averageActionsMilli"] / 1000,
        "averageSimulatedDurationMs": row["averageLogicalDurationMs"],
        "matchesWithMultiplier": row["matchesWithMultiplier"],
        "phaseTwoReached": row["phaseTwoReached"],
        "terminalBossHpSum": diagnostics["terminalBossHpSum"],
        "contributions": row["contributions"],
        "castsBySkill": row["castsBySkill"],
        "advancedJewels": diagnostics.get("advancedJewels"),
    }

    def rate(total, count):
        return round(total / count, 4) if count else None

    if board is not None:
        distribution = board["legalSwapsPerTurn"]
        observed = sum(distribution.values())
        row_summary["board"] = {
            **board,
            "observedTurns": observed,
            "averageLegalSwaps": rate(sum(int(count) * turns for count, turns in distribution.items()), observed),
            "committedSwaplessRate": rate(distribution.get("0", 0), observed),
            "refillDeadBoardRate": rate(board["deadBoardRegenerations"], board["refillSwapChecks"])
            if "refillSwapChecks" in board else None,
        }
    if combat is not None:
        turns = combat["playerTurns"]
        row_summary["combat"] = {
            **combat,
            "averagePlayerTurns": rate(turns, row["seeds"]),
            "damagePerPlayerTurn": rate(combat["bossHpDamage"], turns),
            "manaPerPlayerTurn": rate(combat["manaGenerated"], turns),
            "ragePerPlayerTurn": rate(combat["rageGenerated"], turns),
            "averageSurvivors": rate(diagnostics["survivingSeatsSum"], row["seeds"]),
            "averageFirstSkillTurnWhenCast": rate(combat["firstSkillTurnsSum"], combat["matchesWithSkill"]),
            "averageFirstUltimateTurnWhenCast": rate(combat["firstUltimateTurnsSum"], combat["matchesWithUltimate"]),
            "skillHealingEfficiency": rate(combat["skillHealingEffective"], diagnostics["healingCapacity"]),
            "shieldAbsorptionEfficiency": rate(combat["shieldAbsorbed"], combat["shieldingGranted"])
            if "shieldAbsorbed" in combat else None,
        }
    return row_summary


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--binary", type=Path, default=ROOT / "artifacts/rust/target/release/examples/arena8_coop_balance")
    parser.add_argument("--baseline", type=Path, default=ROOT / "config/gameplay/arena8-coop-v2.seed.json")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed-count", type=int, default=6)
    parser.add_argument("--seed-start", type=int, default=1)
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--bundles", nargs="+", choices=["baseline", *ELEMENTAL_VARIANTS, *FUNCTIONAL_VARIANTS, *TIMED_VARIANTS, *SHARED_VARIANTS])
    parser.add_argument("--stage", choices=["progression", "composition", "confirmation", "jewels", "warden"], default="progression")
    parser.add_argument("--mode", choices=["coop", "solo", "both"], default="coop")
    parser.add_argument("--include-regular", action="store_true", help="Include regular opponents for solo play")
    parser.add_argument("--advanced-candidate", type=Path, help="Split one authored bundle into control, skill-only and encounter-only studies")
    parser.add_argument("--parties", nargs="+", choices=tuple(PARTIES), help="Limit the selected stage to these compositions")
    parser.add_argument("--bosses", nargs="+", help="Explicit boss IDs, or 'all' for all bosses in the bundle")
    parser.add_argument("--summary-file", type=Path, help="Optional compact JSON summary path")
    args = parser.parse_args()
    if not 1 <= args.seed_count <= 25 or not 1 <= args.seed_start <= 2**32 - args.seed_count or args.jobs < 1:
        parser.error("use 1–25 seeds per row, a nonzero u32 first seed and at least one worker")
    if args.include_regular and args.mode == "coop":
        parser.error("regular encounters require --mode solo or --mode both")
    prefix = args.output.resolve()
    prefix.mkdir(parents=True, exist_ok=True)
    binary = args.binary.resolve()
    if not binary.is_file():
        parser.error(f"build the Rust example, or set --binary: {binary}")
    base = json.loads(args.baseline.read_text())
    capability = base.get("engineCapability")
    shared = capability == "arena8-coop-v5" and base.get("schemaVersion") == 6
    if not shared and capability not in ("arena8-coop-v1", "arena8-coop-v2", "arena8-coop-v3"):
        parser.error("unsupported engine capability in study input")
    functional = shared or capability in ("arena8-coop-v2", "arena8-coop-v3")
    if args.stage == "warden" and not shared:
        parser.error("the Warden progression stage requires a shared schema 6 bundle")
    base_bosses = {row["id"]: row for row in base["bosses"]}
    if args.bosses == ["all"] or (args.bosses is None and (shared or capability == "arena8-coop-v3")):
        boss_ids = tuple(base_bosses)
    elif args.bosses:
        boss_ids = tuple(args.bosses)
    else:
        boss_ids = BOSSES
    if len(set(boss_ids)) != len(boss_ids) or any(boss not in base_bosses for boss in boss_ids):
        parser.error("use distinct Boss IDs from the base bundle")
    variants = FUNCTIONAL_VARIANTS if functional else ELEMENTAL_VARIANTS
    if capability == "arena8-coop-v3":
        variants = {**variants, **TIMED_VARIANTS}
    if shared:
        variants = SHARED_VARIANTS
        if args.advanced_candidate:
            parser.error("shared RNG cannot be compared through conversion controls")
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
    if args.advanced_candidate:
        try:
            bundles.update(jewel_bundles(args.advanced_candidate, prefix))
        except (KeyError, ValueError) as error:
            parser.error(f"invalid advanced study input: {error}")
    bundle_capabilities = {name: json.loads(path.read_text())["engineCapability"] for name, path in bundles.items()}
    if args.stage == "progression":
        scenarios = [("starters", level, gear)
                     for level in (1, 5, 10, 20, 40, 60)
                     for gear in ("none", "starter-core")]
    elif args.stage == "composition":
        scenarios = [(name, 20 if name in ("starters", "same-species", "ground") else 40, "starter-core")
                     for name in HISTORICAL_COMPOSITIONS]
        scenarios += [
            ("same-species", 20, "trained-core"),
            ("starters", 20, "cinder-core"),
            ("starters", 40, "stormcoil-loadout"),
        ]
    elif args.stage == "confirmation":
        scenarios = [("starters", 10, "starter-core"), ("starters", 20, "starter-core"),
                     ("starters", 40, "starter-core"), ("starters", 60, "starter-core"),
                     ("ground", 40, "starter-core"), ("icarus", 40, "starter-core")]
    elif args.stage == "warden":
        scenarios = WARDEN_CASES
    else:
        scenarios = JEWEL_CASES
    if args.parties:
        scenarios = [scenario for scenario in scenarios if scenario[0] in args.parties]
        if {scenario[0] for scenario in scenarios} != set(args.parties):
            parser.error("the selected stage has no case for one or more requested parties")

    seat_inputs = {}
    for name, level, gear in scenarios:
        seats = party(name, level, gear, base)
        if args.mode in ("coop", "both"):
            seat_inputs["coop", name, level, gear] = seats
        if args.mode in ("solo", "both"):
            for seat in seats:
                seat_inputs.setdefault(("solo", seat["petId"], level, gear), seat)

    def run(case):
        bundle, (mode, name, level, gear) = case
        stem = stem_for(mode, name, level, gear)
        party_path = prefix / "parties" / f"{stem}.json"
        encounters = list(boss_ids)
        if mode == "solo" and args.include_regular:
            encounters.extend(base_bosses[boss]["regular"]["id"] for boss in boss_ids if base_bosses[boss].get("regular"))
        rows = []
        commands = []
        mode_flags = ["--solo"] if mode == "solo" else []
        for index in range(0, len(encounters), 2):
            command = [
                binary, *mode_flags, bundles[bundle], party_path, str(args.seed_start),
                str(args.seed_count), *encounters[index:index + 2]
            ]
            commands.append(list(map(str, command)))
            rows.extend(json.loads(subprocess.check_output(command)))
        value = {"bundle": bundle, "engineCapability": bundle_capabilities[bundle],
                 "mode": mode, "party": name, "level": level, "gear": gear,
                 "seedStart": args.seed_start, "seedCount": args.seed_count,
                 "bosses": list(boss_ids), "encounters": encounters,
                 "command": commands[0], "commands": commands, "rows": rows}
        dump(prefix / f"{stem}-{bundle}.json", value)
        return value

    def stem_for(mode, name, level, gear):
        mode_prefix = "solo-" if mode == "solo" else ""
        return f"{args.stage}-{mode_prefix}{name}-{level}-{gear}"

    (prefix / "parties").mkdir(exist_ok=True)
    for scenario, seats in seat_inputs.items():
        dump(prefix / "parties" / f"{stem_for(*scenario)}.json", seats)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as executor:
        results = list(executor.map(run, ((bundle, case) for case in seat_inputs for bundle in bundles)))
    dump(prefix / f"{args.stage}-results.json", results)
    dump(prefix / f"{args.stage}-digests.json", {item["bundle"]: item["rows"][0]["contentDigest"] for item in results})
    if args.summary_file:
        rows = [
            summarize_row(item, row)
            for item in results
            for row in item["rows"]
        ]
        summary = {
            "engineCapability": capability,
            "bundleCapabilities": bundle_capabilities,
            "seedStart": args.seed_start,
            "seedCount": args.seed_count,
            "bossCount": len(boss_ids),
            "scenarioCount": len(seat_inputs),
            "totalRowCount": len(rows),
            "totalMatches": sum(r["seeds"] for r in rows),
            "totalWins": sum(r["wins"] for r in rows),
            "totalLosses": sum(r["losses"] for r in rows),
            "totalUnresolved": sum(r["unresolved"] for r in rows),
            "totalRoundLimitDefeats": sum(r["roundLimitDefeats"] for r in rows),
            "maxAverageRounds": max((r["averageRounds"] for r in rows), default=0),
            "rowsBeyondRound40": [r for r in rows if r["averageRounds"] > 40],
            "rows": rows,
        }
        summary_path = args.summary_file.resolve()
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        dump(summary_path, summary)

if __name__ == "__main__":
    main()
