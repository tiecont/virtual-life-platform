using System;
using System.Collections.Generic;

namespace VirtualLife.Blockout
{
    // Temporary developer geometry, shared by presentation and the collision
    // exporter. Stable shape IDs survive display-name and material changes.
    public static class BlockoutGeometry
    {
        public readonly struct Box
        {
            public readonly string Id, Name;
            public readonly float X, Y, Z, Width, Height, Depth;
            public Box(string id, string name, float x, float y, float z, float width, float height, float depth)
            {
                Id = id; Name = name; X = x; Y = y; Z = z;
                Width = width; Height = height; Depth = depth;
            }
        }

        public static IReadOnlyList<Box> Boxes { get; } = Array.AsReadOnly(new[] {
            new Box("f83ad680fc7f432f87d730f70cc10001", "District floor", 0, 0, 0, 32, 0.2f, 32),
            new Box("f83ad680fc7f432f87d730f70cc10002", "Cafe placeholder", -9, 1.5f, 8, 6, 3, 5),
            new Box("f83ad680fc7f432f87d730f70cc10003", "Arena entrance placeholder", 9, 0.8f, 8, 3, 1.6f, 2),
            new Box("f83ad680fc7f432f87d730f70cc10004", "Activity terminal", 0, 0.8f, 3, 1, 1.6f, 1)
        });

        public readonly struct Anchor
        {
            public readonly string Id;
            public readonly float X, Z;
            public Anchor(string id, float x, float z) { Id = id; X = x; Z = z; }
        }
        public static IReadOnlyList<Anchor> Anchors { get; } = Array.AsReadOnly(new[] {
            new Anchor("spawn", 0, -4), new Anchor("cafe-approach", -9, 4),
            new Anchor("arena-approach", 9, 6), new Anchor("terminal-approach", 0, 1)
        });
    }
}
