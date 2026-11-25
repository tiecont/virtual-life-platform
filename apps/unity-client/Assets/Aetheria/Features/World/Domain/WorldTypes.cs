using System;
using System.Globalization;

namespace Aetheria.World.Domain
{
    // Engine-free value types shared by the hub, arena layouts and the editor
    // scene composer. Domain code stays pure so layout rules can be tested
    // without a scene, renderer or graphics device.
    public readonly struct WorldPoint : IEquatable<WorldPoint>
    {
        public readonly float X;
        public readonly float Y;
        public readonly float Z;

        public WorldPoint(float x, float y, float z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        public static readonly WorldPoint Zero = new WorldPoint(0f, 0f, 0f);

        public WorldPoint Offset(float x, float y, float z) => new WorldPoint(X + x, Y + y, Z + z);

        public WorldPoint WithY(float y) => new WorldPoint(X, y, Z);

        public float DistanceTo(WorldPoint other)
        {
            var dx = X - other.X;
            var dy = Y - other.Y;
            var dz = Z - other.Z;
            return (float)Math.Sqrt(dx * dx + dy * dy + dz * dz);
        }

        public bool Equals(WorldPoint other) => X == other.X && Y == other.Y && Z == other.Z;

        public override bool Equals(object obj) => obj is WorldPoint other && Equals(other);

        public override int GetHashCode()
        {
            unchecked
            {
                var hash = X.GetHashCode();
                hash = (hash * 397) ^ Y.GetHashCode();
                hash = (hash * 397) ^ Z.GetHashCode();
                return hash;
            }
        }

        public override string ToString() =>
            "(" + X.ToString("0.###", CultureInfo.InvariantCulture) + ", " +
            Y.ToString("0.###", CultureInfo.InvariantCulture) + ", " +
            Z.ToString("0.###", CultureInfo.InvariantCulture) + ")";
    }

    public readonly struct WorldEuler
    {
        public readonly float X;
        public readonly float Y;
        public readonly float Z;

        public WorldEuler(float x, float y, float z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        public static readonly WorldEuler Zero = new WorldEuler(0f, 0f, 0f);

        public override string ToString() =>
            "(" + X.ToString("0.###", CultureInfo.InvariantCulture) + ", " +
            Y.ToString("0.###", CultureInfo.InvariantCulture) + ", " +
            Z.ToString("0.###", CultureInfo.InvariantCulture) + ")";
    }

    public readonly struct WorldColor : IEquatable<WorldColor>
    {
        public readonly float R;
        public readonly float G;
        public readonly float B;
        public readonly float A;

        public WorldColor(float r, float g, float b, float a = 1f)
        {
            R = r;
            G = g;
            B = b;
            A = a;
        }

        public static readonly WorldColor White = new WorldColor(1f, 1f, 1f);
        public static readonly WorldColor Black = new WorldColor(0f, 0f, 0f);

        // Art-bible colours are authored as sRGB hex; material creation keeps
        // these values unchanged for the development URP materials.
        public static WorldColor FromHex(string hex)
        {
            if (string.IsNullOrEmpty(hex)) throw new ArgumentException("A colour hex value is required.", nameof(hex));
            var value = hex[0] == '#' ? hex.Substring(1) : hex;
            if (value.Length != 6 && value.Length != 8)
                throw new FormatException("Expected #RRGGBB or #RRGGBBAA, received " + hex + ".");
            var r = int.Parse(value.Substring(0, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
            var g = int.Parse(value.Substring(2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
            var b = int.Parse(value.Substring(4, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
            var a = value.Length == 8
                ? int.Parse(value.Substring(6, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture)
                : 255;
            return new WorldColor(r / 255f, g / 255f, b / 255f, a / 255f);
        }

        public float Luminance => 0.2126f * R + 0.7152f * G + 0.0722f * B;

        public WorldColor WithAlpha(float alpha) => new WorldColor(R, G, B, alpha);

        public static WorldColor Mix(WorldColor first, WorldColor second, float amount)
        {
            var t = amount < 0f ? 0f : amount > 1f ? 1f : amount;
            return new WorldColor(
                first.R + (second.R - first.R) * t,
                first.G + (second.G - first.G) * t,
                first.B + (second.B - first.B) * t,
                first.A + (second.A - first.A) * t);
        }

        public float DistanceTo(WorldColor other)
        {
            var dr = R - other.R;
            var dg = G - other.G;
            var db = B - other.B;
            return (float)Math.Sqrt(dr * dr + dg * dg + db * db);
        }

        public bool Equals(WorldColor other) => R == other.R && G == other.G && B == other.B && A == other.A;

        public override bool Equals(object obj) => obj is WorldColor other && Equals(other);

        public override int GetHashCode()
        {
            unchecked
            {
                var hash = R.GetHashCode();
                hash = (hash * 397) ^ G.GetHashCode();
                hash = (hash * 397) ^ B.GetHashCode();
                hash = (hash * 397) ^ A.GetHashCode();
                return hash;
            }
        }

        public override string ToString() => "#" +
            ((int)Math.Round(R * 255f)).ToString("X2", CultureInfo.InvariantCulture) +
            ((int)Math.Round(G * 255f)).ToString("X2", CultureInfo.InvariantCulture) +
            ((int)Math.Round(B * 255f)).ToString("X2", CultureInfo.InvariantCulture);
    }
}
