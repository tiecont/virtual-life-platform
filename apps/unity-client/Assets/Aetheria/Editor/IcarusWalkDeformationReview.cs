using System;
using System.Collections.Generic;
using System.Linq;
using UniVRM10;
using UnityEditor;
using UnityEngine;
using UnityEngine.Playables;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    // Author and measure an offline correction with the original rig and
    // imported weights. The generic review instance leaves VRM playback off.
    internal static class IcarusWalkDeformationReview
    {
        [Serializable]
        internal sealed class Result
        {
            public int samples, skirtVertexCount, authoredThighCapsules, bakedClothJoints;
            public float durationSeconds, maxClothRotationDegrees, candidatePeakClothRotationDegrees;
            public int chosenBlendPercent;
            public bool improved;
            public Region[] restComparison;
            public Contact before, after;
            public string legAndArmScope, chinScope;
        }

        [Serializable]
        internal sealed class Contact
        {
            public int penetratingVertexSamples;
            public double totalPenetrationMeters;
            public float maximumPenetrationMeters;
        }

        [Serializable]
        internal sealed class Region
        {
            public string region;
            public int edges;
            public float lengthStrainP95, maximumLengthStrain;
        }

        private sealed class RegionSampler
        {
            public readonly string Name;
            public readonly (int A, int B, float Neutral)[] Edges;
            public readonly List<float> Strains = new();

            public RegionSampler(string name, Mesh mesh, Vector3[] neutral, bool[] selected)
            {
                Name = name;
                var edges = new HashSet<(int, int)>();
                var triangles = mesh.triangles;
                for (int i = 0; i < triangles.Length; i += 3)
                {
                    for (int j = 0; j < 3; j++)
                    {
                        int a = triangles[i + j], b = triangles[i + (j+1)%3];
                        if (selected[a] && selected[b]) edges.Add((Math.Min(a,b), Math.Max(a,b)));
                    }
                }
                Edges = edges.Select(edge => (edge.Item1, edge.Item2, Vector3.Distance(neutral[edge.Item1],neutral[edge.Item2])))
                    .Where(edge => edge.Item3 >= .002f).ToArray();
                Require(Edges.Length > 0, $"The imported rig has no measurable {name} edges.");
            }

            public void Record(Vector3[] points)
            {
                foreach (var (a,b,neutral) in Edges)
                    Strains.Add(Mathf.Abs(Vector3.Distance(points[a],points[b])/neutral - 1f));
            }

            public Region Finish()
            {
                Strains.Sort();
                return new Region { region = Name, edges = Edges.Length,
                    lengthStrainP95 = Strains[(int)((Strains.Count-1)*.95f)],
                    maximumLengthStrain = Strains[^1] };
            }
        }

        internal static Result Compare(Vrm10Instance model, Animator animator, SkinnedMeshRenderer[] skins,
            PlayableDirector director, AnimationClip motion, double lead, out AnimationClip corrected)
        {
            Require(!model.enabled, "Run the offline SpringBone comparison on the isolated Generic review instance.");
            var authoredSprings = model.SpringBone.Springs;
            var skirtSprings = authoredSprings.Where(spring => spring.Name.StartsWith("skirt_",StringComparison.Ordinal)).ToList();
            Require(skirtSprings.Count == 8, "The original eight garment chains are required.");
            var joints = skirtSprings.SelectMany(spring => spring.Joints.Take(spring.Joints.Count-1))
                .Select(joint => joint.transform).Distinct().ToArray();
            var rest = joints.Select(joint => joint.localRotation).ToArray();

            var thighs = model.GetComponentsInChildren<VRM10SpringBoneCollider>(true)
                .Where(collider => collider.ColliderType == VRM10SpringBoneColliderTypes.Capsule &&
                    collider.transform.name.StartsWith("upper_leg.",StringComparison.Ordinal)).ToArray();
            Require(thighs.Length == 2, "The two authored thigh capsules are required.");

            var skirt = skins.Single(renderer => renderer.name == "Spring_06_skirt");
            var body = skins.Single(renderer => renderer.name == "Body");
            var head = skins.Single(renderer => renderer.name == "Head");
            var cloth = SelectWeighted(skirt, name => name.StartsWith("skirt_",StringComparison.Ordinal), .50f)
                .Select((value,index) => (value,index)).Where(entry => entry.value).Select(entry => entry.index).ToArray();
            Require(cloth.Length >= 500, "No measurable subset of skirt-driven surface vertices.");

            const float sampleRate = 30;
            int steps = Mathf.CeilToInt(motion.length * sampleRate);
            float dt = motion.length / steps;
            var mesh = new Mesh();
            corrected = null;
            bool runtimeCreated = false;
            try
            {
                body.BakeMesh(mesh);
                var bodyNeutral = mesh.vertices;
                head.BakeMesh(mesh);
                var headNeutral = mesh.vertices;
                var headBounds = mesh.bounds;
                var lowerFront = headNeutral.Select(point =>
                    point.y < headBounds.min.y + headBounds.size.y*.48f &&
                    point.z > headBounds.center.z).ToArray();
                var arms = new RegionSampler("Body · arm / forearm / wrist weights", body.sharedMesh, bodyNeutral,
                    SelectWeighted(body, name => name.StartsWith("upper_arm.",StringComparison.Ordinal) ||
                        name.StartsWith("lower_arm.",StringComparison.Ordinal) ||
                        name.StartsWith("hand.",StringComparison.Ordinal),.70f));
                var legs = new RegionSampler("Body · thigh / shin / foot weights", body.sharedMesh, bodyNeutral,
                    SelectWeighted(body, name => name.StartsWith("upper_leg.",StringComparison.Ordinal) ||
                        name.StartsWith("lower_leg.",StringComparison.Ordinal) ||
                        name.StartsWith("foot.",StringComparison.Ordinal),.70f));
                var chin = new RegionSampler("Head · lower-front surface",head.sharedMesh,headNeutral,lowerFront);

                model.SpringBone.Springs = skirtSprings;
                var spring = model.Runtime.SpringBone;
                runtimeCreated = true;
                Require(spring.ReconstructSpringBone(), "UniVRM could not reconstruct the authored skirt chains.");
                director.RebuildGraph();
                var baseline = new Contact();
                var solved = new Quaternion[joints.Length][];
                for (int j = 0; j < joints.Length; j++) solved[j] = new Quaternion[steps+1];
                var strengths = new[] { .25f, .5f, .75f, 1f };
                var contacts = strengths.Select(_ => new Contact()).ToArray();
                float maximumAngle = 0f;

                for (int i = 0; i <= steps; i++)
                {
                    director.time = lead + Math.Min(motion.length-.0001f,dt*i);
                    director.Evaluate();
                    for (int j = 0; j < joints.Length; j++) joints[j].localRotation = rest[j];
                    MeasureContact(baseline, skirt, cloth, thighs, mesh);
                    body.BakeMesh(mesh);
                    var bodyPose = mesh.vertices;
                    arms.Record(bodyPose);
                    legs.Record(bodyPose);
                    head.BakeMesh(mesh);
                    chin.Record(mesh.vertices);

                    spring.Process(dt);
                    for (int j = 0; j < joints.Length; j++)
                    {
                        solved[j][i] = joints[j].localRotation;
                        maximumAngle = Mathf.Max(maximumAngle, Quaternion.Angle(rest[j],solved[j][i]));
                    }
                    for (int k = 0; k < strengths.Length; k++)
                    {
                        for (int j = 0; j < joints.Length; j++)
                            joints[j].localRotation = Quaternion.Slerp(rest[j],solved[j][i],strengths[k]);
                        MeasureContact(contacts[k],skirt,cloth,thighs,mesh);
                    }
                    // Keep UniVRM's history on its full solved trajectory,
                    // independently of the candidate strengths we measured.
                    for (int j = 0; j < joints.Length; j++) joints[j].localRotation = solved[j][i];
                }

                int winner = -1;
                double best = baseline.totalPenetrationMeters;
                for (int k = 0; k < strengths.Length; k++)
                {
                    if (contacts[k].totalPenetrationMeters >= best-.000001 ||
                        contacts[k].maximumPenetrationMeters > baseline.maximumPenetrationMeters+.00001f ||
                        contacts[k].penetratingVertexSamples > baseline.penetratingVertexSamples) continue;
                    winner = k;
                    best = contacts[k].totalPenetrationMeters;
                }
                float selected = winner < 0 ? 0f : strengths[winner];
                if (selected > 0)
                    corrected = BakeGarment(animator,motion,joints,rest,solved,dt,selected);

                return new Result {
                    samples = steps+1, skirtVertexCount = cloth.Length, authoredThighCapsules = thighs.Length,
                    bakedClothJoints = selected > 0 ? joints.Length : 0, durationSeconds = motion.length,
                    candidatePeakClothRotationDegrees = maximumAngle, maxClothRotationDegrees = maximumAngle*selected,
                    chosenBlendPercent = Mathf.RoundToInt(selected*100), improved = winner >= 0,
                    before = baseline, after = winner < 0 ? baseline : contacts[winner],
                    restComparison = new[] { arms.Finish(), legs.Finish(), chin.Finish() },
                    legAndArmScope = "Measured existing weighted mesh against rest pose. Original body and limb curves retained.",
                    chinScope = "Measured lower-front Head surface. Original export has no mapped jaw or expression deformation.",
                };
            }
            finally
            {
                for (int j=0; j<joints.Length; j++) joints[j].localRotation = rest[j];
                if (runtimeCreated) model.DisposeRuntime();
                model.SpringBone.Springs = authoredSprings;
                Object.DestroyImmediate(mesh);
            }
        }

        private static AnimationClip BakeGarment(Animator animator, AnimationClip baseClip, Transform[] joints,
            Quaternion[] rest, Quaternion[][] solved, float dt, float strength)
        {
            var clip = Object.Instantiate(baseClip);
            clip.name = "IcarusWalkPrivateGarmentCorrection";
            var bindings = new List<EditorCurveBinding>();
            var curves = new List<AnimationCurve>();
            string[] properties = { "m_LocalRotation.x", "m_LocalRotation.y", "m_LocalRotation.z", "m_LocalRotation.w" };
            for (int j = 0; j < joints.Length; j++)
            {
                string path = AnimationUtility.CalculateTransformPath(joints[j],animator.transform);
                var rotations = solved[j].Select(value => Quaternion.Slerp(rest[j],value,strength)).ToArray();
                for (int channel = 0; channel < properties.Length; channel++)
                {
                    int component = channel;
                    bindings.Add(EditorCurveBinding.FloatCurve(path,typeof(Transform),properties[channel]));
                    curves.Add(new AnimationCurve(rotations.Select((value,i) =>
                        new Keyframe(dt*i,value[component])).ToArray()));
                }
            }
            AnimationUtility.SetEditorCurves(clip,bindings.ToArray(),curves.ToArray());
            clip.EnsureQuaternionContinuity();
            return clip;
        }

        private static bool[] SelectWeighted(SkinnedMeshRenderer mesh, Func<string,bool> select, float minimum)
        {
            var marked = mesh.bones.Select(bone => bone != null && select(bone.name)).ToArray();
            var weights = mesh.sharedMesh.boneWeights;
            Require(weights.Length == mesh.sharedMesh.vertexCount,"This source must retain its four-index VRM vertex weights.");
            return weights.Select(weight => (marked[weight.boneIndex0] ? weight.weight0 : 0) +
                (marked[weight.boneIndex1] ? weight.weight1 : 0) + (marked[weight.boneIndex2] ? weight.weight2 : 0) +
                (marked[weight.boneIndex3] ? weight.weight3 : 0) >= minimum).ToArray();
        }

        private static void MeasureContact(Contact facts, SkinnedMeshRenderer skirt, int[] cloth,
            VRM10SpringBoneCollider[] thighs, Mesh mesh)
        {
            skirt.BakeMesh(mesh);
            var points = mesh.vertices;
            var capsules = thighs.Select(collider => {
                var start = collider.transform.TransformPoint(collider.Offset);
                var direction = collider.transform.TransformPoint(collider.Tail)-start;
                return (Start:start, Direction:direction, Radius:collider.Radius*collider.transform.lossyScale.x);
            }).ToArray();
            foreach (int vertex in cloth)
            {
                Vector3 point = skirt.transform.TransformPoint(points[vertex]);
                float depth = 0f;
                foreach (var capsule in capsules)
                {
                    float fraction = Mathf.Clamp01(Vector3.Dot(point-capsule.Start,capsule.Direction)/capsule.Direction.sqrMagnitude);
                    depth = Mathf.Max(depth,capsule.Radius-Vector3.Distance(point,capsule.Start+fraction*capsule.Direction));
                }
                if (depth <= .0005f) continue;
                facts.penetratingVertexSamples++;
                facts.totalPenetrationMeters += depth;
                facts.maximumPenetrationMeters = Mathf.Max(facts.maximumPenetrationMeters,depth);
            }
        }

        private static void Require(bool value, string message)
        {
            if (!value) throw new InvalidOperationException(message);
        }
    }
}
