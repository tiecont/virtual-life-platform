using System;
using System.Collections.Generic;

namespace Aetheria.World.Domain
{
    // Shared layout validation used by the editor scene builder, EditMode tests
    // and foundation previews. Returning problems instead of throwing lets tests
    // report every broken binding at once.
    public static class WorldLayoutValidator
    {
        public static IReadOnlyList<string> Validate(WorldLayout layout)
        {
            var problems = new List<string>();
            if (layout == null)
            {
                problems.Add("Layout is null.");
                return problems;
            }
            if (string.IsNullOrEmpty(layout.MapId)) problems.Add("Map id is required.");
            if (string.IsNullOrEmpty(layout.DisplayName)) problems.Add("Display name is required.");
            if (layout.Theme == null) problems.Add("Theme is required.");
            if (layout.Camera == null) problems.Add("Camera framing is required.");
            if (layout.BoundsMin.X >= layout.BoundsMax.X || layout.BoundsMin.Z >= layout.BoundsMax.Z)
                problems.Add("Walkable bounds are inverted.");
            if (layout.SpawnAnchors.Count == 0) problems.Add("At least one spawn anchor is required.");
            if (layout.FindSpawn(layout.DefaultSpawnId) == null)
                problems.Add("Default spawn anchor does not exist: " + layout.DefaultSpawnId);
            foreach (var spawn in layout.SpawnAnchors)
                if (!layout.Contains(spawn.Position, .5f))
                    problems.Add("Spawn anchor outside walkable bounds: " + spawn.Id);
            if (layout.PreviewOnly)
            {
                if (!string.IsNullOrEmpty(layout.SceneName))
                    problems.Add("A foundation preview must not name a scene.");
                if (layout.ActivePortals().Count != 0)
                    problems.Add("A foundation preview must not expose an interactable portal.");
            }
            else if (layout.Kind == WorldLayoutKind.Arena && string.IsNullOrEmpty(layout.SceneName))
            {
                problems.Add("A playable arena layout requires a scene name.");
            }

            if (layout.Placements.Count == 0) problems.Add("Environment placements are empty.");
            var placementNames = new HashSet<string>(StringComparer.Ordinal);
            foreach (var placement in layout.Placements)
            {
                if (!EnvironmentKit.TryGet(placement.PartId, out var part))
                    problems.Add("Placement references an unknown kit part: " + placement.PartId);
                if (!placementNames.Add(placement.Name))
                    problems.Add("Duplicate placement name: " + placement.Name);
                if (placement.Scale.X < 0f || placement.Scale.Y < 0f || placement.Scale.Z < 0f)
                    problems.Add("Negative placement scale: " + placement.Name);
                if (part == null) continue;
                if (!string.IsNullOrEmpty(placement.MaterialKey) &&
                    !WorldMaterialKeys.IsThemeKey(placement.MaterialKey) &&
                    !WorldMaterialKeys.IsSharedKey(placement.MaterialKey))
                    problems.Add("Placement material is neither a theme nor shared key: " + placement.MaterialKey);
            }

            var portalIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var portal in layout.Portals)
            {
                if (!portalIds.Add(portal.Id)) problems.Add("Duplicate portal id: " + portal.Id);
                if (!layout.Contains(portal.Position, 1f))
                    problems.Add("Portal is outside walkable bounds: " + portal.Id);
                if (portal.Interactable)
                {
                    if (string.IsNullOrEmpty(portal.TargetScene))
                        problems.Add("Interactable portal has no target scene: " + portal.Id);
                    if (string.IsNullOrEmpty(portal.TargetSpawnId))
                        problems.Add("Interactable portal has no target spawn anchor: " + portal.Id);
                    if (string.IsNullOrEmpty(portal.PortalMaterialKey) ||
                        !WorldMaterialKeys.IsSharedKey(portal.PortalMaterialKey))
                        problems.Add("Interactable portal has no element material: " + portal.Id);
                }
                else if (!portal.IsFoundationMarker)
                {
                    problems.Add("Non-interactable portal must be an explicit foundation marker: " + portal.Id);
                }
            }

            if (layout.Kind == WorldLayoutKind.Arena)
            {
                if (layout.Board == null)
                {
                    problems.Add("Arena layout requires a board definition.");
                }
                else
                {
                    var board = layout.Board;
                    if (board.Columns != WorldBoardDefinition.MvpColumns || board.Rows != WorldBoardDefinition.MvpRows)
                        problems.Add("Arena board must stay 8x8.");
                    if (board.CellCount != WorldBoardDefinition.MvpCellCount)
                        problems.Add("Arena board must contain exactly 64 cells.");
                    if (board.Gap < .02f) problems.Add("Arena board needs a visible tile gap.");
                    if (board.SurfaceY < .5f) problems.Add("Arena board must be raised above the floor.");
                    var centers = new HashSet<WorldPoint>();
                    foreach (var center in board.CellCenters())
                    {
                        if (!centers.Add(center)) problems.Add("Board cell centres overlap.");
                        if (!layout.Contains(center, 0f)) problems.Add("Board cell outside walkable bounds: " + center);
                    }
                    if (centers.Count != WorldBoardDefinition.MvpCellCount)
                        problems.Add("Arena board does not expose 64 distinct cells.");
                }

                if (layout.Actors.Count != 2) problems.Add("Arena layout requires exactly one Pet and one enemy.");
                WorldActorDefinition pet = null;
                WorldActorDefinition enemy = null;
                foreach (var actor in layout.Actors)
                {
                    if (!layout.Contains(actor.Position, 0f))
                        problems.Add("Actor outside walkable bounds: " + actor.Role);
                    if (string.Equals(actor.Role, "pet", StringComparison.Ordinal)) pet = actor;
                    else if (string.Equals(actor.Role, "enemy", StringComparison.Ordinal)) enemy = actor;
                }
                if (pet == null) problems.Add("Arena layout is missing the Pet actor.");
                if (enemy == null) problems.Add("Arena layout is missing the enemy actor.");
                if (pet != null && enemy != null)
                {
                    if (pet.Position.DistanceTo(enemy.Position) < 4f)
                        problems.Add("Pet and enemy presentation overlap.");
                    if (layout.Board != null)
                    {
                        if (layout.Board.ContainsTop(pet.Position, .2f) ||
                            layout.Board.ContainsTop(enemy.Position, .2f))
                            problems.Add("Actors must stand beside the board, not on a cell.");
                    }
                }
            }

            if (layout.Camera != null)
            {
                if (layout.Camera.Position.DistanceTo(layout.Camera.Target) < 4f)
                    problems.Add("Camera is too close to its framing target.");
                if (layout.Camera.FieldOfView < 20f || layout.Camera.FieldOfView > 90f)
                    problems.Add("Camera field of view is outside the readable range.");
            }
            return problems;
        }
    }
}
