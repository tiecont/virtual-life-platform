using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace VirtualLife.Networking
{
    // Validates a bounded, owner-authorized projection. This client never
    // computes combat effects, fills boards, chooses entropy or awards rewards.
    public sealed class PetArenaView
    {
        public ulong Version { get; }
        public long Epoch { get; }
        public string Phase { get; }
        public int Pet { get; }
        public int Stage { get; }
        public int Turn { get; }
        public int Health { get; }
        public int EnemyHealth { get; }
        public int Shield { get; }
        public int EnemyShield { get; }
        public int Cooldown { get; }
        public string Reward { get; }
        public IReadOnlyList<int> Board { get; }
        public IReadOnlyList<int> WarningCells { get; }
        public int WarningPattern { get; }
        public int ResolvesTurn { get; }
        public IReadOnlyList<string> PlayerStatuses { get; }
        public IReadOnlyList<string> EnemyStatuses { get; }
        public bool Terminal => Phase == "won" || Phase == "lost";
        private PetArenaView(ulong version, Projection projection)
        {
            var s = projection.State;
            Version = version; Epoch = projection.Epoch; Phase = s.Phase;
            Pet = s.Pet; Stage = s.Stage; Turn = s.Turn; Health = s.Health; EnemyHealth = s.EnemyHealth;
            Shield = s.Shield; EnemyShield = s.EnemyShield; Cooldown = s.Cooldown; Reward = projection.Reward;
            Board = Array.AsReadOnly((int[])s.Board.Clone());
            WarningCells = Array.AsReadOnly(s.Telegraph?.Cells ?? Array.Empty<int>());
            WarningPattern = s.Telegraph?.Pattern ?? -1; ResolvesTurn = s.Telegraph?.ResolvesTurn ?? 0;
            PlayerStatuses = StatusLabels(s.PlayerStatuses); EnemyStatuses = StatusLabels(s.EnemyStatuses);
        }
        private static IReadOnlyList<string> StatusLabels(Status[] values) => Array.AsReadOnly(values.Select(s =>
            new[] {"Poison", "Slow", "Empower"}[s.Kind] + " " + s.Potency / 1000f + " (" + s.Remaining + " turns)").ToArray());

        public static PetArenaView Decode(ulong version, byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0 || bytes.Length > 16384) throw new FormatException("Invalid Pet projection");
            var root = ProjectionJson.Parse(bytes);
            ProjectionJson.ObjectFields(root, "state", "epoch", "reward");
            ProjectionJson.Integer(root.Element("epoch"));
            if (root.Element("reward") == null) throw new FormatException("Missing Pet reward");
            ProjectionJson.OptionalString(root.Element("reward"));
            var state = root.Element("state");
            ProjectionJson.ObjectFields(state, "phase", "pet", "stage", "turn", "board", "health", "enemyHealth",
                "shield", "enemyShield", "cooldown", "telegraph", "playerStatuses", "enemyStatuses");
            ProjectionJson.Scalar(state.Element("phase"), "string");
            foreach (var name in new[] {"pet", "stage", "turn", "health", "enemyHealth", "shield", "enemyShield", "cooldown"})
                ProjectionJson.Integer(state.Element(name));
            foreach (var tile in ProjectionJson.Array(state.Element("board"), 36)) ProjectionJson.Integer(tile);
            foreach (var name in new[] {"playerStatuses", "enemyStatuses"})
                foreach (var status in ProjectionJson.Array(state.Element(name), 3)) {
                    ProjectionJson.ObjectFields(status, "kind", "potency", "remaining");
                    foreach (var key in new[] {"kind", "potency", "remaining"}) ProjectionJson.Integer(status.Element(key));
                }
            var warning = state.Element("telegraph");
            if (ProjectionJson.Type(warning) == "null") ProjectionJson.Scalar(warning, "null");
            else {
                ProjectionJson.ObjectFields(warning, "pattern", "cells", "resolvesTurn");
                ProjectionJson.Integer(warning.Element("pattern")); ProjectionJson.Integer(warning.Element("resolvesTurn"));
                foreach (var cell in ProjectionJson.Array(warning.Element("cells"), 11)) ProjectionJson.Integer(cell);
            }
            Projection projection;
            try { using var stream = new MemoryStream(bytes); projection = (Projection)new DataContractJsonSerializer(typeof(Projection)).ReadObject(stream); }
            catch (Exception e) when (e is SerializationException || e is System.Xml.XmlException) { throw new FormatException("Invalid Pet projection"); }
            var s = projection?.State;
            if (s == null || projection.Epoch < 1 || version > 61 || s.Pet < 0 || s.Pet >= 8 || s.Stage < 0 || s.Stage >= 6 ||
                s.Turn < 0 || s.Turn > 60 || s.Cooldown < 0 || s.Cooldown > 3 || s.Health < 0 || s.Health > 140000 ||
                s.EnemyHealth < 0 || s.EnemyHealth > 400000 || s.Shield < 0 || s.Shield > 100000 || s.EnemyShield < 0 || s.EnemyShield > 18000 ||
                s.Board == null || s.Board.Length != 36 || s.Board.Any(tile => tile < 0 || tile >= 4) ||
                !ValidStatuses(s.PlayerStatuses) || !ValidStatuses(s.EnemyStatuses) ||
                (projection.Reward != null && projection.Reward != "REWARD_PENDING" && projection.Reward != "GRANTED" && projection.Reward != "DECLINED"))
                throw new FormatException("Invalid Pet projection");
            var terminal = s.Phase == "won" || s.Phase == "lost";
            if ((s.Phase == "ready" ? version != 0 || s.Turn != 0 : version != (ulong)s.Turn + 1) ||
                (terminal != (projection.Reward != null)) ||
                (s.Phase == "ready" && (s.Health == 0 || s.EnemyHealth == 0 || s.Telegraph != null)) ||
                (s.Phase == "playing" && (s.Health == 0 || s.EnemyHealth == 0 || s.Turn >= 60 || !ValidWarning(s.Telegraph, s.Turn))) ||
                (s.Phase == "won" && (s.Health == 0 || s.EnemyHealth != 0 || s.Telegraph != null || s.Turn == 0)) ||
                (s.Phase == "lost" && (s.Health != 0 && !(s.Turn == 60 && s.EnemyHealth > 0) || s.Telegraph != null || s.Turn == 0)) ||
                (s.Phase != "ready" && s.Phase != "playing" && !terminal))
                throw new FormatException("Invalid Pet phase");
            return new PetArenaView(version, projection);
        }
        private static bool ValidStatuses(Status[] values) => values != null && values.Length <= 3 &&
            values.All(s => s != null && s.Kind >= 0 && s.Kind <= 2 && s.Potency > 0 && s.Potency <= 100000 && s.Remaining >= 1 && s.Remaining <= 3) &&
            values.Select(s => s.Kind).Distinct().Count() == values.Length;
        private static bool ValidWarning(Warning w, int turn) => w != null && w.Pattern >= 0 && w.Pattern <= 2 &&
            w.ResolvesTurn == turn + 1 && w.Cells != null && w.Cells.Length == (w.Pattern == 2 ? 11 : 6) &&
            w.Cells.All(cell => cell >= 0 && cell < 36) && w.Cells.Distinct().Count() == w.Cells.Length;

        // A hint is a local affordance over public tiles; the Rust reducer still
        // validates every swap. The returned pair never includes a result/damage.
        public bool CanSwap(int first, int second)
        {
            if (Phase != "playing" || first < 0 || first >= 36 || second < 0 || second >= 36 ||
                !(Math.Abs(first - second) == 6 || first / 6 == second / 6 && Math.Abs(first - second) == 1)) return false;
            var copy = Board.ToArray(); var tile = copy[first]; copy[first] = copy[second]; copy[second] = tile;
            for (var at = 0; at < 36; at++)
                if (at % 6 <= 3 && copy[at] == copy[at + 1] && copy[at] == copy[at + 2] ||
                    at < 24 && copy[at] == copy[at + 6] && copy[at] == copy[at + 12]) return true;
            return false;
        }
        public bool Hint(out int first, out int second)
        {
            for (var at = 0; at < 36; at++) foreach (var next in new[] {at + 1, at + 6})
                if (CanSwap(at, next)) { first = at; second = next; return true; }
            first = second = -1; return false;
        }
        [DataContract] private sealed class Projection {
            [DataMember(Name = "state", IsRequired = true)] public State State { get; set; }
            [DataMember(Name = "epoch", IsRequired = true)] public long Epoch { get; set; }
            [DataMember(Name = "reward", IsRequired = true)] public string Reward { get; set; }
        }
        [DataContract] private sealed class State {
            [DataMember(Name = "phase", IsRequired = true)] public string Phase { get; set; }
            [DataMember(Name = "pet", IsRequired = true)] public int Pet { get; set; }
            [DataMember(Name = "stage", IsRequired = true)] public int Stage { get; set; }
            [DataMember(Name = "turn", IsRequired = true)] public int Turn { get; set; }
            [DataMember(Name = "board", IsRequired = true)] public int[] Board { get; set; }
            [DataMember(Name = "health", IsRequired = true)] public int Health { get; set; }
            [DataMember(Name = "enemyHealth", IsRequired = true)] public int EnemyHealth { get; set; }
            [DataMember(Name = "shield", IsRequired = true)] public int Shield { get; set; }
            [DataMember(Name = "enemyShield", IsRequired = true)] public int EnemyShield { get; set; }
            [DataMember(Name = "cooldown", IsRequired = true)] public int Cooldown { get; set; }
            [DataMember(Name = "telegraph", IsRequired = true)] public Warning Telegraph { get; set; }
            [DataMember(Name = "playerStatuses", IsRequired = true)] public Status[] PlayerStatuses { get; set; }
            [DataMember(Name = "enemyStatuses", IsRequired = true)] public Status[] EnemyStatuses { get; set; }
        }
        [DataContract] private sealed class Warning {
            [DataMember(Name = "pattern", IsRequired = true)] public int Pattern { get; set; }
            [DataMember(Name = "cells", IsRequired = true)] public int[] Cells { get; set; }
            [DataMember(Name = "resolvesTurn", IsRequired = true)] public int ResolvesTurn { get; set; }
        }
        [DataContract] private sealed class Status {
            [DataMember(Name = "kind", IsRequired = true)] public int Kind { get; set; }
            [DataMember(Name = "potency", IsRequired = true)] public int Potency { get; set; }
            [DataMember(Name = "remaining", IsRequired = true)] public int Remaining { get; set; }
        }
    }
}
