using System;
using System.Threading;
using System.Threading.Tasks;

namespace Aetheria.Networking
{
    // The native `arena8-pve` client. Every board cell, resource, telegraph and
    // terminal value comes from the committed `arena8.view.v1` projection; this
    // session only serializes bounded intents and retains one pending command for
    // an explicit retry. It never computes damage, rewards or outcomes.
    public sealed class Arena8NativePlaySession : NativePlaySession
    {
        public Arena8NativePlaySession(PlatformSession platform, NativeConnection connection, Guid match)
            : base(platform, connection, match) { }

        public const string ViewKindName = "arena8.view.v1";

        protected override string ViewKind => ViewKindName;
        protected override PlayState Decode(ulong version, byte[] bytes)
        {
            try
            {
                var view = Arena8NativeView.Decode(version, bytes);
                return new PlayState(version, view.Epoch, view.Turn, 0, view.Reward, null, view);
            }
            catch (FormatException) { throw new NativeFailure(Failure.Protocol); }
        }

        // Admission for an allocated match is complete once the allocation ticket
        // is validated; the platform login is not repeated.
        public Task<PlayState> ConnectAsync(CancellationToken cancellation = default) => ConnectTransportAsync(cancellation);

        public override Task<PlayState> AdvanceAsync(CancellationToken cancellation = default) => StartAsync(cancellation);
        public Task<PlayState> StartAsync(CancellationToken cancellation = default) => Intent(Arena8NativeIntent.Start, -1, -1, cancellation);
        public Task<PlayState> SwapAsync(int first, int second, CancellationToken cancellation = default) =>
            Intent(Arena8NativeIntent.Swap, first, second, cancellation);
        public Task<PlayState> SkillAsync(CancellationToken cancellation = default) => Intent(Arena8NativeIntent.Skill, -1, -1, cancellation);
        public Task<PlayState> SignatureAsync(CancellationToken cancellation = default) => Intent(Arena8NativeIntent.Signature, -1, -1, cancellation);
        public Task<PlayState> FireZoneAsync(CancellationToken cancellation = default) => Intent(Arena8NativeIntent.FireZone, -1, -1, cancellation);
        public Task<PlayState> UltimateAsync(CancellationToken cancellation = default) => Intent(Arena8NativeIntent.Ultimate, -1, -1, cancellation);
        public Task<PlayState> GuardAsync(CancellationToken cancellation = default) => Intent(Arena8NativeIntent.Guard, -1, -1, cancellation);

        private Task<PlayState> Intent(string kind, int first, int second, CancellationToken cancellation) =>
            SubmitPending((current, match) =>
            {
                var view = current.Arena8;
                if (view == null || view.Terminal) throw new NativeFailure(Failure.Rejected);
                if (kind == Arena8NativeIntent.Start ? view.Phase != "ready" : view.Phase != "playing")
                    throw new NativeFailure(Failure.Rejected);
                if (kind == Arena8NativeIntent.Swap && !view.CanSwap(first, second))
                    throw new NativeFailure(Failure.Rejected);
                if (kind != Arena8NativeIntent.Start && kind != Arena8NativeIntent.Swap && kind != Arena8NativeIntent.Guard &&
                    !view.HasSkill(SkillId(kind)))
                    throw new NativeFailure(Failure.Rejected);
                if (kind != Arena8NativeIntent.Start && kind != Arena8NativeIntent.Guard && view.Cooldown != 0)
                    throw new NativeFailure(Failure.Rejected);
                return new GameCommand(Guid.NewGuid(), match, current.Version, Arena8NativeIntent.Kind,
                    Arena8NativeIntent.Create(current.Epoch, kind, first, second));
            }, cancellation);

        // Projection skill ids are kebab-case; intent kinds are camelCase.
        private static string SkillId(string kind)
        {
            switch (kind)
            {
                case Arena8NativeIntent.Skill: return Arena8NativeView.SharedSkill;
                case Arena8NativeIntent.FireZone: return Arena8NativeView.FireZone;
                default: return kind;
            }
        }
    }
}
