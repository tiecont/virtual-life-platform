using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Playables;

namespace Aetheria.Editor
{
    // Private diagnostic input for exact triangle intersection in Blender.
    internal static class IcarusLayerSurfaceExport
    {
        private static bool IsLimb(string bone, bool arms) => arms
            ? bone.StartsWith("upper_arm.", StringComparison.Ordinal) || bone.StartsWith("lower_arm.", StringComparison.Ordinal) ||
              bone.StartsWith("hand.", StringComparison.Ordinal)
            : bone.StartsWith("upper_leg.", StringComparison.Ordinal) || bone.StartsWith("lower_leg.", StringComparison.Ordinal) ||
              bone.StartsWith("foot.", StringComparison.Ordinal);

        internal static int[] Faces(SkinnedMeshRenderer skin, Mesh classifier, Func<string,bool> member)
        {
            string[] bones = skin.bones.Select(b => b.name).ToArray();
            bool[] region = classifier.boneWeights.Select(w =>
                (member(bones[w.boneIndex0]) ? w.weight0 : 0) + (member(bones[w.boneIndex1]) ? w.weight1 : 0) +
                (member(bones[w.boneIndex2]) ? w.weight2 : 0) + (member(bones[w.boneIndex3]) ? w.weight3 : 0) >= .70f
            ).ToArray();
            int[] indices = classifier.triangles;
            return Enumerable.Range(0, indices.Length / 3).Where(i => region[indices[3*i]] &&
                region[indices[3*i+1]] && region[indices[3*i+2]]).SelectMany(i =>
                    new[] {indices[3*i], indices[3*i+1], indices[3*i+2]}).ToArray();
        }

        internal static void Write(string path, SkinnedMeshRenderer[] skins, PlayableDirector director, double lead, float duration,
            Mesh originalBodyClassifier = null, ISet<string> armBones = null)
        {
            var body = skins.Single(s => s.name == "Body");
            var skirt = skins.Single(s => s.name == "Spring_06_skirt");
            var surfaces = new[] {
                (body, Faces(body, originalBodyClassifier ?? body.sharedMesh, name => armBones?.Contains(name) ?? IsLimb(name, true))),
                (body, Faces(body, originalBodyClassifier ?? body.sharedMesh, name => IsLimb(name, false))),
                (skirt, Faces(skirt, skirt.sharedMesh, name => name.StartsWith("skirt_", StringComparison.Ordinal)))
            };
            var baked = new Mesh();
            var time = director.time;
            try
            {
                using var writer = new BinaryWriter(File.Open(path, FileMode.CreateNew));
                writer.Write(0x314C4349); // ICL1, little endian
                foreach (var (skin, faces) in surfaces)
                {
                    if (faces.Length == 0) throw new InvalidOperationException("Empty layer on " + skin.name);
                    writer.Write(skin.sharedMesh.vertexCount);
                    writer.Write(faces.Length);
                    foreach (int index in faces) writer.Write(index);
                }
                int intervals = Mathf.Max(1, Mathf.CeilToInt(duration * 24));
                writer.Write(intervals + 1);
                for (int i = 0; i <= intervals; i++)
                {
                    director.time = lead + Math.Min(duration - .0001f, duration * i / intervals);
                    director.Evaluate();
                    foreach (var (skin, _) in surfaces)
                    {
                        skin.BakeMesh(baked);
                        foreach (var local in baked.vertices)
                        {
                            var p = skin.transform.TransformPoint(local);
                            writer.Write(p.x);
                            writer.Write(p.y);
                            writer.Write(p.z);
                        }
                    }
                }
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(baked);
                director.time = time;
                director.Evaluate();
            }
        }
    }
}
