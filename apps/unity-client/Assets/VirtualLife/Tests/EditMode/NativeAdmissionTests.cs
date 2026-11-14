using System;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using NUnit.Framework;
using VirtualLife.Networking;

namespace VirtualLife.Tests
{
    public sealed class NativeAdmissionTests
    {
        [TestCase("{\"state\":{\"turns\":1,\"ownRoll\":42},\"epoch\":1,\"private\":\"secret-other-player\"}")]
        [TestCase("{\"state\":{\"turns\":1,\"ownRoll\":42,\"player\":\"secret-other-player\"},\"epoch\":1}")]
        [TestCase("{\"state\":{\"turns\":1,\"turns\":1,\"ownRoll\":42},\"epoch\":1}")]
        [TestCase("{\"state\":{\"turns\":1,\"ownRoll\":42},\"epoch\":1,\"epoch\":1}")]
        [TestCase("{\"state\":{\"turns\":\"1\",\"ownRoll\":42},\"epoch\":1}")]
        [TestCase("{\"state\":{\"turns\":1,\"ownRoll\":42},\"epoch\":1}{}")]
        [TestCase("{\"state\":{\"turns\":1,\"ownRoll\":42},\"epoch\":1,\"reward\":\"secret-other-player\"}")]
        [TestCase("{\"state\":{\"turns\":2,\"ownRoll\":42},\"epoch\":1}")]
        [TestCase("{\"state\":{\"turns\":1,\"ownRoll\":100},\"epoch\":1}")]
        [TestCase("{\"state\":{\"turns\":1,\"ownRoll\":42},\"epoch\":0}")]
        [TestCase("{}")]
        public void InvalidOrPrivateProjectionFailsClosed(string projection)
        {
            var decode = typeof(SyntheticPlaySession).GetMethod("DecodeProjection", BindingFlags.Static | BindingFlags.NonPublic);
            var error = Assert.Throws<TargetInvocationException>(() => decode.Invoke(null, new object[] { 1UL, Encoding.UTF8.GetBytes(projection) }));
            Assert.That(error.InnerException, Is.TypeOf<NativeFailure>());
            var failure = (NativeFailure)error.InnerException;
            Assert.That(failure.Reason, Is.EqualTo(Failure.Protocol));
            Assert.That(failure.ToString(), Does.Not.Contain("secret-other-player"));
        }

        [Test]
        public void CanonicalViewerProjectionWorksWithMono()
        {
            var decode = typeof(SyntheticPlaySession).GetMethod("DecodeProjection", BindingFlags.Static | BindingFlags.NonPublic);
            var state = (PlayState)decode.Invoke(null, new object[] { 1UL, Encoding.UTF8.GetBytes("{\"reward\":null,\"epoch\":1,\"state\":{\"ownRoll\":42,\"turns\":1}}") });
            Assert.That(state.Version, Is.EqualTo(1)); Assert.That(state.Turns, Is.EqualTo(1));
            Assert.That(state.Epoch, Is.EqualTo(1)); Assert.That(state.OwnRoll, Is.EqualTo(42)); Assert.That(state.Reward, Is.Null);
        }

        [Test]
        public void CleartextAndCrossOriginScopesAreDenied()
        {
            var hash = Enumerable.Repeat((byte)0x53, 32).ToArray();
            Assert.Throws<ArgumentException>(() => new NativeConnection(new Uri("ws://localhost/rt/v1"),
                new Uri("https://localhost"), hash, Guid.NewGuid(), _ => Task.FromResult<AdmissionTicket>(null)));
            Assert.Throws<ArgumentException>(() => new NativeConnection(new Uri("wss://localhost/rt/v1"),
                new Uri("https://another.invalid"), hash, Guid.NewGuid(), _ => Task.FromResult<AdmissionTicket>(null)));
        }

        [Test]
        public async Task ExpiredAdmissionFailsBeforeNetworkIo()
        {
            using (var connection = new NativeConnection(new Uri("wss://localhost/rt/v1"), new Uri("https://localhost"),
                Enumerable.Repeat((byte)0x53, 32).ToArray(), Guid.NewGuid(), _ => Task.FromResult(
                    new AdmissionTicket("secret", Guid.NewGuid().ToString(), DateTimeOffset.UtcNow.AddSeconds(-1)))))
            {
                try { await connection.ConnectAsync(); Assert.Fail("Expired admission accepted"); }
                catch (NativeFailure failure) {
                    Assert.That(failure.Reason, Is.EqualTo(Failure.Authentication));
                    Assert.That(failure.Message, Does.Not.Contain("secret"));
                    Assert.That(connection.State, Is.EqualTo(ConnectionState.Faulted));
                }
            }
        }
    }
}
