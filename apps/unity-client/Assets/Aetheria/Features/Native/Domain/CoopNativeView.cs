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
        public const int Seats = 4;
        public const int Side = 8;
        public const int Cells = Side * Side;
        public const int MaxTurn = 4096;
        public const int MaxRound = 1000;
        public const int MaxHealth = 100000;
        public const int MaxMana = 10000;
        public const int MaxRage = 10000;
        public const int MaxCooldown = 100;
        public const string Guard = "guard";
        public const string Skill = "skill";
        public const string Signature = "signature";
        public const string Ultimate = "ultimate";
        public const string FireZone = "fire-zone";
        private static readonly string[] Elements = { "fire", "water", "electric", "ghost", "ground", "light" };
        private static readonly string[] Statuses = { "attack-buff", "defense-buff", "vulnerability" };

        public sealed class Tile
        {
            public string Element { get; }
            public int Multiplier { get; }
            internal Tile(string element, int multiplier) { Element = element; Multiplier = multiplier; }
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
            public int Damage { get; }
            public int Healing { get; }
            public int Shielding { get; }
            internal Contribution(int damage, int healing, int shielding)
            { Damage = damage; Healing = healing; Shielding = shielding; }
        }

        public sealed class Participant
        {
            public int Seat { get; }
            public string PetId { get; }
            public int Level { get; }
            public int Health { get; }
            public int MaxHealth { get; }
            public int Attack { get; }
            public int Defense { get; }
            public int CritRateBp { get; }
            public int CritDamageBp { get; }
            public int Mana { get; }
            public int Rage { get; }
            public int Shield { get; }
            public int ShieldTurns { get; }
            public IReadOnlyList<int> Cooldowns { get; }
            public IReadOnlyList<Status> Statuses { get; }
            public Contribution Contribution { get; }
            public bool Alive { get; }
            internal Participant(int seat, string petId, int level, int health, int maxHealth, int attack, int defense,
                int critRateBp, int critDamageBp, int mana, int rage, int shield, int shieldTurns,
                int[] cooldowns, Status[] statuses, Contribution contribution, bool alive)
            {
                Seat = seat; PetId = petId; Level = level; Health = health; MaxHealth = maxHealth;
                Attack = attack; Defense = defense; CritRateBp = critRateBp; CritDamageBp = critDamageBp;
                Mana = mana; Rage = rage; Shield = shield; ShieldTurns = shieldTurns;
                Cooldowns = Array.AsReadOnly(cooldowns); Statuses = Array.AsReadOnly(statuses);
                Contribution = contribution; Alive = alive;
            }
        }

        public sealed class Boss
        {
            public int Health { get; }
            public int MaxHealth { get; }
            public int Phase { get; }
            public int Shield { get; }
            public int ArmorBreakPm { get; }
            public int DotDamage { get; }
            public int DotTurns { get; }
            public bool Transformed { get; }
            internal Boss(int health, int maxHealth, int phase, int shield, int armorBreakPm,
                int dotDamage, int dotTurns, bool transformed)
            {
                Health = health; MaxHealth = maxHealth; Phase = phase; Shield = shield;
                ArmorBreakPm = armorBreakPm; DotDamage = dotDamage; DotTurns = dotTurns; Transformed = transformed;
            }
        }

        public sealed class Pending
        {
            public int Targets { get; }
            public int Remaining { get; }
            public int Damage { get; }
            internal Pending(int targets, int remaining, int damage)
            { Targets = targets; Remaining = remaining; Damage = damage; }
        }

        public ulong Version { get; }
        public long Epoch { get; }
        public string Reward { get; }
        public string RulesetId { get; }
        public int RulesetVersion { get; }
        public string ContentHash { get; }
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
        public bool Terminal => Phase == "won" || Phase == "lost";
        public Participant Own => Participants[You];

        private CoopNativeView(ulong version, long epoch, string reward, Fields fields)
        {
            Version = version; Epoch = epoch; Reward = reward;
            RulesetId = fields.RulesetId; RulesetVersion = fields.RulesetVersion;
            ContentHash = fields.ContentHash; ConfigDigest = fields.ConfigDigest;
            You = fields.You; Phase = fields.Phase; ActiveSeat = fields.ActiveSeat; Turn = fields.Turn; Round = fields.Round;
            BossState = fields.Boss; Board = Array.AsReadOnly(fields.Board);
            Participants = Array.AsReadOnly(fields.Participants); PendingAttack = fields.Pending;
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
            ProjectionJson.ObjectFields(play, "schemaVersion", "ruleset", "you", "phase", "activeSeat",
                "turn", "round", "boss", "board", "participants", "pending");
            if (ProjectionJson.Integer(play.Element("schemaVersion")) != 1) throw new FormatException("Invalid coop schema");

            var fields = new Fields { Epoch = epoch, Reward = reward };
            var ruleset = play.Element("ruleset");
            ProjectionJson.ObjectFields(ruleset, "id", "version", "contentHash", "configDigest");
            fields.RulesetId = Text(ruleset.Element("id"), 1, 64);
            fields.RulesetVersion = Bounded(ruleset.Element("version"), 1, 1_000_000);
            fields.ContentHash = Hex(ruleset.Element("contentHash"));
            fields.ConfigDigest = Hex(ruleset.Element("configDigest"));
            fields.You = Bounded(play.Element("you"), 0, Seats - 1);
            fields.Phase = Token(play.Element("phase"), "ready", "playing", "won", "lost");
            fields.ActiveSeat = Bounded(play.Element("activeSeat"), 0, Seats - 1);
            fields.Turn = Bounded(play.Element("turn"), 0, MaxTurn);
            fields.Round = Bounded(play.Element("round"), 1, MaxRound);
            fields.Boss = ReadBoss(play.Element("boss"));
            fields.Board = ReadBoard(play.Element("board"));
            fields.Participants = ReadParticipants(play.Element("participants"));
            fields.Pending = ReadPending(play.Element("pending"));
            return new CoopNativeView(version, epoch, reward, fields);
        }

        private static Boss ReadBoss(XElement boss)
        {
            ProjectionJson.ObjectFields(boss, "hp", "maxHp", "phase", "shield", "armorBreakPm",
                "dotDamage", "dotTurns", "transformed");
            var maxHealth = Bounded(boss.Element("maxHp"), 1, MaxHealth);
            var health = Bounded(boss.Element("hp"), 0, MaxHealth);
            if (health > maxHealth) throw new FormatException("Boss health exceeds its maximum");
            return new Boss(health, maxHealth, Bounded(boss.Element("phase"), 1, 2),
                Bounded(boss.Element("shield"), 0, MaxHealth), Bounded(boss.Element("armorBreakPm"), 0, 1_000),
                Bounded(boss.Element("dotDamage"), 0, MaxHealth), Bounded(boss.Element("dotTurns"), 0, 100),
                ProjectionJson.Boolean(boss.Element("transformed")));
        }

        private static Tile[] ReadBoard(XElement board)
        {
            var items = ProjectionJson.Array(board, Cells);
            if (items.Length != Cells) throw new FormatException("Invalid coop board size");
            var tiles = new Tile[Cells];
            for (var index = 0; index < items.Length; index += 1)
            {
                var item = items[index];
                if (ProjectionJson.Type(item) == "null")
                {
                    if (ProjectionJson.Scalar(item, "null").Length != 0) throw new FormatException("Invalid coop tile");
                    continue;
                }
                ProjectionJson.ObjectFields(item, "element", "multiplier");
                tiles[index] = new Tile(Token(item.Element("element"), Elements), Bounded(item.Element("multiplier"), 1, 5));
            }
            return tiles;
        }

        private static Participant[] ReadParticipants(XElement participants)
        {
            var items = ProjectionJson.Array(participants, Seats);
            if (items.Length != Seats) throw new FormatException("Invalid coop participant count");
            var seats = new Participant[Seats];
            for (var index = 0; index < items.Length; index += 1)
            {
                var seat = items[index];
                ProjectionJson.ObjectFields(seat, "seat", "petId", "level", "hp", "maxHp", "attack", "defense",
                    "critRateBp", "critDamageBp", "mana", "rage", "shield", "shieldTurns", "cooldowns",
                    "statuses", "contribution", "alive");
                if (Bounded(seat.Element("seat"), 0, Seats - 1) != index) throw new FormatException("Invalid coop seat");
                var maxHealth = Bounded(seat.Element("maxHp"), 1, MaxHealth);
                var health = Bounded(seat.Element("hp"), 0, MaxHealth);
                if (health > maxHealth) throw new FormatException("Seat health exceeds its maximum");
                var cooldowns = ProjectionJson.Array(seat.Element("cooldowns"), 5)
                    .Select(item => Bounded(item, 0, MaxCooldown)).ToArray();
                if (cooldowns.Length != 5) throw new FormatException("Invalid coop cooldowns");
                var statuses = ProjectionJson.Array(seat.Element("statuses"), 8).Select(ReadStatus).ToArray();
                var contribution = seat.Element("contribution");
                ProjectionJson.ObjectFields(contribution, "damage", "healing", "shielding");
                var value = new Contribution(Bounded(contribution.Element("damage"), 0, int.MaxValue),
                    Bounded(contribution.Element("healing"), 0, int.MaxValue),
                    Bounded(contribution.Element("shielding"), 0, int.MaxValue));
                seats[index] = new Participant(index, Text(seat.Element("petId"), 1, 64),
                    Bounded(seat.Element("level"), 1, 60), health, maxHealth,
                    Bounded(seat.Element("attack"), 0, MaxHealth), Bounded(seat.Element("defense"), 0, MaxHealth),
                    Bounded(seat.Element("critRateBp"), 0, 10_000), Bounded(seat.Element("critDamageBp"), 0, 100_000),
                    Bounded(seat.Element("mana"), 0, MaxMana), Bounded(seat.Element("rage"), 0, MaxRage),
                    Bounded(seat.Element("shield"), 0, MaxHealth), Bounded(seat.Element("shieldTurns"), 0, 100),
                    cooldowns, statuses, value, ProjectionJson.Boolean(seat.Element("alive")));
            }
            return seats;
        }

        private static Status ReadStatus(XElement status)
        {
            ProjectionJson.ObjectFields(status, "kind", "value", "turns");
            return new Status(Token(status.Element("kind"), Statuses),
                Bounded(status.Element("value"), -100_000, 100_000), Bounded(status.Element("turns"), 0, 100));
        }

        private static Pending ReadPending(XElement pending)
        {
            if (pending == null || ProjectionJson.Type(pending) == "null")
            {
                if (pending != null && ProjectionJson.Scalar(pending, "null").Length != 0)
                    throw new FormatException("Invalid coop pending attack");
                return null;
            }
            ProjectionJson.ObjectFields(pending, "targets", "remaining", "damage");
            return new Pending(Bounded(pending.Element("targets"), 1, Seats),
                Bounded(pending.Element("remaining"), 0, 10), Bounded(pending.Element("damage"), 0, MaxHealth));
        }

        public bool CanSwap(int first, int second)
        {
            if (first < 0 || first >= Cells || second < 0 || second >= Cells || first == second) return false;
            var row = first / Side;
            var col = first % Side;
            var otherRow = second / Side;
            var otherCol = second % Side;
            if (Math.Abs(row - otherRow) + Math.Abs(col - otherCol) != 1) return false;
            return Board[first] != null && Board[second] != null && Board[first].Element != Board[second].Element;
        }

        public int Cooldown(int slot) => slot < 0 || slot >= Own.Cooldowns.Count ? MaxCooldown : Own.Cooldowns[slot];

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
            public Tile[] Board;
            public Participant[] Participants;
            public Pending Pending;
        }
    }
}
