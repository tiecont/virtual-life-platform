using System;

namespace Aetheria.IcarusPrototype
{
    public enum MotionMode { Normal, Reduced, Off }

    public readonly struct FireZone
    {
        public const string PetId = "pet-v3-fire-icarus";
        public const string Opcode = "FIRE_ZONE";
        public const int BoardSize = 10;
        public const int Side = 4;
        public const int DurationTurns = 2;

        public readonly int Column, Row, FirstTurn;

        public FireZone(int column, int row, int firstTurn)
        {
            if (column < 0 || column > BoardSize - Side) throw new ArgumentOutOfRangeException(nameof(column));
            if (row < 0 || row > BoardSize - Side) throw new ArgumentOutOfRangeException(nameof(row));
            if (firstTurn < 0) throw new ArgumentOutOfRangeException(nameof(firstTurn));
            Column = column;
            Row = row;
            FirstTurn = firstTurn;
        }

        public bool Contains(int column, int row) =>
            column >= Column && column < Column + Side && row >= Row && row < Row + Side;

        public bool IsActiveAt(int turn) => turn >= FirstTurn && turn - FirstTurn < DurationTurns;
    }

    // Values enter here after receipt validation. One projection instance belongs to one board session.
    public sealed class FireZoneProjection
    {
        public long Revision { get; private set; } = -1;
        public int Turn { get; private set; } = -1;
        public FireZone? ActiveZone { get; private set; }
        public int TurnsRemaining => ActiveZone is FireZone zone ? FireZone.DurationTurns - (Turn - zone.FirstTurn) : 0;

        public bool Apply(long revision, int turn, FireZone? serverZone)
        {
            if (revision <= Revision || turn < 0 || turn < Turn) return false;
            Revision = revision;
            Turn = turn;
            ActiveZone = serverZone is FireZone zone && zone.IsActiveAt(turn) ? zone : (FireZone?)null;
            return true;
        }
    }
}
