using System.Collections.Generic;
using Aetheria.PetArena.Presentation;
using NUnit.Framework;
using UnityEngine;

namespace Aetheria.Tests
{
    public sealed class FunctionalGemArtTests
    {
        [Test]
        public void FunctionalKindsUseSeparateSpriteRegionsOnOneAtlas()
        {
            var kinds = new[] { "sword", "mana", "rage", "heart", "shield", "special" };
            var regions = new HashSet<Rect>();
            Texture2D atlas = null;
            foreach (var kind in kinds)
            {
                var sprite = FunctionalGemArt.Get(kind);
                Assert.That(sprite, Is.Not.Null, kind);
                Assert.That(sprite.name, Is.EqualTo(kind));
                Assert.That(sprite.rect.size, Is.EqualTo(new Vector2(128f, 128f)));
                Assert.That(regions.Add(sprite.rect), Is.True, kind);
                atlas ??= sprite.texture;
                Assert.That(sprite.texture, Is.SameAs(atlas), kind);
            }

            Assert.That(atlas.width, Is.EqualTo(512));
            Assert.That(atlas.height, Is.EqualTo(256));
            Assert.That(atlas.mipmapCount, Is.EqualTo(1));
            Assert.That(FunctionalGemArt.Get("fire"), Is.Null);
            Assert.That(FunctionalGemArt.Get("unrecognized"), Is.Null);
        }
    }
}
