using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace VirtualLife.Networking
{
    public sealed class SyntheticPlaySession : NativePlaySession
    {
        public SyntheticPlaySession(PlatformSession platform, NativeConnection connection, Guid match) : base(platform, connection, match) { }
        protected override string ViewKind => "fixture.view.v1";
        public override Task<PlayState> AdvanceAsync(CancellationToken cancellation = default) =>
            SubmitPending((current, match) => {
                if (current.Turns >= 3) throw new NativeFailure(Failure.Rejected);
                return new GameCommand(Guid.NewGuid(), match, current.Version, "fixture.advance.v1",
                    Encoding.UTF8.GetBytes("{\"epoch\":" + current.Epoch.ToString(System.Globalization.CultureInfo.InvariantCulture) + "}"));
            }, cancellation);

        protected override PlayState Decode(ulong version, byte[] bytes) => DecodeProjection(version, bytes);
        private static PlayState DecodeProjection(ulong version, byte[] bytes)
        {
            try {
                var result = ProjectionJson.Parse(bytes);
                ProjectionJson.ObjectFields(result, "state", "epoch", "reward");
                var counter = result.Element("state");
                ProjectionJson.ObjectFields(counter, "turns", "ownRoll");
                var epoch = ProjectionJson.Integer(result.Element("epoch"));
                var turns = ProjectionJson.Integer(counter.Element("turns"));
                var roll = ProjectionJson.Integer(counter.Element("ownRoll"));
                var reward = ProjectionJson.OptionalString(result.Element("reward"));
                if (epoch < 1 || turns < 0 || turns > 3 || (ulong)turns != version || roll < 0 || roll >= 100 ||
                    (reward != null && reward != "REWARD_PENDING" && reward != "GRANTED" && reward != "DECLINED"))
                    throw new FormatException("Invalid synthetic projection");
                return new PlayState(version, epoch, (int)turns, (int)roll, reward);
            } catch (FormatException) { throw new NativeFailure(Failure.Protocol); }
        }
    }
}
