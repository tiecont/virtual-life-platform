using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetheria.PetArena.Presentation
{
    public static class FunctionalGemArt
    {
        private const string Resource = "FunctionalTiles/FunctionalGems";
        private static Dictionary<string, Sprite> sprites;

        public static Sprite Get(string kind)
        {
            if (kind == null) return null;
            if (sprites == null)
            {
                sprites = new Dictionary<string, Sprite>(StringComparer.Ordinal);
                foreach (var sprite in Resources.LoadAll<Sprite>(Resource))
                    sprites.Add(sprite.name, sprite);
            }

            return sprites.TryGetValue(kind, out var match) ? match : null;
        }
    }
}
