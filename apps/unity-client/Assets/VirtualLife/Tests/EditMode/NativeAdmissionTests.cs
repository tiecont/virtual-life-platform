using System;
using System.Linq;
using System.Threading.Tasks;
using NUnit.Framework;
using VirtualLife.Networking;

namespace VirtualLife.Tests
{
    public sealed class NativeAdmissionTests
    {
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
