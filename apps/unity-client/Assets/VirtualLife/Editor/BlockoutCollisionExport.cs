using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEngine;
using VirtualLife.Blockout;

namespace VirtualLife.Editor
{
    public static class BlockoutCollisionExport
    {
        public static void Write()
        {
            const string geometrySource = "Assets/VirtualLife/Features/Blockout/Domain/BlockoutGeometry.cs";
            using var hash = SHA256.Create();
            var manifest = new Manifest {
                sceneAssetGuid = AssetDatabase.AssetPathToGUID(ProjectBuild.Scene),
                geometrySourceGuid = AssetDatabase.AssetPathToGUID(geometrySource),
                geometrySourceSha256 = BitConverter.ToString(hash.ComputeHash(File.ReadAllBytes(geometrySource))).Replace("-", "").ToLowerInvariant(),
                materialAssetGuid = AssetDatabase.AssetPathToGUID("Assets/VirtualLife/Resources/BlockoutLit.mat"),
                interactions = BlockoutGeometry.Boxes.Where(box => box.Name == "Activity terminal" || box.Name == "Arena entrance placeholder").Select(box => new Interaction {
                    id = box.Name == "Activity terminal" ? "activity-terminal" : "pet-arena", geometryGuid = box.Id, radiusMm = Mm(District.InteractionRadius)
                }).ToArray(),
                boxes = BlockoutGeometry.Boxes.Select(box => new CollisionBox {
                    geometryGuid = box.Id, name = box.Name,
                    minMm = new[] {Mm(box.X - box.Width / 2), Mm(box.Y - box.Height / 2), Mm(box.Z - box.Depth / 2)},
                    maxMm = new[] {Mm(box.X + box.Width / 2), Mm(box.Y + box.Height / 2), Mm(box.Z + box.Depth / 2)},
                    walkableSurface = box.Name == "District floor"
                }).ToArray(),
                anchors = BlockoutGeometry.Anchors.Select(anchor => new Anchor {
                    id = anchor.Id, positionMm = new[] {Mm(anchor.X), 1100, Mm(anchor.Z)}
                }).ToArray()
            };
            if (new[] {manifest.sceneAssetGuid, manifest.geometrySourceGuid, manifest.materialAssetGuid}
                .Any(guid => guid.Length != 32)) throw new InvalidOperationException("Blockout source assets must resolve before export");
            var path = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../config/aurora-blockout-collision.json"));
            var json = JsonUtility.ToJson(manifest, true) + "\n";
            if (!File.Exists(path) || File.ReadAllText(path) != json) File.WriteAllText(path, json, new UTF8Encoding(false));
        }
        private static int Mm(float meters) => checked((int)Math.Round(meters * 1000));
        [Serializable] private sealed class Manifest {
            public int schemaVersion = 1;
            public string districtId = "aurora-plaza", units = "millimeters", coordinateSystem = "Unity left-handed Y-up; X/Z ground plane";
            public string sceneAssetGuid, geometrySourceGuid, geometrySourceSha256, materialAssetGuid;
            public bool developerOnly = true, nativeMovementEnabled = false;
            public int capsuleRadiusMm = 400, capsuleHeightMm = 2000, capsuleSkinMm = 80;
            public int[] allowedCenterMinXZ = {-15500, -15500}, allowedCenterMaxXZ = {15500, 15500};
            public CollisionBox[] boxes;
            public Anchor[] anchors;
            public Interaction[] interactions;
        }
        [Serializable] private sealed class CollisionBox {
            public string geometryGuid, name;
            public int[] minMm, maxMm;
            public bool walkableSurface;
        }
        [Serializable] private sealed class Anchor { public string id; public int[] positionMm; }
        [Serializable] private sealed class Interaction { public string id, geometryGuid; public int radiusMm; }
    }
}
