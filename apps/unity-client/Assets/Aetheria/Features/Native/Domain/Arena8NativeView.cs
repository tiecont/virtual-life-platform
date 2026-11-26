using System;
using System.Collections.Generic;
using System.Linq;
using System.Xml.Linq;

namespace Aetheria.Networking
{
    // Strict, read-only validation of the canonical `arena8.view.v1` projection.
    // Skills are string ids (never supervisor objects) and every board, resource,
    // telegraph and terminal value must match the reducer's documented invariant.
    // Unity renders this projection and submits intents; it never computes damage,
    // rewards, telegraph targets or a terminal outcome.
    public sealed class Arena8NativeView
    {
        public const int Side = 8;
        public const int Cells = Side * Side;
        // Mirrors crates/aetheria-pet-arena/src/arena8/mod.rs bounds. These are
        // validation and affordability limits, not gameplay effects.
        public const int MaxTurn = 24;
        public const int MaxHealth = 100000;
        public const int ManaCap = 300;
        public const int RageCap = 200;
        public const int MaxCooldown = 3;
        public const int MaxFireZoneTurns = 2;
        public const int EnemyShieldCap = 240;
        public const int MaxLevel = 60;
        public const string SharedSkill = "shared-skill";
        public const string Signature = "signature";
        public const string FireZone = "fire-zone";
        public const string Ultimate = "ultimate";
        public const string Guard = "guard";
        public const string StartKind = "start";
        public const string SwapKind = "swap";
        private static readonly string[] KnownSkills = { SharedSkill, Signature, FireZone, Ultimate, Guard };

        public ulong Version { get; }
        public long Epoch { get; }
        public string Reward { get; }
        public string Phase { get; }
        public int Turn { get; }
        public IReadOnlyList<int> Board { get; }
        public int Health { get; }
        public int EnemyHealth { get; }
        public int EnemyShield { get; }
        public int Mana { get; }
        public int Rage { get; }
        public int Cooldown { get; }
        public int FireZoneTurns { get; }
        public IReadOnlyList<string> Skills { get; }
        public string PetId { get; }
        public string PetName { get; }
        public string PetFamily { get; }
        public string PetElement { get; }
        public int PetLevel { get; }
        public string OwnedPetId { get; }
        public string EncounterId { get; }
        public string EncounterElement { get; }
        public int EncounterIndex { get; }
        public int EncounterRevision { get; }
        public bool EncounterBoss { get; }
        public string TelegraphKind { get; }
        public string TelegraphAxis { get; }
        public int TelegraphTarget { get; }
        public int TelegraphAnnouncedTurn { get; }
        public int TelegraphResolvesTurn { get; }
        public IReadOnlyList<int> TelegraphCells { get; }
        public string SnapshotDigest { get; }
        public string RulesetId { get; }
        public string BindingId { get; }
        public bool Terminal => Phase == "won" || Phase == "lost";
        public bool HasSkill(string id) => id != null && Skills.Contains(id);

        private Arena8NativeView(ulong version, Fields fields)
        {
            Version = version; Epoch = fields.Epoch; Reward = fields.Reward; Phase = fields.Phase;
            Turn = fields.Turn; Board = Array.AsReadOnly(fields.Board);
            Health = fields.Health; EnemyHealth = fields.EnemyHealth; EnemyShield = fields.EnemyShield;
            Mana = fields.Mana; Rage = fields.Rage; Cooldown = fields.Cooldown; FireZoneTurns = fields.FireZoneTurns;
            Skills = Array.AsReadOnly(fields.Skills);
            PetId = fields.PetId; PetName = fields.PetName; PetFamily = fields.PetFamily;
            PetElement = fields.PetElement; PetLevel = fields.PetLevel; OwnedPetId = fields.OwnedPetId;
            EncounterId = fields.EncounterId; EncounterElement = fields.EncounterElement;
            EncounterIndex = fields.EncounterIndex; EncounterRevision = fields.EncounterRevision; EncounterBoss = fields.EncounterBoss;
            TelegraphKind = fields.TelegraphKind; TelegraphAxis = fields.TelegraphAxis;
            TelegraphTarget = fields.TelegraphTarget; TelegraphAnnouncedTurn = fields.TelegraphAnnouncedTurn;
            TelegraphResolvesTurn = fields.TelegraphResolvesTurn;
            TelegraphCells = fields.TelegraphCells == null ? Array.AsReadOnly(Array.Empty<int>()) : Array.AsReadOnly(fields.TelegraphCells);
            SnapshotDigest = fields.SnapshotDigest; RulesetId = fields.RulesetId; BindingId = fields.BindingId;
        }

        public static Arena8NativeView Decode(ulong version, byte[] bytes)
        {
            var root = ProjectionJson.Parse(bytes, 16);
            ProjectionJson.ObjectFields(root, "state", "epoch", "reward");
            var epoch = ProjectionJson.Integer(root.Element("epoch"));
            if (root.Element("reward") == null) throw new FormatException("Missing Arena8 reward");
            var reward = ProjectionJson.OptionalString(root.Element("reward"));
            if (epoch < 1 || epoch > 1_000_000_000) throw new FormatException("Invalid Arena8 epoch");
            if (reward != null && reward != "REWARD_PENDING" && reward != "GRANTED" && reward != "DECLINED")
                throw new FormatException("Invalid Arena8 reward");

            var play = root.Element("state");
            ProjectionJson.ObjectFields(play, "schemaVersion", "ruleset", "pet", "stats", "artifacts", "modifiers",
                "skills", "encounter", "phase", "turn", "board", "health", "enemyHealth", "enemyShield",
                "mana", "rage", "cooldown", "fireZoneTurns", "telegraph", "snapshotDigest");
            if (ProjectionJson.Integer(play.Element("schemaVersion")) != 1) throw new FormatException("Invalid Arena8 schema");

            var fields = new Fields { Epoch = epoch, Reward = reward };
            ReadRuleset(play.Element("ruleset"), fields);
            ReadPet(play.Element("pet"), fields);
            ReadStats(play.Element("stats"), fields);
            ReadArtifacts(play.Element("artifacts"));
            ReadModifiers(play.Element("modifiers"));
            fields.Skills = ReadSkills(play.Element("skills"));
            ReadEncounter(play.Element("encounter"), fields);
            fields.Phase = Token(play.Element("phase"), "ready", "playing", "won", "lost");
            fields.Turn = Bounded(play.Element("turn"), 0, MaxTurn);
            fields.Board = Numbers(play.Element("board"), Cells, 0, 5);
            fields.Health = Bounded(play.Element("health"), 0, MaxHealth);
            fields.EnemyHealth = Bounded(play.Element("enemyHealth"), 0, MaxHealth);
            fields.EnemyShield = Bounded(play.Element("enemyShield"), 0, EnemyShieldCap);
            fields.Mana = Bounded(play.Element("mana"), 0, ManaCap);
            fields.Rage = Bounded(play.Element("rage"), 0, RageCap);
            fields.Cooldown = Bounded(play.Element("cooldown"), 0, MaxCooldown);
            fields.FireZoneTurns = Bounded(play.Element("fireZoneTurns"), 0, MaxFireZoneTurns);
            ReadTelegraph(play.Element("telegraph"), fields);
            fields.SnapshotDigest = Hex(play.Element("snapshotDigest"));
            Validate(version, fields);
            return new Arena8NativeView(version, fields);
        }

        // A hint over committed public tiles. The Rust reducer still validates
        // every swap; this method never returns or derives a combat result.
        public bool CanSwap(int first, int second)
        {
            if (Phase != "playing" || !Adjacent(first, second)) return false;
            var copy = Board.ToArray();
            var tile = copy[first]; copy[first] = copy[second]; copy[second] = tile;
            for (var at = 0; at < Cells; at++)
            {
                var x = at % Side; var y = at / Side;
                if (x <= Side - 3 && copy[at] == copy[at + 1] && copy[at] == copy[at + 2]) return true;
                if (y <= Side - 3 && copy[at] == copy[at + Side] && copy[at] == copy[at + 2 * Side]) return true;
            }
            return false;
        }

        public static bool Adjacent(int first, int second)
        {
            if (first < 0 || first >= Cells || second < 0 || second >= Cells || first == second) return false;
            return Math.Abs(first - second) == 1 && first / Side == second / Side || Math.Abs(first - second) == Side;
        }

        // Local affordability hint from committed resources. The server remains
        // the only authority for whether an ability resolves.
        public bool Affords(string skill)
        {
            if (Phase != "playing" || !HasSkill(skill)) return false;
            if (skill == Guard) return true;
            if (Cooldown != 0) return false;
            switch (skill)
            {
                case SharedSkill: return Mana >= 100;
                case Signature: return Mana >= 200 && Rage >= 150;
                case FireZone: return Mana >= 200 && Rage >= 150;
                case Ultimate: return Mana >= 300 && Rage >= 200;
                default: return false;
            }
        }

        private static void Validate(ulong version, Fields fields)
        {
            if (!(fields.BaseHealth >= 1 && fields.BaseHealth <= MaxHealth) ||
                !(fields.EffectiveHealth >= 1 && fields.EffectiveHealth <= MaxHealth) ||
                fields.Health > fields.EffectiveHealth ||
                fields.PetLevel < 1 || fields.PetLevel > MaxLevel ||
                fields.EncounterRevision < 0 || fields.EncounterRevision > 100000 ||
                fields.EncounterIndex < 0 || fields.EncounterIndex > 11)
                throw new FormatException("Invalid Arena8 bounds");
            // The native ruleset commits exactly one version per accepted action;
            // Start leaves turn 0, every later action advances the turn once.
            if (fields.Phase == "ready" ? version != 0 || fields.Turn != 0 : version != (ulong)fields.Turn + 1)
                throw new FormatException("Invalid Arena8 version");
            if (fields.Terminal != (fields.Reward != null)) throw new FormatException("Invalid Arena8 terminal");
            switch (fields.Phase)
            {
                case "ready":
                    if (fields.Health == 0 || fields.EnemyHealth == 0 || fields.Health != fields.EffectiveHealth ||
                        fields.Mana != 0 || fields.Rage != 0 || fields.Cooldown != 0 || fields.FireZoneTurns != 0 ||
                        fields.TelegraphKind != null || fields.TelegraphCells != null && fields.TelegraphCells.Length != 0)
                        throw new FormatException("Invalid Arena8 ready phase");
                    break;
                case "playing":
                    if (fields.Health == 0 || fields.EnemyHealth == 0 || fields.Turn >= MaxTurn ||
                        fields.TelegraphKind == null || fields.TelegraphAnnouncedTurn != fields.Turn ||
                        fields.TelegraphResolvesTurn != fields.Turn + 1)
                        throw new FormatException("Invalid Arena8 playing phase");
                    break;
                case "won":
                    if (fields.Health == 0 || fields.EnemyHealth != 0 || fields.TelegraphKind != null)
                        throw new FormatException("Invalid Arena8 won phase");
                    break;
                default:
                    if (fields.TelegraphKind != null || !(fields.Health == 0 || fields.Turn == MaxTurn && fields.EnemyHealth > 0))
                        throw new FormatException("Invalid Arena8 lost phase");
                    break;
            }
            if (fields.Health == 0 && fields.Phase != "lost") throw new FormatException("Invalid Arena8 health");
            if (fields.EnemyHealth == 0 && fields.Phase != "won") throw new FormatException("Invalid Arena8 enemy health");
            if (fields.Phase == "playing" && (fields.Cooldown > MaxCooldown || fields.FireZoneTurns > MaxFireZoneTurns))
                throw new FormatException("Invalid Arena8 resources");
        }

        private static void ReadRuleset(XElement ruleset, Fields fields)
        {
            ProjectionJson.ObjectFields(ruleset, "id", "version", "reducerId", "contentHash", "bindingId",
                "bindingVersion", "bindingDigest", "rosterVersion", "rulesDigest");
            fields.RulesetId = Text(ruleset.Element("id"));
            Bounded(ruleset.Element("version"), 0, 1000);
            Text(ruleset.Element("reducerId"));
            Hex(ruleset.Element("contentHash"));
            fields.BindingId = Text(ruleset.Element("bindingId"));
            Bounded(ruleset.Element("bindingVersion"), 0, 1000);
            Hex(ruleset.Element("bindingDigest"));
            Text(ruleset.Element("rosterVersion"));
            Hex(ruleset.Element("rulesDigest"));
        }

        private static void ReadPet(XElement pet, Fields fields)
        {
            ProjectionJson.ObjectFields(pet, "id", "name", "family", "element", "level", "ownedPetId");
            fields.PetId = Text(pet.Element("id"));
            fields.PetName = Text(pet.Element("name"));
            fields.PetFamily = Text(pet.Element("family"));
            fields.PetElement = Token(pet.Element("element"), "fire", "water", "electric", "ghost", "ground", "light");
            fields.PetLevel = Bounded(pet.Element("level"), 1, MaxLevel);
            fields.OwnedPetId = Text(pet.Element("ownedPetId"));
        }

        private static void ReadStats(XElement stats, Fields fields)
        {
            ProjectionJson.ObjectFields(stats, "base", "grown", "effective");
            fields.BaseHealth = CombatStats(stats.Element("base"));
            CombatStats(stats.Element("grown"));
            fields.EffectiveHealth = CombatStats(stats.Element("effective"));
        }

        private static int CombatStats(XElement stats)
        {
            ProjectionJson.ObjectFields(stats, "health", "attack", "defense");
            var health = Bounded(stats.Element("health"), 0, MaxHealth);
            Bounded(stats.Element("attack"), 0, 10000);
            Bounded(stats.Element("defense"), 0, 10000);
            return health;
        }

        private static void ReadArtifacts(XElement artifacts)
        {
            var equipped = ProjectionJson.Array(artifacts, 3);
            foreach (var artifact in equipped)
            {
                ProjectionJson.ObjectFields(artifact, "slot", "definitionId", "rank", "upgradeLevel", "modifiers");
                Token(artifact.Element("slot"), "core", "aegis", "rune");
                Text(artifact.Element("definitionId"));
                Token(artifact.Element("rank"), "D", "C", "B", "A", "S");
                Bounded(artifact.Element("upgradeLevel"), 0, 10);
                var modifiers = artifact.Element("modifiers");
                ProjectionJson.ObjectFields(modifiers, "hp", "attack", "defense", "speed");
                foreach (var name in new[] { "hp", "attack", "defense", "speed" })
                    Bounded(modifiers.Element(name), 0, 65535);
            }
        }

        private static void ReadModifiers(XElement modifiers)
        {
            ProjectionJson.ObjectFields(modifiers, "hp", "attack", "defense", "speed");
            foreach (var name in new[] { "hp", "attack", "defense", "speed" })
            {
                var modifier = modifiers.Element(name);
                ProjectionJson.ObjectFields(modifier, "value", "active", "effect", "reason");
                Bounded(modifier.Element("value"), 0, 65535);
                ProjectionJson.Boolean(modifier.Element("active"));
                Token(modifier.Element("effect"), "health", "attack", "defense", "inactive");
                Text(modifier.Element("reason"));
            }
        }

        private static string[] ReadSkills(XElement skills)
        {
            var items = ProjectionJson.Array(skills, KnownSkills.Length);
            if (items.Length < 2) throw new FormatException("Invalid Arena8 skills");
            var values = new string[items.Length];
            for (var at = 0; at < items.Length; at++)
                values[at] = Token(items[at], KnownSkills);
            if (values.Distinct().Count() != values.Length) throw new FormatException("Invalid Arena8 skills");
            return values;
        }

        private static void ReadEncounter(XElement encounter, Fields fields)
        {
            ProjectionJson.ObjectFields(encounter, "index", "id", "revision", "boss", "element");
            fields.EncounterIndex = Bounded(encounter.Element("index"), 0, 11);
            fields.EncounterId = Text(encounter.Element("id"));
            fields.EncounterRevision = Bounded(encounter.Element("revision"), 0, 100000);
            fields.EncounterBoss = ProjectionJson.Boolean(encounter.Element("boss"));
            fields.EncounterElement = Token(encounter.Element("element"), "fire", "water", "electric", "ghost", "ground", "light");
        }

        private static void ReadTelegraph(XElement telegraph, Fields fields)
        {
            if (ProjectionJson.Type(telegraph) == "null")
            {
                ProjectionJson.OptionalString(telegraph);
                return;
            }
            ProjectionJson.ObjectFields(telegraph, "kind", "axis", "target", "announcedTurn", "resolvesTurn", "cells");
            fields.TelegraphKind = Token(telegraph.Element("kind"), "assault", "heavy", "guard");
            fields.TelegraphAxis = Token(telegraph.Element("axis"), "row", "column");
            fields.TelegraphTarget = Bounded(telegraph.Element("target"), 0, Side - 1);
            fields.TelegraphAnnouncedTurn = Bounded(telegraph.Element("announcedTurn"), 0, MaxTurn - 1);
            fields.TelegraphResolvesTurn = Bounded(telegraph.Element("resolvesTurn"), 1, MaxTurn);
            fields.TelegraphCells = Numbers(telegraph.Element("cells"), Side, 0, Cells - 1);
            if (fields.TelegraphResolvesTurn != fields.TelegraphAnnouncedTurn + 1)
                throw new FormatException("Invalid Arena8 telegraph");
            var lane = Lane(fields.TelegraphAxis, fields.TelegraphTarget);
            if (!fields.TelegraphCells.SequenceEqual(lane) || fields.TelegraphCells.Distinct().Count() != Side)
                throw new FormatException("Invalid Arena8 telegraph cells");
        }

        private static int[] Lane(string axis, int target)
        {
            var cells = new int[Side];
            for (var offset = 0; offset < Side; offset++)
                cells[offset] = axis == "row" ? target * Side + offset : offset * Side + target;
            return cells;
        }

        private static string Text(XElement field)
        {
            var value = ProjectionJson.Scalar(field, "string");
            if (value.Length > 256) throw new FormatException("Invalid Arena8 string");
            return value;
        }

        private static string Token(XElement field, params string[] allowed)
        {
            var value = ProjectionJson.Scalar(field, "string");
            if (!allowed.Contains(value)) throw new FormatException("Invalid Arena8 token");
            return value;
        }

        private static string Hex(XElement field)
        {
            var value = ProjectionJson.Scalar(field, "string");
            if (value.Length != 64 || !value.All(Uri.IsHexDigit)) throw new FormatException("Invalid Arena8 digest");
            return value;
        }

        private static int Bounded(XElement field, int minimum, int maximum)
        {
            var value = ProjectionJson.Integer(field);
            if (value < minimum || value > maximum) throw new FormatException("Invalid Arena8 integer");
            return (int)value;
        }

        private static int[] Numbers(XElement field, int count, int minimum, int maximum)
        {
            var items = ProjectionJson.Array(field, count);
            if (items.Length != count) throw new FormatException("Invalid Arena8 array length");
            var values = new int[count];
            for (var at = 0; at < count; at++)
            {
                var value = ProjectionJson.Integer(items[at]);
                if (value < minimum || value > maximum) throw new FormatException("Invalid Arena8 array value");
                values[at] = (int)value;
            }
            return values;
        }

        private sealed class Fields
        {
            public long Epoch; public string Reward, Phase;
            public int Turn, Health, EnemyHealth, EnemyShield, Mana, Rage, Cooldown, FireZoneTurns;
            public int[] Board;
            public int BaseHealth, EffectiveHealth, PetLevel, EncounterIndex, EncounterRevision;
            public bool EncounterBoss;
            public string PetId, PetName, PetFamily, PetElement, OwnedPetId;
            public string EncounterId, EncounterElement, SnapshotDigest, RulesetId, BindingId;
            public bool Terminal => Phase == "won" || Phase == "lost";
            public string TelegraphKind, TelegraphAxis;
            public int TelegraphTarget, TelegraphAnnouncedTurn, TelegraphResolvesTurn;
            public int[] TelegraphCells;
            public string[] Skills;
        }
    }
}
