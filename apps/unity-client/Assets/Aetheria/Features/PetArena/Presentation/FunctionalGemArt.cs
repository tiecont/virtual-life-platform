using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetheria.PetArena.Presentation
{
    public static class FunctionalGemArt
    {
        private static readonly Lazy<Dictionary<string, Sprite>> ReferenceGenerated =
            new Lazy<Dictionary<string, Sprite>>(() => Load("FunctionalTiles/FunctionalGems"));

#if UNITY_EDITOR || DEVELOPMENT_BUILD
        private static readonly Lazy<Dictionary<string, Sprite>> GeminiNeonHigh =
            new Lazy<Dictionary<string, Sprite>>(() => Load("FunctionalTiles/FunctionalGemsGemini"));
        public static Sprite GetGeminiCandidate(string kind) => Find(GeminiNeonHigh, kind);
#endif

        public static Sprite Get(string kind) => Find(ReferenceGenerated, kind);

        private static Sprite Find(Lazy<Dictionary<string, Sprite>> atlas, string kind)
        {
            return kind != null && atlas.Value.TryGetValue(kind, out var match) ? match : null;
        }

        private static Dictionary<string, Sprite> Load(string resource)
        {
            var atlas = new Dictionary<string, Sprite>(StringComparer.Ordinal);
            foreach (var sprite in Resources.LoadAll<Sprite>(resource))
                atlas.Add(sprite.name, sprite);
            return atlas;
        }
    }
}
