using System;
using System.Collections.Generic;
using System.IO;
using Aetheria.PetArena.Presentation;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Aetheria.Tests
{
    public sealed class FunctionalGemArtTests
    {
        private static readonly string[] Basic = { "sword", "mana", "rage", "heart", "shield", "special" };
        private static readonly string[] Advanced = { "nature", "frost", "astral" };

        [Test]
        public void FullCellAtlasKeepsHistoricalSpriteIdentifiersAndAddsAdvancedRegions()
        {
            var names = new List<string>(Basic);
            names.AddRange(Advanced);
            var atlas = CheckAtlas(FunctionalGemArt.Get, names, new Vector2Int(396, 396));
            for (var index = 0; index < names.Count; index++)
            {
                var sprite = FunctionalGemArt.Get(names[index]);
                Assert.That(AssetDatabase.TryGetGUIDAndLocalFileIdentifier(sprite, out var guid, out long fileId), Is.True);
                Assert.That(guid, Is.EqualTo("dd14974973a64579aa64c76261ef2f98"));
                Assert.That(fileId, Is.EqualTo(21300000 + 2L * index), names[index]);
            }

            var historical = CheckAtlas(FunctionalGemArt.GetGeminiCandidate, Basic, new Vector2Int(512, 256));
            Assert.That(atlas, Is.Not.SameAs(historical));
            foreach (var kind in Advanced)
                Assert.That(FunctionalGemArt.GetGeminiCandidate(kind), Is.Null);
        }

        [Test]
        public void ApprovedArtFillsBothAxesWithTransparentExtrusion()
        {
            var sprite = FunctionalGemArt.Get("sword");
            var project = Directory.GetParent(Application.dataPath).FullName;
            var path = Path.Combine(project, AssetDatabase.GetAssetPath(sprite.texture));
            var atlas = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            try
            {
                Assert.That(ImageConversion.LoadImage(atlas, File.ReadAllBytes(path)), Is.True);
                var pixels = atlas.GetPixels32();
                foreach (var kind in new List<string>(Basic) { Advanced[0], Advanced[1], Advanced[2] })
                {
                    var region = FunctionalGemArt.Get(kind).rect;
                    var left = (int)region.xMin;
                    var bottom = (int)region.yMin;
                    var right = (int)region.xMax;
                    var top = (int)region.yMax;
                    int visibleLeft = right, visibleBottom = top, visibleRight = left, visibleTop = bottom;
                    for (var y = bottom - 2; y < top + 2; y++)
                    for (var x = left - 2; x < right + 2; x++)
                    {
                        var alpha = pixels[y * atlas.width + x].a;
                        if (x < left || x >= right || y < bottom || y >= top)
                        {
                            if (alpha != 0) Assert.Fail(kind + " opacity in its extrusion gutter");
                        }
                        else if (alpha >= 16)
                        {
                            visibleLeft = Math.Min(visibleLeft, x);
                            visibleRight = Math.Max(visibleRight, x + 1);
                            visibleBottom = Math.Min(visibleBottom, y);
                            visibleTop = Math.Max(visibleTop, y + 1);
                        }
                    }

                    Assert.That(visibleRight - visibleLeft, Is.InRange(123, 128), kind + " visible width");
                    Assert.That(visibleTop - visibleBottom, Is.InRange(123, 128), kind + " visible height");
                    Assert.That(pixels[bottom * atlas.width + left].a, Is.Zero, kind + " rounded corner");
                }
            }
            finally { UnityEngine.Object.DestroyImmediate(atlas); }
        }

        private static Texture2D CheckAtlas(Func<string, Sprite> get, IEnumerable<string> kinds, Vector2Int size)
        {
            var regions = new List<Rect>();
            Texture2D atlas = null;
            foreach (var kind in kinds)
            {
                var sprite = get(kind);
                Assert.That(sprite, Is.Not.Null, kind);
                Assert.That(sprite.name, Is.EqualTo(kind));
                Assert.That(sprite.rect.size, Is.EqualTo(new Vector2(128f, 128f)));
                foreach (var prior in regions)
                    Assert.That(prior.Overlaps(sprite.rect), Is.False, kind);
                regions.Add(sprite.rect);
                atlas ??= sprite.texture;
                Assert.That(sprite.texture, Is.SameAs(atlas), kind);
            }

            Assert.That(atlas.width, Is.EqualTo(size.x));
            Assert.That(atlas.height, Is.EqualTo(size.y));
            Assert.That(atlas.mipmapCount, Is.EqualTo(1));
            Assert.That(get("fire"), Is.Null);
            Assert.That(get("unrecognized"), Is.Null);
            return atlas;
        }
    }
}
