using System;
using Aetheria.IcarusPrototype;

internal static class ProjectionChecks
{
    private static void Main()
    {
        var zone = new FireZone(6, 0, 20);
        int count = 0;
        for (int row = 0; row < FireZone.BoardSize; row++)
            for (int column = 0; column < FireZone.BoardSize; column++)
                if (zone.Contains(column, row)) count++;
        Require(count == 16 && zone.Contains(9, 3) && !zone.Contains(5, 0) && !zone.Contains(9, 4), "Edge footprint");
        Reject(() => new FireZone(7, 0, 20));
        Reject(() => new FireZone(0, 7, 20));
        Reject(() => new FireZone(-1, 0, 20));
        Reject(() => new FireZone(0, 0, -1));

        var projection = new FireZoneProjection();
        Require(projection.Apply(10, 19, zone) && !projection.ActiveZone.HasValue, "Future start");
        Require(projection.Apply(11, 20, zone) && projection.TurnsRemaining == 2, "First turn");
        Require(projection.Apply(12, 20, zone) && projection.TurnsRemaining == 2, "Same turn revision");
        Require(!projection.Apply(12, 21, null) && projection.TurnsRemaining == 2, "Duplicate revision");
        Require(!projection.Apply(9, 21, null) && projection.TurnsRemaining == 2, "Stale revision");
        Require(!projection.Apply(13, 19, null) && projection.Revision == 12, "Regressed turn");
        Require(projection.Apply(13, 21, zone) && projection.TurnsRemaining == 1, "Second turn");
        Require(projection.Apply(14, 22, zone) && !projection.ActiveZone.HasValue, "Expired zone in newer snapshot");
        var fresh = new FireZoneProjection();
        Require(fresh.Apply(25, 21, zone) && fresh.TurnsRemaining == 1, "Reconnect during second turn");
        Require(fresh.Apply(26, 21, null) && fresh.TurnsRemaining == 0, "Authoritative removal");
        Console.WriteLine("Projection checks passed");
    }

    private static void Reject(Action action)
    {
        try { action(); }
        catch (ArgumentOutOfRangeException) { return; }
        throw new InvalidOperationException("Invalid zone accepted");
    }

    private static void Require(bool value, string description)
    {
        if (!value) throw new InvalidOperationException(description);
    }
}
