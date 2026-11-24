using System;

namespace Aetheria.World.Domain
{
    // The 8x8 tactical board boundary from specs/pet-arena/mvp-wave-a.md. The
    // board is presentation geometry here; no rule, entropy or outcome lives in
    // Unity. A minimum tile gap keeps the six-value board readable from the
    // arena camera.
    public sealed class WorldBoardDefinition
    {
        public const int MvpColumns = 8;
        public const int MvpRows = 8;
        public const int MvpCellCount = MvpColumns * MvpRows;

        public WorldBoardDefinition(
            string id,
            WorldPoint center,
            int columns,
            int rows,
            float tileSize,
            float gap,
            float surfaceY,
            float tileThickness)
        {
            if (string.IsNullOrEmpty(id)) throw new ArgumentException("Board id is required.", nameof(id));
            if (columns < 2 || rows < 2) throw new ArgumentOutOfRangeException(nameof(columns));
            if (tileSize < .5f) throw new ArgumentOutOfRangeException(nameof(tileSize));
            if (gap < .02f) throw new ArgumentOutOfRangeException(nameof(gap), "A visible tile gap is required.");
            if (tileThickness <= 0f) throw new ArgumentOutOfRangeException(nameof(tileThickness));
            Id = id;
            Center = center;
            Columns = columns;
            Rows = rows;
            TileSize = tileSize;
            Gap = gap;
            SurfaceY = surfaceY;
            TileThickness = tileThickness;
        }

        public string Id { get; }
        public WorldPoint Center { get; }
        public int Columns { get; }
        public int Rows { get; }
        public int CellCount => Columns * Rows;
        public float TileSize { get; }
        public float Gap { get; }
        public float Pitch => TileSize + Gap;
        public float SurfaceY { get; }
        public float TileThickness { get; }
        public float TileCenterY => SurfaceY - TileThickness * .5f;
        public float Footprint => Columns * TileSize + (Columns - 1) * Gap;

        public WorldPoint CellCenter(int column, int row)
        {
            if (column < 0 || column >= Columns) throw new ArgumentOutOfRangeException(nameof(column));
            if (row < 0 || row >= Rows) throw new ArgumentOutOfRangeException(nameof(row));
            var x = Center.X + (column - (Columns - 1) * .5f) * Pitch;
            var z = Center.Z + (row - (Rows - 1) * .5f) * Pitch;
            return new WorldPoint(x, TileCenterY, z);
        }

        public WorldPoint CellTop(int column, int row) => CellCenter(column, row).WithY(SurfaceY);

        public bool ContainsTop(WorldPoint point, float margin = 0f)
        {
            var half = Footprint * .5f + margin;
            return point.X >= Center.X - half && point.X <= Center.X + half &&
                   point.Z >= Center.Z - half && point.Z <= Center.Z + half;
        }

        public WorldPoint[] CellCenters()
        {
            var centers = new WorldPoint[Columns * Rows];
            var index = 0;
            for (var row = 0; row < Rows; row++)
            for (var column = 0; column < Columns; column++)
                centers[index++] = CellCenter(column, row);
            return centers;
        }
    }
}
