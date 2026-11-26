using System;
using System.Globalization;
using System.Text;

namespace Aetheria.Networking
{
    // Exact `arena8.intent.v1` payloads. The Rust adapter denies unknown fields,
    // so this writer is closed: an epoch and one bounded action only. There is no
    // seed, damage, target, outcome, reward, Artifact or stat field.
    public static class Arena8NativeIntent
    {
        public const string Kind = "arena8.intent.v1";
        public const string Start = "start";
        public const string Swap = "swap";
        public const string Skill = "skill";
        public const string Signature = "signature";
        public const string FireZone = "fireZone";
        public const string Ultimate = "ultimate";
        public const string Guard = "guard";

        public static byte[] StartAction(long epoch) => Create(epoch, Start, -1, -1);
        public static byte[] SwapAction(long epoch, int first, int second) => Create(epoch, Swap, first, second);
        public static byte[] SkillAction(long epoch) => Create(epoch, Skill, -1, -1);
        public static byte[] SignatureAction(long epoch) => Create(epoch, Signature, -1, -1);
        public static byte[] FireZoneAction(long epoch) => Create(epoch, FireZone, -1, -1);
        public static byte[] UltimateAction(long epoch) => Create(epoch, Ultimate, -1, -1);
        public static byte[] GuardAction(long epoch) => Create(epoch, Guard, -1, -1);

        public static byte[] Create(long epoch, string kind, int first = -1, int second = -1)
        {
            if (epoch < 1 || epoch > 1_000_000_000) throw new ArgumentException("Invalid Arena8 epoch");
            var action = Action(kind, first, second);
            return Encoding.UTF8.GetBytes("{\"epoch\":" + epoch.ToString(CultureInfo.InvariantCulture) + ",\"action\":" + action + "}");
        }

        private static string Action(string kind, int first, int second)
        {
            switch (kind)
            {
                case Start: return "{\"kind\":\"start\"}";
                case Skill: return "{\"kind\":\"skill\"}";
                case Signature: return "{\"kind\":\"signature\"}";
                case FireZone: return "{\"kind\":\"fireZone\"}";
                case Ultimate: return "{\"kind\":\"ultimate\"}";
                case Guard: return "{\"kind\":\"guard\"}";
                case Swap:
                    if (first < 0 || first >= Arena8NativeView.Cells || second < 0 || second >= Arena8NativeView.Cells ||
                        first == second) throw new ArgumentException("Invalid Arena8 swap cells");
                    return "{\"kind\":\"swap\",\"first\":" + first.ToString(CultureInfo.InvariantCulture) +
                        ",\"second\":" + second.ToString(CultureInfo.InvariantCulture) + "}";
                default: throw new ArgumentException("Unsupported Arena8 action");
            }
        }
    }
}
