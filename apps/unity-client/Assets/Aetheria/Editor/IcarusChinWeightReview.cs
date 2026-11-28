using System;
using System.Collections.Generic;
using System.Linq;
using UniVRM10;
using UnityEngine;
using UnityEngine.Playables;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    internal static class IcarusChinWeightReview
    {
        [Serializable]
        internal sealed class Facts
        {
            public string sourceCandidateSha256;
            public int changedHeadVertices, comparedEdges, walkSamples;
            public float deterministicHeadPitchProbeDegrees;
            public Metrics walkOriginal, walkCandidate, pitchOriginal, pitchCandidate;
            public bool walkDriftReduced, pitchDriftReduced;
        }

        [Serializable]
        internal sealed class Metrics
        {
            public float headFrameDriftP95Meters, headFrameDriftMaximumMeters;
            public float edgeLengthStrainP95, edgeLengthStrainMaximum;
        }

        internal static Facts Compare(Vrm10Instance originalModel, SkinnedMeshRenderer renderer,
            SkinnedMeshRenderer candidate, PlayableDirector director, double start, float length, string candidateSha)
        {
            Require(originalModel.TryGetBoneTransform(HumanBodyBones.Head,out var skull) &&
                originalModel.TryGetBoneTransform(HumanBodyBones.Neck,out _),
                "The original model must retain the mapped skull and neck.");
            var original = renderer.sharedMesh;
            var update = candidate.sharedMesh;
            Require(update != null && update.vertexCount == original.vertexCount &&
                update.subMeshCount == original.subMeshCount && original.blendShapeCount == update.blendShapeCount &&
                original.vertices.SequenceEqual(update.vertices) && original.normals.SequenceEqual(update.normals) &&
                original.uv.SequenceEqual(update.uv) && original.bindposes.SequenceEqual(update.bindposes) &&
                renderer.bones.Select(bone => bone.name).SequenceEqual(candidate.bones.Select(bone => bone.name)),
                "Private candidate changed Head surface, UVs, skeleton or bind transforms.");
            for (int index = 0; index < original.subMeshCount; index++)
                Require(original.GetIndices(index).SequenceEqual(update.GetIndices(index)), "Private candidate changed triangle ordering.");
            var originalWeights = original.boneWeights;
            var newWeights = update.boneWeights;
            Require(originalWeights.Length == original.vertexCount && newWeights.Length == update.vertexCount,
                "The candidate lost its original four-index Head weights.");
            var changed = new bool[original.vertexCount];
            for (int i=0; i<changed.Length; i++)
            {
                if (originalWeights[i].Equals(newWeights[i])) continue;
                changed[i] = true;
                var old = JointWeights(originalWeights[i],renderer.bones);
                var updated = JointWeights(newWeights[i],renderer.bones);
                foreach (string joint in old.Keys.Concat(updated.Keys).Distinct(StringComparer.Ordinal))
                {
                    float previous = old.GetValueOrDefault(joint);
                    float current = updated.GetValueOrDefault(joint);
                    if (joint == "head") Require(current >= previous-.00001f,"Chin transfer removed skull support.");
                    else if (joint == "neck") Require(current <= previous+.00001f,"Chin transfer increased neck pull.");
                    else Require(Mathf.Abs(current-previous)<.00001f,"Candidate changed a joint outside skull/neck.");
                }
                Require(Mathf.Abs(old.Values.Sum()-updated.Values.Sum())<.00001f, "Candidate changed total skin influence.");
            }
            int[] changedIndices = Enumerable.Range(0,changed.Length).Where(i => changed[i]).ToArray();
            Require(changedIndices.Length > 0 && changedIndices.Length < original.vertexCount,
                "Expected a localized Head weight change.");
            int skullIndex = Array.IndexOf(renderer.bones,skull);
            Require(skullIndex >= 0,"The Head mesh no longer binds the mapped skull.");

            Vector3[] neutral = original.vertices;
            Vector3[] faceLocal = changedIndices.Select(i => original.bindposes[skullIndex].MultiplyPoint3x4(neutral[i])).ToArray();
            var edges = new HashSet<(int A,int B)>();
            var triangles = original.triangles;
            for (int i=0;i<triangles.Length;i+=3)
                for (int j=0;j<3;j++)
                {
                    int a = triangles[i+j], b = triangles[i+(j+1)%3];
                    if (changed[a] || changed[b]) edges.Add((Math.Min(a,b),Math.Max(a,b)));
                }
            var edgeRest = edges.Select(edge => (edge.A,edge.B,Length:Vector3.Distance(neutral[edge.A],neutral[edge.B])))
                .Where(edge => edge.Length>.001f).ToArray();
            Require(edgeRest.Length > 0, "No local chin/neck edges were measured.");

            var baked = new Mesh();
            var before = new Samples();
            var after = new Samples();
            var pitchBefore = new Samples();
            var pitchAfter = new Samples();
            int steps = Mathf.CeilToInt(length*30);
            const float pitchDegrees = 10;
            try
            {
                director.RebuildGraph();
                for (int frame=0;frame<=steps;frame++)
                {
                    director.time = start+Math.Min(length-.0001f,length*frame/steps);
                    director.Evaluate();
                    Observe(original,before);
                    Observe(update,after);
                }
                director.time = start+length*.45;
                director.Evaluate();
                Quaternion walkPose = skull.localRotation;
                try
                {
                    skull.localRotation = walkPose*Quaternion.AngleAxis(pitchDegrees,Vector3.right);
                    Observe(original,pitchBefore);
                    Observe(update,pitchAfter);
                }
                finally { skull.localRotation = walkPose; }
            }
            finally
            {
                renderer.sharedMesh = original;
                Object.DestroyImmediate(baked);
            }

            var beforeFacts = before.Finish();
            var afterFacts = after.Finish();
            var pitchBeforeFacts = pitchBefore.Finish();
            var pitchAfterFacts = pitchAfter.Finish();
            return new Facts {
                sourceCandidateSha256 = candidateSha, changedHeadVertices = changedIndices.Length,
                comparedEdges = edgeRest.Length, walkSamples = steps+1, deterministicHeadPitchProbeDegrees = pitchDegrees,
                walkOriginal = beforeFacts, walkCandidate = afterFacts,
                pitchOriginal = pitchBeforeFacts, pitchCandidate = pitchAfterFacts,
                walkDriftReduced = afterFacts.headFrameDriftP95Meters < beforeFacts.headFrameDriftP95Meters,
                pitchDriftReduced = pitchAfterFacts.headFrameDriftP95Meters < pitchBeforeFacts.headFrameDriftP95Meters,
            };

            void Observe(Mesh mesh, Samples samples)
            {
                renderer.sharedMesh = mesh;
                renderer.BakeMesh(baked);
                var points = baked.vertices;
                var toHead = skull.worldToLocalMatrix*renderer.transform.localToWorldMatrix;
                for (int i=0;i<changedIndices.Length;i++)
                    samples.Drifts.Add(Vector3.Distance(faceLocal[i],toHead.MultiplyPoint3x4(points[changedIndices[i]])));
                foreach (var edge in edgeRest)
                    samples.Strains.Add(Mathf.Abs(Vector3.Distance(points[edge.A],points[edge.B])/edge.Length-1f));
            }
        }

        private static Dictionary<string,float> JointWeights(BoneWeight weight, Transform[] bones)
        {
            var result = new Dictionary<string,float>(StringComparer.Ordinal);
            Add(weight.boneIndex0,weight.weight0);
            Add(weight.boneIndex1,weight.weight1);
            Add(weight.boneIndex2,weight.weight2);
            Add(weight.boneIndex3,weight.weight3);
            return result;

            void Add(int index,float amount)
            {
                if (amount <= 0) return;
                string key = bones[index].name;
                result[key] = result.GetValueOrDefault(key)+amount;
            }
        }

        private sealed class Samples
        {
            public readonly List<float> Drifts = new();
            public readonly List<float> Strains = new();

            public Metrics Finish()
            {
                Drifts.Sort();
                Strains.Sort();
                return new Metrics {
                    headFrameDriftP95Meters = Drifts[(int)((Drifts.Count-1)*.95f)],
                    headFrameDriftMaximumMeters = Drifts[^1],
                    edgeLengthStrainP95 = Strains[(int)((Strains.Count-1)*.95f)],
                    edgeLengthStrainMaximum = Strains[^1],
                };
            }
        }

        private static void Require(bool value,string error)
        {
            if (!value) throw new InvalidOperationException(error);
        }
    }
}
