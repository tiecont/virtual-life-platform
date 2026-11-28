using System;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Aetheria.Networking
{
    // The native `arena8-coop-pve` client. Every board tile, participant, boss
    // value and terminal phase comes from the committed `arena8-coop.view.v1`
    // projection; this session only serializes bounded intents for the seat that
    // the projection marks as active. It never computes damage, rewards or turns.
    public sealed class CoopNativePlaySession : NativePlaySession
    {
        private readonly string expectedRuleset;

        public CoopNativePlaySession(PlatformSession platform, NativeConnection connection, Guid match,
            string expectedRuleset = CoopNativeView.Ruleset) : base(platform, connection, match)
        {
            if (expectedRuleset != CoopNativeView.Ruleset && expectedRuleset != CoopNativeView.FunctionalSoloRuleset)
                throw new ArgumentException("Unsupported match ruleset", nameof(expectedRuleset));
            this.expectedRuleset = expectedRuleset;
        }

        public const string ViewKindName = "arena8-coop.view.v1";

        protected override string ViewKind => ViewKindName;
        protected override PlayState Decode(ulong version, byte[] bytes)
        {
            try
            {
                var view = CoopNativeView.Decode(version, bytes);
                var prior = State?.Coop;
                if (view.RulesetId != expectedRuleset || prior != null &&
                    (view.RulesetVersion != prior.RulesetVersion || view.You != prior.You ||
                     view.ContentHash != prior.ContentHash || view.ConfigDigest != prior.ConfigDigest))
                    throw new FormatException("Match projection scope changed");
                return new PlayState(version, view.Epoch, view.Turn, 0, view.Reward, null, null, view);
            }
            catch (FormatException error)
            {
                System.Console.Error.WriteLine("Coop native projection rejected: " + error.Message);
                throw new NativeFailure(Failure.Protocol);
            }
        }

        public double? RemainingTurnMilliseconds => RemainingMilliseconds(State);

        private static double? RemainingMilliseconds(PlayState state)
        {
            var remaining = state?.Coop?.TurnRemainingMs;
            if (!remaining.HasValue) return null;
            var elapsed = (Stopwatch.GetTimestamp() - state.ObservedAtTicks) * 1000.0 / Stopwatch.Frequency;
            return Math.Max(0.0, remaining.Value - elapsed);
        }

        public Task<PlayState> ConnectAsync(CancellationToken cancellation = default) => ConnectTransportAsync(cancellation);

        public Task<PlayState> RefreshAsync(CancellationToken cancellation = default) => RefreshTransportAsync(cancellation);

        public override Task<PlayState> AdvanceAsync(CancellationToken cancellation = default) => StartAsync(cancellation);
        public Task<PlayState> StartAsync(CancellationToken cancellation = default) => Intent(CoopNativeIntent.Start, -1, -1, 0, cancellation);
        public Task<PlayState> SwapAsync(int first, int second, CancellationToken cancellation = default) =>
            Intent(CoopNativeIntent.Swap, first, second, -1, cancellation);
        public Task<PlayState> GuardAsync(CancellationToken cancellation = default) => Intent(CoopNativeIntent.Guard, -1, -1, 0, cancellation);
        public Task<PlayState> SkillAsync(CancellationToken cancellation = default) => Intent(CoopNativeIntent.Skill, -1, -1, 1, cancellation);
        public Task<PlayState> SignatureAsync(CancellationToken cancellation = default) => Intent(CoopNativeIntent.Signature, -1, -1, 2, cancellation);
        public Task<PlayState> UltimateAsync(CancellationToken cancellation = default) => Intent(CoopNativeIntent.Ultimate, -1, -1, 3, cancellation);
        public Task<PlayState> FireZoneAsync(CancellationToken cancellation = default) => Intent(CoopNativeIntent.FireZone, -1, -1, 4, cancellation);

        public Task<PlayState> EndTurnAsync(CancellationToken cancellation = default) =>
            Intent(CoopNativeIntent.EndTurn, -1, -1, -1, cancellation);

        private Task<PlayState> Intent(string kind, int first, int second, int slot, CancellationToken cancellation) =>
            SubmitPending((current, match) =>
            {
                var view = current.Coop;
                if (view == null || view.Terminal) throw new NativeFailure(Failure.Rejected);
                if (kind == CoopNativeIntent.Start)
                {
                    if (view.Phase != "ready" || view.ActiveSeat != view.You) throw new NativeFailure(Failure.Rejected);
                }
                else
                {
                    if (view.Phase != "playing" || view.ActiveSeat != view.You || !view.Own.Alive ||
                        RemainingMilliseconds(current) == 0)
                        throw new NativeFailure(Failure.Rejected);
                    if (kind == CoopNativeIntent.Swap && !view.CanSwap(first, second)) throw new NativeFailure(Failure.Rejected);
                    if (kind == CoopNativeIntent.EndTurn && !view.CanEndTurn) throw new NativeFailure(Failure.Rejected);
                    if (slot >= 0)
                    {
                        var ready = view.Abilities.Count == 0
                            ? view.Cooldown(slot) == 0
                            : view.Abilities.Any(ability => view.SlotForAbility(ability.Kind) == slot && ability.Ready);
                        if (!ready) throw new NativeFailure(Failure.Rejected);
                    }
                }
                return new GameCommand(Guid.NewGuid(), match, current.Version, CoopNativeIntent.Kind,
                    CoopNativeIntent.Create(view.Epoch, kind, first, second));
            }, cancellation, renewAdmissionBeforeSubmit: true);
    }
}
