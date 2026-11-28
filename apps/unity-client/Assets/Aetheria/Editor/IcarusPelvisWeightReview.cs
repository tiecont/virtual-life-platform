using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Playables;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    internal static class IcarusPelvisWeightReview
    {
        [Serializable]
        internal sealed class Facts
        {
            public string sourceCandidateSha256;
            public int changedLowerBodyVertices, comparedEdges, walkSamples;
            public float originalMaximumLengthRatio, correctedMaximumLengthRatio;
            public float originalP99EdgeMaximumRatio, correctedP99EdgeMaximumRatio;
            public int originalEdgesAboveTwoTimes, correctedEdgesAboveTwoTimes;
            public bool improved, originalTriangleClassesRetained;
        }

        internal static Facts Compare(SkinnedMeshRenderer body, SkinnedMeshRenderer candidate, PlayableDirector director,
            double start, float length, string hash)
        {
            var original = body.sharedMesh;
            var corrected = candidate.sharedMesh;
            if (corrected == null || original.vertexCount != corrected.vertexCount ||
                !original.vertices.SequenceEqual(corrected.vertices) || !original.normals.SequenceEqual(corrected.normals) ||
                !original.uv.SequenceEqual(corrected.uv) || !original.bindposes.SequenceEqual(corrected.bindposes) ||
                !body.bones.Select(b => b.name).SequenceEqual(candidate.bones.Select(b => b.name)) ||
                original.subMeshCount != corrected.subMeshCount || original.blendShapeCount != corrected.blendShapeCount)
                throw new InvalidOperationException("The private pelvis candidate changed Body geometry, UVs or bindposes.");

            int[] originalLower = original.GetIndices(0);
            var lowerVertices = new HashSet<int>(originalLower);
            for (int submesh=0;submesh<original.subMeshCount;submesh++)
                if (!original.GetIndices(submesh).SequenceEqual(corrected.GetIndices(submesh)))
                    throw new InvalidOperationException("The pelvis candidate changed material-bound Body topology.");
            var boneNames = body.bones.Select(bone => bone.name).ToArray();
            var baseline = original.boneWeights;
            var candidateWeights = corrected.boneWeights;
            if (baseline.Length != original.vertexCount || candidateWeights.Length != baseline.Length)
                throw new InvalidOperationException("The original Body weight channels are missing.");
            int changed = 0;
            for (int vertex=0;vertex<baseline.Length;vertex++)
            {
                if (candidateWeights[vertex].Equals(baseline[vertex])) continue;
                if (!lowerVertices.Contains(vertex))
                    throw new InvalidOperationException("A pelvis weight was changed outside the lower Body primitive.");
                var old = Weights(baseline[vertex],boneNames);
                var update = Weights(candidateWeights[vertex],boneNames);
                bool moved = false;
                foreach (string name in old.Keys.Concat(update.Keys).Distinct(StringComparer.Ordinal))
                {
                    float delta = update.GetValueOrDefault(name)-old.GetValueOrDefault(name);
                    if (Mathf.Abs(delta)<.00001f) continue;
                    moved = true;
                    if ((name=="hips" && delta>=0) || (name.StartsWith("upper_leg.",StringComparison.Ordinal)))
                        continue;
                    throw new InvalidOperationException("A pelvis transfer changed an unrelated influence.");
                }
                if (Mathf.Abs(old.Values.Sum()-update.Values.Sum())>.00001f)
                    throw new InvalidOperationException("A pelvis transfer changed the total weight.");
                if (moved) changed++;
            }
            if (changed==0) throw new InvalidOperationException("The candidate did not contain a measured pelvic seam repair.");

            int[] originalFaces = IcarusLayerSurfaceExport.Faces(body, original, name =>
                name.StartsWith("upper_leg.",StringComparison.Ordinal) || name.StartsWith("lower_leg.",StringComparison.Ordinal) ||
                name.StartsWith("foot.",StringComparison.Ordinal));
            var topology = new HashSet<(int A,int B)>();
            for (int i=0;i<originalFaces.Length;i+=3)
                for (int j=0;j<3;j++)
                {
                    int a=originalFaces[i+j],b=originalFaces[i+(j+1)%3];
                    topology.Add((Math.Min(a,b),Math.Max(a,b)));
                }
            var positions = original.vertices;
            var edges = topology.Select(edge => (edge.A,edge.B,Length:Vector3.Distance(positions[edge.A],positions[edge.B])))
                .Where(edge=>edge.Length>=.002f).ToArray();
            int steps = Mathf.CeilToInt(length*24);
            var before = new float[edges.Length];
            var after = new float[edges.Length];
            var temporary = new Mesh();
            try
            {
                director.RebuildGraph();
                for (int sample=0;sample<=steps;sample++)
                {
                    director.time = start+Math.Min(length-.0001f,length*sample/steps);
                    director.Evaluate();
                    Accumulate(original,before);
                    Accumulate(corrected,after);
                }
            }
            finally
            {
                body.sharedMesh=original;
                Object.DestroyImmediate(temporary);
            }
            Array.Sort(before);
            Array.Sort(after);
            int beforeDouble=before.Count(value=>value>2f),afterDouble=after.Count(value=>value>2f);
            return new Facts {
                sourceCandidateSha256=hash,changedLowerBodyVertices=changed,comparedEdges=edges.Length,walkSamples=steps+1,
                originalMaximumLengthRatio=before[^1],correctedMaximumLengthRatio=after[^1],
                originalP99EdgeMaximumRatio=before[(int)((before.Length-1)*.99f)],correctedP99EdgeMaximumRatio=after[(int)((after.Length-1)*.99f)],
                originalEdgesAboveTwoTimes=beforeDouble,correctedEdgesAboveTwoTimes=afterDouble,
                improved=after[^1]<before[^1]*.5f && afterDouble<beforeDouble &&
                    after[(int)((after.Length-1)*.99f)] <= before[(int)((before.Length-1)*.99f)]+.15f,
                originalTriangleClassesRetained=true,
            };

            void Accumulate(Mesh mesh,float[] peaks)
            {
                body.sharedMesh=mesh;
                body.BakeMesh(temporary);
                var points=temporary.vertices;
                for (int i=0;i<peaks.Length;i++)
                    peaks[i]=Mathf.Max(peaks[i],Vector3.Distance(points[edges[i].A],points[edges[i].B])/edges[i].Length);
            }
        }

        private static Dictionary<string,float> Weights(BoneWeight weight,string[] names)
        {
            var weights=new Dictionary<string,float>(StringComparer.Ordinal);
            Add(weight.boneIndex0,weight.weight0);
            Add(weight.boneIndex1,weight.weight1);
            Add(weight.boneIndex2,weight.weight2);
            Add(weight.boneIndex3,weight.weight3);
            return weights;

            void Add(int index,float amount)
            {
                if (amount>0) weights[names[index]]=weights.GetValueOrDefault(names[index])+amount;
            }
        }
    }
}
