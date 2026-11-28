using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Xml.Linq;

namespace Aetheria.Networking
{
    // Strict, read-only validation of the canonical `arena8-coop.view.v1`
    // projection. Every participant, board tile, boss value and terminal phase
    // comes from the committed cooperative reducer; Unity renders this projection
    // and submits bounded intents, never damage, rewards or seat outcomes.
    public sealed class CoopNativeView
    {
        public const string Ruleset = "arena8-coop-pve";
        public const string FunctionalSoloRuleset = "arena8-functional-pve";
        public const int ElementalVersion = 1;
        public const int FunctionalVersion = 2;
        public const int TimedFunctionalVersion = 3;
        public const int SoloTimedFunctionalVersion = 2;
        public const int Seats = 4;
        public const int Side = 8;
        public const int Cells = Side * Side;
        public const int MaxTurn = 4096;
        public const int MaxRound = 1000;
        private const int TechnicalMaxCounter = ushort.MaxValue;
        public const uint MaxHealth = uint.MaxValue;
        public const int MaxMana = ushort.MaxValue;
        public const int MaxRage = ushort.MaxValue;
        public const int MaxCooldown = byte.MaxValue;
        public const string Guard = "guard";
        public const string Skill = "skill";
        public const string Signature = "signature";
        public const string Ultimate = "ultimate";
        public const string FireZone = "fire-zone";
        private static readonly string[] Elements = { "fire", "water", "electric", "ghost", "ground", "light" };
        private static readonly string[] TileKinds = { "sword", "mana", "rage", "heart", "shield", "special" };
        private static readonly string[] Statuses = { "attack-buff", "defense-buff", "vulnerability" };
        private static readonly string[] AbilityKinds = { Guard, Skill, Signature, Ultimate, FireZone };

        public sealed class Tile
        {
            public string Element { get; }
            public string Kind { get; }
            public string Identity => Kind ?? Element;
            public int Multiplier { get; }

            internal Tile(string identity, int multiplier, bool functional)
            {
                Element = functional ? null : identity;
                Kind = functional ? identity : null;
                Multiplier = multiplier;
            }
        }

        public sealed class Status
        {
            public string Kind { get; }
            public int Value { get; }
            public int Turns { get; }
            internal Status(string kind, int value, int turns) { Kind = kind; Value = value; Turns = turns; }
        }

        public sealed class Contribution
        {
            public ulong Damage { get; }
            public ulong Healing { get; }
            public ulong Shielding { get; }
            internal Contribution(ulong damage, ulong healing, ulong shielding)
            { Damage = damage; Healing = healing; Shielding = shielding; }
        }

        public sealed class Participant
        {
            public int Seat { get; }
            public string PetId { get; }
            public int Level { get; }
            public uint Health { get; }
            public uint MaxHealth { get; }
            public uint Attack { get; }
            public uint Defense { get; }
            public int CritRateBp { get; }
            public int CritDamageBp { get; }
            public int Mana { get; }
            public int Rage { get; }
            public uint Shield { get; }
            public int ShieldTurns { get; }
            public IReadOnlyList<int> Cooldowns { get; }
            public IReadOnlyList<int> SkillLevels { get; }
            public IReadOnlyList<Status> Statuses { get; }
            public Contribution Contribution { get; }
            public bool Alive { get; }
            public bool HasUltimate { get; }
            public bool UltimateReady { get; }
            public IReadOnlyList<string> Passives { get; }
            public int FireZoneTurns { get; }

            internal Participant(int seat, string petId, int level, uint health, uint maxHealth, uint attack, uint defense,
                int critRateBp, int critDamageBp, int mana, int rage, uint shield, int shieldTurns,
                int[] cooldowns, int[] skillLevels, Status[] statuses, Contribution contribution, bool alive,
                bool hasUltimate, bool ultimateReady, string[] passives, int fireZoneTurns)
            {
                Seat = seat; PetId = petId; Level = level; Health = health; MaxHealth = maxHealth;
                Attack = attack; Defense = defense; CritRateBp = critRateBp; CritDamageBp = critDamageBp;
                Mana = mana; Rage = rage; Shield = shield; ShieldTurns = shieldTurns;
                Cooldowns = Array.AsReadOnly(cooldowns); SkillLevels = Array.AsReadOnly(skillLevels); Statuses = Array.AsReadOnly(statuses);
                Contribution = contribution; Alive = alive;
                HasUltimate = hasUltimate; UltimateReady = ultimateReady;
                Passives = Array.AsReadOnly(passives ?? Array.Empty<string>());
                FireZoneTurns = fireZoneTurns;
            }
        }

        public sealed class Boss
        {
            public uint Health { get; }
            public uint MaxHealth { get; }
            public int Phase { get; }
            public uint Shield { get; }
            public int ArmorBreakPm { get; }
            public uint DotDamage { get; }
            public int DotTurns { get; }
            public bool Transformed { get; }
            internal Boss(uint health, uint maxHealth, int phase, uint shield, int armorBreakPm,
                uint dotDamage, int dotTurns, bool transformed)
            {
                Health = health; MaxHealth = maxHealth; Phase = phase; Shield = shield;
                ArmorBreakPm = armorBreakPm; DotDamage = dotDamage; DotTurns = dotTurns; Transformed = transformed;
            }
        }

        public sealed class Pending
        {
            public int Targets { get; }
            public int Remaining { get; }
            public uint Damage { get; }
            internal Pending(int targets, int remaining, uint damage)
            { Targets = targets; Remaining = remaining; Damage = damage; }
        }

        public sealed class Ability
        {
            public string Kind { get; }
            public string Id { get; }
            public int Mana { get; }
            public int Rage { get; }
            public int Cooldown { get; }
            public bool Ready { get; }
            public int MaxCooldown { get; }
            public string EffectKind { get; }
            public string Target { get; }
            public uint PowerPm { get; }

            internal Ability(XElement value, string expectedKind, bool allowV3Fields)
            {
                if (allowV3Fields)
                    ProjectionJson.ObjectFields(value, "kind", "id", "mana", "rage", "cooldown", "ready",
                        "maxCooldown", "effectKind", "target", "powerPm");
                else
                    ProjectionJson.ObjectFields(value, "kind", "id", "mana", "rage", "cooldown", "ready");

                Kind = expectedKind != null ? Token(value.Element("kind"), expectedKind) : Token(value.Element("kind"), AbilityKinds);
                Id = allowV3Fields ? Text(value.Element("id"), 1, 64) : Text(value.Element("id"), 3, 128);
                Mana = Bounded(value.Element("mana"), 0, ushort.MaxValue);
                Rage = Bounded(value.Element("rage"), 0, ushort.MaxValue);
                Cooldown = Bounded(value.Element("cooldown"), 0, byte.MaxValue);
                Ready = ProjectionJson.Boolean(value.Element("ready"));

                if (!allowV3Fields) return;
                MaxCooldown = Bounded(value.Element("maxCooldown"), 0, byte.MaxValue);
                EffectKind = Text(value.Element("effectKind"), 1, 64);
                Target = Text(value.Element("target"), 1, 64);
                PowerPm = CombatValue(value.Element("powerPm"), 1);
            }
        }

        public IReadOnlyList<Ability> Abilities { get; }
        public string BossId { get; }
        public ulong Version { get; }
        public long Epoch { get; }
        public string Reward { get; }
        public string RulesetId { get; }
        public int RulesetVersion { get; }
        public string ContentHash { get; }
        public bool IsFunctionalBoard => RulesetVersion >= FunctionalVersion || RulesetId == FunctionalSoloRuleset;
        public bool IsTimed => RulesetVersion == (RulesetId == FunctionalSoloRuleset
            ? SoloTimedFunctionalVersion : TimedFunctionalVersion);
        public string ConfigDigest { get; }
        public int You { get; }
        public string Phase { get; }
        public int ActiveSeat { get; }
        public int Turn { get; }
        public int Round { get; }
        public Boss BossState { get; }
        public IReadOnlyList<Tile> Board { get; }
        public IReadOnlyList<Participant> Participants { get; }
        public Pending PendingAttack { get; }
        public int? TurnTimeoutMs { get; }
        public ulong? TurnDeadlineUnixMs { get; }
        public ulong? TurnRemainingMs { get; }
        public ulong? ServerUnixMs { get; }
        public int? MaxRounds { get; }
        public bool CanEndTurn { get; }
        public int FireZoneActiveTurns { get; }
        public IReadOnlyList<int> FireZoneCells { get; }
        public bool Terminal => Phase == "won" || Phase == "lost";
        public Participant Own => Participants[You];

        private CoopNativeView(ulong version, long epoch, string reward, Fields fields)
        {
            Version = version; Epoch = epoch; Reward = reward;
            Abilities = Array.AsReadOnly(fields.Abilities); BossId = fields.BossId;
            RulesetId = fields.RulesetId; RulesetVersion = fields.RulesetVersion;
            ContentHash = fields.ContentHash; ConfigDigest = fields.ConfigDigest;
            You = fields.You; Phase = fields.Phase; ActiveSeat = fields.ActiveSeat; Turn = fields.Turn; Round = fields.Round;
            BossState = fields.Boss; Board = Array.AsReadOnly(fields.Board);
            Participants = Array.AsReadOnly(fields.Participants); PendingAttack = fields.Pending;
            TurnTimeoutMs = fields.TurnTimeoutMs;
            TurnDeadlineUnixMs = fields.TurnDeadlineUnixMs;
            TurnRemainingMs = fields.TurnRemainingMs;
            ServerUnixMs = fields.ServerUnixMs;
            MaxRounds = fields.MaxRounds;
            CanEndTurn = fields.CanEndTurn;
            FireZoneActiveTurns = fields.FireZoneActiveTurns;
            FireZoneCells = Array.AsReadOnly(fields.FireZoneCells ?? Array.Empty<int>());
        }

        public static CoopNativeView Decode(ulong version, byte[] bytes)
        {
            var root = ProjectionJson.Parse(bytes, 20);
            ProjectionJson.ObjectFields(root, "state", "epoch", "reward");
            var epoch = ProjectionJson.Integer(root.Element("epoch"));
            if (root.Element("reward") == null) throw new FormatException("Missing coop reward");
            var reward = ProjectionJson.OptionalString(root.Element("reward"));
            if (epoch < 1 || epoch > 1_000_000_000) throw new FormatException("Invalid coop epoch");
            if (reward != null && reward != "REWARD_PENDING" && reward != "GRANTED" && reward != "DECLINED")
                throw new FormatException("Invalid coop reward");
            var play = root.Element("state");
            if (play == null || ProjectionJson.Type(play) != "object")
                throw new FormatException("Missing coop play state");

            var ruleset = play.Element("ruleset");
            ProjectionJson.ObjectFields(ruleset, "id", "version", "contentHash", "configDigest");
            var fields = new Fields { Epoch = epoch, Reward = reward };
            fields.RulesetId = Token(ruleset.Element("id"), Ruleset, FunctionalSoloRuleset);
            var solo = fields.RulesetId == FunctionalSoloRuleset;
            var seatCount = solo ? 1 : Seats;
            fields.RulesetVersion = Bounded(ruleset.Element("version"), ElementalVersion,
                solo ? SoloTimedFunctionalVersion : TimedFunctionalVersion);
            var isV3 = (solo && fields.RulesetVersion == SoloTimedFunctionalVersion) ||
                (!solo && fields.RulesetVersion == TimedFunctionalVersion);

            if (isV3)
            {
                ProjectionJson.ObjectFields(play, "schemaVersion", "ruleset", "you", "phase", "activeSeat",
                    "turn", "round", "boss", "board", "participants", "pending", "abilities", "bossId",
                    "turnTimeoutMs", "turnDeadlineUnixMs", "turnRemainingMs", "serverUnixMs",
                    "maxRounds", "canEndTurn", "fireZoneActiveTurns", "fireZoneCells");
            }
            else
            {
                ProjectionJson.ObjectFields(play, "schemaVersion", "ruleset", "you", "phase", "activeSeat",
                    "turn", "round", "boss", "board", "participants", "pending", "abilities", "bossId");
            }

            if (ProjectionJson.Integer(play.Element("schemaVersion")) != 1) throw new FormatException("Invalid coop schema");

            fields.ContentHash = Hex(ruleset.Element("contentHash"));
            fields.ConfigDigest = Hex(ruleset.Element("configDigest"));
            fields.You = Bounded(play.Element("you"), 0, seatCount - 1);
            fields.Phase = Token(play.Element("phase"), "ready", "playing", "won", "lost");
            fields.ActiveSeat = Bounded(play.Element("activeSeat"), 0, seatCount - 1);
            var maxTurn = isV3 ? TechnicalMaxCounter : (fields.Phase == "lost" ? MaxTurn + 1 : MaxTurn);
            var maxRound = isV3 ? TechnicalMaxCounter : (fields.Phase == "lost" ? MaxRound + 1 : MaxRound);
            fields.Turn = Bounded(play.Element("turn"), 0, maxTurn);
            fields.Round = Bounded(play.Element("round"), 1, maxRound);

            if (isV3)
            {
                fields.TurnTimeoutMs = Bounded(play.Element("turnTimeoutMs"), 1000, 300_000);
                fields.TurnDeadlineUnixMs = NullableUnsigned(play.Element("turnDeadlineUnixMs"));
                fields.TurnRemainingMs = NullableUnsigned(play.Element("turnRemainingMs"));
                fields.ServerUnixMs = Unsigned(play.Element("serverUnixMs"));
                var maxRounds = NullableUnsigned(play.Element("maxRounds"));
                if (maxRounds.HasValue && (maxRounds.Value == 0 || maxRounds.Value > TechnicalMaxCounter))
                    throw new FormatException("Coop maxRounds out of range");
                fields.MaxRounds = (int?)maxRounds;
                fields.CanEndTurn = ProjectionJson.Boolean(play.Element("canEndTurn"));
                fields.FireZoneActiveTurns = Bounded(play.Element("fireZoneActiveTurns"), 0, byte.MaxValue);
                fields.FireZoneCells = ProjectionJson.Array(play.Element("fireZoneCells"), Cells)
                    .Select(item => Bounded(item, 0, Cells - 1)).ToArray();
            }

            if (play.Element("abilities") != null)
            {
                var entries = ProjectionJson.Array(play.Element("abilities"), AbilityKinds.Length);
                if (!isV3)
                {
                    if (entries.Length < 4) throw new FormatException("Incomplete ability projection");
                    fields.Abilities = entries.Select((value, slot) => new Ability(value, AbilityKinds[slot], false)).ToArray();
                }
                else
                {
                    if (entries.Length < 1) throw new FormatException("Incomplete ability projection");
                    var list = new Ability[entries.Length];
                    var lastOrder = -1;
                    for (var i = 0; i < entries.Length; i++)
                    {
                        var ability = new Ability(entries[i], null, true);
                        var order = Array.IndexOf(AbilityKinds, ability.Kind);
                        if (order <= lastOrder)
                            throw new FormatException("Duplicate or unordered ability kind");
                        lastOrder = order;
                        list[i] = ability;
                    }
                    fields.Abilities = list;
                }
                fields.BossId = Text(play.Element("bossId"), 3, 64);
            }
            fields.Boss = ReadBoss(play.Element("boss"));
            fields.Board = ReadBoard(play.Element("board"), solo || fields.RulesetVersion >= FunctionalVersion);
            fields.Participants = ReadParticipants(play.Element("participants"), seatCount, isV3);
            fields.Pending = ReadPending(play.Element("pending"), seatCount);
            if (isV3) ValidateTimedFields(fields);
            return new CoopNativeView(version, epoch, reward, fields);
        }

        private static void ValidateTimedFields(Fields fields)
        {
            var deadline = fields.TurnDeadlineUnixMs;
            var serverTime = fields.ServerUnixMs.Value;
            ulong? remaining = deadline.HasValue ? (deadline.Value > serverTime ? deadline.Value - serverTime : 0) : null;
            var playing = fields.Phase == "playing";
            if (fields.TurnRemainingMs != remaining || (!playing && deadline.HasValue) ||
                (fields.CanEndTurn && (!playing || fields.You != fields.ActiveSeat ||
                    !fields.Participants[fields.You].Alive || remaining == 0)))
                throw new FormatException("Inconsistent coop turn projection");
            if (fields.FireZoneCells.Distinct().Count() != fields.FireZoneCells.Length ||
                (fields.FireZoneActiveTurns > 0) != (fields.FireZoneCells.Length > 0))
                throw new FormatException("Inconsistent coop Fire Zone projection");
        }

        private static Boss ReadBoss(XElement boss)
        {
            ProjectionJson.ObjectFields(boss, "hp", "maxHp", "phase", "shield", "armorBreakPm",
                "dotDamage", "dotTurns", "transformed");
            var maxHealth = CombatValue(boss.Element("maxHp"), 1);
            var health = CombatValue(boss.Element("hp"), 0);
            if (health > maxHealth) throw new FormatException("Boss health exceeds its maximum");
            return new Boss(health, maxHealth, Bounded(boss.Element("phase"), 1, 2),
                CombatValue(boss.Element("shield"), 0), Bounded(boss.Element("armorBreakPm"), 0, 10_000),
                CombatValue(boss.Element("dotDamage"), 0), Bounded(boss.Element("dotTurns"), 0, 100),
                ProjectionJson.Boolean(boss.Element("transformed")));
        }

        private static Tile[] ReadBoard(XElement board, bool functional)
        {
            var items = ProjectionJson.Array(board, Cells);
            if (items.Length != Cells) throw new FormatException("Invalid coop board size");
            var tiles = new Tile[Cells];
            var field = functional ? "kind" : "element";
            var identities = functional ? TileKinds : Elements;
            for (var index = 0; index < items.Length; index += 1)
            {
                var item = items[index];
                if (ProjectionJson.Type(item) == "null")
                {
                    if (ProjectionJson.Scalar(item, "null").Length != 0) throw new FormatException("Invalid coop tile");
                    continue;
                }
                ProjectionJson.ObjectFields(item, field, "multiplier");
                tiles[index] = new Tile(Token(item.Element(field), identities),
                    Bounded(item.Element("multiplier"), 1, Cells), functional);
            }
            return tiles;
        }

        private static Participant[] ReadParticipants(XElement participants, int seatCount, bool allowV3Fields)
        {
            var items = ProjectionJson.Array(participants, seatCount);
            if (items.Length != seatCount) throw new FormatException("Invalid coop participant count");
            var seats = new Participant[seatCount];
            for (var index = 0; index < items.Length; index += 1)
            {
                var seat = items[index];
                if (allowV3Fields)
                    ProjectionJson.ObjectFields(seat, "seat", "petId", "level", "hp", "maxHp", "attack", "defense",
                        "critRateBp", "critDamageBp", "mana", "rage", "shield", "shieldTurns", "cooldowns",
                        "statuses", "contribution", "alive", "skillLevels",
                        "hasUltimate", "ultimateReady", "passives", "fireZoneTurns");
                else
                    ProjectionJson.ObjectFields(seat, "seat", "petId", "level", "hp", "maxHp", "attack", "defense",
                        "critRateBp", "critDamageBp", "mana", "rage", "shield", "shieldTurns", "cooldowns",
                        "statuses", "contribution", "alive", "skillLevels");

                if (Bounded(seat.Element("seat"), 0, seatCount - 1) != index) throw new FormatException("Invalid coop seat");
                var maxHealth = CombatValue(seat.Element("maxHp"), 1);
                var health = CombatValue(seat.Element("hp"), 0);
                if (health > maxHealth) throw new FormatException("Seat health exceeds its maximum");
                var cooldowns = ProjectionJson.Array(seat.Element("cooldowns"), 5)
                    .Select(item => Bounded(item, 0, MaxCooldown)).ToArray();
                if (cooldowns.Length != 5) throw new FormatException("Invalid coop cooldowns");
                var rankField = seat.Element("skillLevels");
                var skillLevels = rankField == null ? new[] { 1, 1, 1, 1, 1 }
                    : ProjectionJson.Array(rankField, 5).Select(item => Bounded(item, 1, 10)).ToArray();
                if (skillLevels.Length != 5) throw new FormatException("Invalid coop skill levels");
                var statuses = ProjectionJson.Array(seat.Element("statuses"), 8).Select(ReadStatus).ToArray();
                var contribution = seat.Element("contribution");
                ProjectionJson.ObjectFields(contribution, "damage", "healing", "shielding");
                var value = new Contribution(Unsigned(contribution.Element("damage")),
                    Unsigned(contribution.Element("healing")),
                    Unsigned(contribution.Element("shielding")));

                var hasUltimate = !allowV3Fields || ProjectionJson.Boolean(seat.Element("hasUltimate"));
                var ultimateReady = allowV3Fields && ProjectionJson.Boolean(seat.Element("ultimateReady"));
                var fireZoneTurns = allowV3Fields ? Bounded(seat.Element("fireZoneTurns"), 0, byte.MaxValue) : 0;
                var passives = allowV3Fields ? ProjectionJson.Array(seat.Element("passives"), 16)
                    .Select(passive => Text(passive, 1, 64)).ToArray() : Array.Empty<string>();

                seats[index] = new Participant(index, Text(seat.Element("petId"), 1, 64),
                    Bounded(seat.Element("level"), 1, 60), health, maxHealth,
                    CombatValue(seat.Element("attack"), 0), CombatValue(seat.Element("defense"), 0),
                    Bounded(seat.Element("critRateBp"), 0, 10_000), Bounded(seat.Element("critDamageBp"), 0, 100_000),
                    Bounded(seat.Element("mana"), 0, MaxMana), Bounded(seat.Element("rage"), 0, MaxRage),
                    CombatValue(seat.Element("shield"), 0), Bounded(seat.Element("shieldTurns"), 0, 100),
                    cooldowns, skillLevels, statuses, value, ProjectionJson.Boolean(seat.Element("alive")),
                    hasUltimate, ultimateReady, passives, fireZoneTurns);
            }
            return seats;
        }

        private static Status ReadStatus(XElement status)
        {
            ProjectionJson.ObjectFields(status, "kind", "value", "turns");
            return new Status(Token(status.Element("kind"), Statuses),
                Bounded(status.Element("value"), -100_000, 100_000), Bounded(status.Element("turns"), 0, 100));
        }

        private static Pending ReadPending(XElement pending, int seatCount)
        {
            if (pending == null || ProjectionJson.Type(pending) == "null")
            {
                if (pending != null && ProjectionJson.Scalar(pending, "null").Length != 0)
                    throw new FormatException("Invalid coop pending attack");
                return null;
            }
            ProjectionJson.ObjectFields(pending, "targets", "remaining", "damage");
            return new Pending(Bounded(pending.Element("targets"), 1, seatCount),
                Bounded(pending.Element("remaining"), 0, 10), CombatValue(pending.Element("damage"), 0));
        }

        public bool CanSwap(int first, int second)
        {
            if (first < 0 || first >= Cells || second < 0 || second >= Cells || first == second) return false;
            var row = first / Side;
            var col = first % Side;
            var otherRow = second / Side;
            var otherCol = second % Side;
            if (Math.Abs(row - otherRow) + Math.Abs(col - otherCol) != 1) return false;
            return Board[first] != null && Board[second] != null && Board[first].Identity != Board[second].Identity;
        }

        public int Cooldown(int slot) => slot < 0 || slot >= Own.Cooldowns.Count ? MaxCooldown : Own.Cooldowns[slot];

        public int SlotForAbility(string kind) => Array.IndexOf(AbilityKinds, kind);

        private static ulong? NullableUnsigned(XElement field)
        {
            if (ProjectionJson.Type(field) != "null") return Unsigned(field);
            if (ProjectionJson.Scalar(field, "null").Length != 0) throw new FormatException("Invalid projection null");
            return null;
        }

        private static string Text(XElement field, int minimum, int maximum)
        {
            var value = ProjectionJson.Scalar(field, "string");
            if (value.Length < minimum || value.Length > maximum) throw new FormatException("Invalid coop text");
            return value;
        }

        private static string Token(XElement field, params string[] allowed)
        {
            var value = ProjectionJson.Scalar(field, "string");
            if (!allowed.Contains(value)) throw new FormatException("Invalid coop token");
            return value;
        }

        private static ulong Unsigned(XElement field)
        {
            if (!ulong.TryParse(ProjectionJson.Scalar(field, "number"), NumberStyles.None,
                CultureInfo.InvariantCulture, out var value)) throw new FormatException("Invalid unsigned coop value");
            return value;
        }

        private static uint CombatValue(XElement field, uint minimum)
        {
            var value = Unsigned(field);
            if (value < minimum || value > MaxHealth) throw new FormatException("Coop combat value out of range");
            return (uint)value;
        }

        private static int Bounded(XElement field, int minimum, int maximum)
        {
            var value = ProjectionJson.Integer(field);
            if (value < minimum || value > maximum) throw new FormatException("Coop value out of range");
            return (int)value;
        }

        private static string Hex(XElement field)
        {
            var value = ProjectionJson.Scalar(field, "string");
            if (value.Length != 64 || !value.All(character => Uri.IsHexDigit(character)))
                throw new FormatException("Invalid coop digest");
            return value;
        }

        private sealed class Fields
        {
            public long Epoch;
            public string Reward;
            public string RulesetId;
            public int RulesetVersion;
            public string ContentHash;
            public string ConfigDigest;
            public int You;
            public string Phase;
            public int ActiveSeat;
            public int Turn;
            public int Round;
            public Boss Boss;
            public Ability[] Abilities = Array.Empty<Ability>();
            public string BossId;
            public Tile[] Board;
            public Participant[] Participants;
            public Pending Pending;
            public int? TurnTimeoutMs;
            public ulong? TurnDeadlineUnixMs;
            public ulong? TurnRemainingMs;
            public ulong? ServerUnixMs;
            public int? MaxRounds;
            public bool CanEndTurn;
            public int FireZoneActiveTurns;
            public int[] FireZoneCells;
        }
    }
}
