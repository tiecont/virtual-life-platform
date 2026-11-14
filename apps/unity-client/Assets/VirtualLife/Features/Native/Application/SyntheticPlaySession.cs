using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
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

        protected override PlayState Decode(ulong version, byte[] bytes)
        {
            Result result;
            try { using (var stream = new MemoryStream(bytes)) result = (Result)new DataContractJsonSerializer(typeof(Result)).ReadObject(stream); }
            catch (Exception e) when (e is SerializationException || e is System.Xml.XmlException) { throw new NativeFailure(Failure.Protocol); }
            if (result?.State == null || result.Epoch < 1 || result.State.Turns < 0 || result.State.Turns > 3 ||
                (ulong)result.State.Turns != version || result.State.Roll < 0 || result.State.Roll >= 100 ||
                (result.Reward != null && result.Reward != "REWARD_PENDING" && result.Reward != "GRANTED" && result.Reward != "DECLINED"))
                throw new NativeFailure(Failure.Protocol);
            return new PlayState(version, result.Epoch, result.State.Turns, result.State.Roll, result.Reward);
        }
        [DataContract] private sealed class Result {
            [DataMember(Name = "state", IsRequired = true)] public Counter State { get; set; }
            [DataMember(Name = "epoch", IsRequired = true)] public long Epoch { get; set; }
            [DataMember(Name = "reward")] public string Reward { get; set; }
        }
        [DataContract] private sealed class Counter {
            [DataMember(Name = "turns", IsRequired = true)] public int Turns { get; set; }
            [DataMember(Name = "ownRoll", IsRequired = true)] public int Roll { get; set; }
        }
    }
}
