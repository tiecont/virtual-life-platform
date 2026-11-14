using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace VirtualLife.Networking
{
    public sealed class PetArenaPlaySession : NativePlaySession
    {
        public PetArenaPlaySession(PlatformSession platform, NativeConnection connection, Guid match) : base(platform, connection, match) { }
        protected override string ViewKind => "pet.view.v1";
        protected override PlayState Decode(ulong version, byte[] bytes)
        {
            try {
                var view = PetArenaView.Decode(version, bytes);
                return new PlayState(version, view.Epoch, view.Turn, 0, view.Reward, view);
            } catch (FormatException) { throw new NativeFailure(Failure.Protocol); }
        }
        public override Task<PlayState> AdvanceAsync(CancellationToken cancellation = default) => Intent("start", -1, -1, cancellation);
        public Task<PlayState> SkillAsync(CancellationToken cancellation = default) => Intent("skill", -1, -1, cancellation);
        public Task<PlayState> PassAsync(CancellationToken cancellation = default) => Intent("pass", -1, -1, cancellation);
        public Task<PlayState> SwapAsync(int first, int second, CancellationToken cancellation = default) => Intent("swap", first, second, cancellation);
        private Task<PlayState> Intent(string kind, int first, int second, CancellationToken cancellation) =>
            SubmitPending((current, match) => {
                var view = current.Arena;
                if (view == null || view.Terminal || (kind == "start" ? view.Phase != "ready" : view.Phase != "playing") ||
                    kind == "skill" && view.Cooldown != 0 || kind == "swap" && !view.CanSwap(first, second))
                    throw new NativeFailure(Failure.Rejected);
                var fields = kind == "swap" ? ",\"first\":" + first + ",\"second\":" + second : "";
                var payload = "{\"epoch\":" + current.Epoch.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                    ",\"action\":{\"kind\":\"" + kind + "\"" + fields + "}}";
                return new GameCommand(Guid.NewGuid(), match, current.Version, "pet.intent.v1", Encoding.UTF8.GetBytes(payload));
            }, cancellation);
    }
}
