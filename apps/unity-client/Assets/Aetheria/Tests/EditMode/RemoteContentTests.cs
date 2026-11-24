using System;
using Aetheria.RemoteContent;
using NUnit.Framework;
using UnityEngine;

namespace Aetheria.Tests.EditMode
{
    public sealed class RemoteContentTests
    {
        private const string Valid =
            "{\"schemaVersion\":1,\"release\":\"DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC\"," +
            "\"contentVersion\":\"2026-11-24-r1\",\"pets\":[{\"id\":\"pet-v3-fire-icarus\"," +
            "\"address\":\"pets/pet-v3-fire-icarus\",\"contentHash\":\"0123456789abcdef0123456789abcdef\"}]," +
            "\"maps\":[{\"id\":\"arena-celestial-palace\",\"address\":\"maps/arena-celestial-palace\"," +
            "\"contentHash\":\"abcdef0123456789abcdef0123456789\"}]}";

        [Test]
        public void ValidManifestIsBoundedAndIndexed()
        {
            Assert.That(RemoteContentManifest.TryCreateBaseUri(
                "https://assets.example.invalid/aetheria/", out var uri), Is.True);
            Assert.That(RemoteContentManifest.TryParse(Valid, uri, out var manifest, out var error), Is.True, error);
            Assert.That(manifest.Index().Count, Is.EqualTo(2));
            Assert.That(manifest.contentVersion, Is.EqualTo("2026-11-24-r1"));
        }

        [Test]
        public void InvalidUrlsAndDuplicatesFailClosed()
        {
            Assert.That(RemoteContentManifest.TryCreateBaseUri("http://assets.example.invalid", out _), Is.False);
            Assert.That(RemoteContentManifest.TryCreateBaseUri("https://user:pass@assets.example.invalid", out _), Is.False);
            Assert.That(RemoteContentManifest.TryCreateBaseUri("https://assets.example.invalid?token=x", out _), Is.False);
            var duplicate = Valid.Replace("arena-celestial-palace", "pet-v3-fire-icarus");
            Assert.That(RemoteContentManifest.TryParse(duplicate, new Uri("https://assets.example.invalid/"),
                out _, out _), Is.False);
            var traversal = Valid.Replace("pets/pet-v3-fire-icarus", "pets/../pet-v3-fire-icarus");
            Assert.That(RemoteContentManifest.TryParse(traversal, new Uri("https://assets.example.invalid/"),
                out _, out _), Is.False);
        }

        [Test]
        public void DisabledSettingsKeepLocalContentPlayable()
        {
            var settings = ScriptableObject.CreateInstance<R2RemoteContentSettings>();
            settings.Configure(false, string.Empty);
            using var loader = new R2RemoteAssetLoader(settings);
            Assert.That(loader.InitializeAsync(default).GetAwaiter().GetResult(), Is.False);
            Assert.That(loader.IsEnabled, Is.False);
            UnityEngine.Object.DestroyImmediate(settings);
        }
    }
}
