using System;
using System.Globalization;
using System.Text;

namespace Aetheria.Networking
{
    // Exact `arena8-coop.intent.v1` payloads. The Rust adapter denies unknown
    // fields, so this writer is closed: an epoch and one bounded action only.
    public static class CoopNativeIntent
    {
        public const string Kind = "arena8-coop.intent.v1";
        public const string Start = "start";
        public const string Swap = "swap";
        public const string Guard = "guard";
        public const string Skill = "skill";
        public const string Signature = "signature";
        public const string Ultimate = "ultimate";
        public const string FireZone = "fireZone";

        public static byte[] StartAction(long epoch) => Create(epoch, Start);
        public static byte[] SwapAction(long epoch, int first, int second) => Create(epoch, Swap, first, second);
        public static byte[] GuardAction(long epoch) => Create(epoch, Guard);
        public static byte[] SkillAction(long epoch) => Create(epoch, Skill);
        public static byte[] SignatureAction(long epoch) => Create(epoch, Signature);
        public static byte[] UltimateAction(long epoch) => Create(epoch, Ultimate);
        public static byte[] FireZoneAction(long epoch) => Create(epoch, FireZone);

        public static byte[] Create(long epoch, string kind, int first = -1, int second = -1)
        {
            if (epoch < 1 || epoch > 1_000_000_000) throw new ArgumentException("Invalid coop epoch");
            return Encoding.UTF8.GetBytes("{\"epoch\":" + epoch.ToString(CultureInfo.InvariantCulture) +
                ",\"action\":" + Action(kind, first, second) + "}");
        }

        private static string Action(string kind, int first, int second)
        {
            switch (kind)
            {
                case Start: return "{\"kind\":\"start\"}";
                case Guard: return "{\"kind\":\"guard\"}";
                case Skill: return "{\"kind\":\"skill\"}";
                case Signature: return "{\"kind\":\"signature\"}";
                case Ultimate: return "{\"kind\":\"ultimate\"}";
                case FireZone: return "{\"kind\":\"fireZone\"}";
                case Swap:
                    if (first < 0 || first >= CoopNativeView.Cells || second < 0 || second >= CoopNativeView.Cells ||
                        first == second) throw new ArgumentException("Invalid coop swap cells");
                    return "{\"kind\":\"swap\",\"first\":" + first.ToString(CultureInfo.InvariantCulture) +
                        ",\"second\":" + second.ToString(CultureInfo.InvariantCulture) + "}";
                default: throw new ArgumentException("Unsupported coop action");
            }
        }
    }
}
