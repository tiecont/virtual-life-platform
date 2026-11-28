using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UniVRM10;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    internal static class IcarusBowGripFit
    {
        const float RiserHeight = -.036f; // The stable fitted band below BowGrip and its upper ornament.

        [Serializable] internal sealed class Contact
        {
            public int wristCrossings, palmCrossings, fingerCrossings, ornamentCrossings, stringCrossings;
            public float nearestPalmToRiserSampleMeters;
            public float[] nearestDistalToRiserSamplesMeters;
        }

        [Serializable] internal sealed class Evidence
        {
            public Contact baseline, fitted;
            public Vector3 wrist, knuckleCenter, palmNormal, riserCenter, riserAxis, bowPlaneNormal, gripMarker;
            public int isolatedHandTriangles;
            public float metacarpalSpanMeters, handleOffsetAlongBowMeters, outwardAdjustmentMeters, fingerCurlDegrees, riserPlacementErrorMeters;
            public float bowLengthMeters, placementAlongGripMeters;
        }

        enum HandRegion { Wrist, Palm, Finger }

        static readonly HumanBodyBones[,] Digits = {
            { HumanBodyBones.RightIndexProximal, HumanBodyBones.RightIndexIntermediate, HumanBodyBones.RightIndexDistal },
            { HumanBodyBones.RightMiddleProximal, HumanBodyBones.RightMiddleIntermediate, HumanBodyBones.RightMiddleDistal },
            { HumanBodyBones.RightRingProximal, HumanBodyBones.RightRingIntermediate, HumanBodyBones.RightRingDistal },
            { HumanBodyBones.RightLittleProximal, HumanBodyBones.RightLittleIntermediate, HumanBodyBones.RightLittleDistal },
            // UniVRM 1.0 maps its thumb metacarpal and proximal to these Animator slots.
            { HumanBodyBones.RightThumbProximal, HumanBodyBones.RightThumbIntermediate, HumanBodyBones.RightThumbDistal },
        };

        readonly struct Triangle
        {
            internal readonly Vector3 a, b, c;
            internal readonly Bounds box;
            internal readonly HandRegion region;

            internal Triangle(Vector3 a, Vector3 b, Vector3 c, HandRegion region = HandRegion.Palm)
            {
                this.a = a;
                this.b = b;
                this.c = c;
                this.region = region;
                var bounds = new Bounds(a, Vector3.zero);
                bounds.Encapsulate(b);
                bounds.Encapsulate(c);
                box = bounds;
            }
        }

        sealed class Hand : IDisposable
        {
            internal readonly Transform wrist;
            internal readonly Transform[,] digits = new Transform[5, 3];
            internal readonly Vector3 across, distal, normal, knuckles, palmCenter;
            internal readonly float palmLength;
            readonly SkinnedMeshRenderer skin;
            readonly Mesh sample = new();
            readonly (int a, int b, int c, HandRegion region)[] handFaces;
            readonly int[] palmIndices;
            readonly int[][] tipIndices;
            readonly Quaternion[,] original = new Quaternion[5, 3];

            internal Hand(Vrm10Instance vrm)
            {
                Transform Bone(HumanBodyBones bone) => vrm.TryGetBoneTransform(bone, out var found) && found
                    ? found : throw new InvalidDataException($"Original Icarus lacks mapped {bone}.");
                wrist = Bone(HumanBodyBones.RightHand);
                var forearm = Bone(HumanBodyBones.RightLowerArm);
                for (int finger = 0; finger < 5; finger++)
                {
                    for (int joint = 0; joint < 3; joint++)
                    {
                        digits[finger, joint] = Bone(Digits[finger, joint]);
                        original[finger, joint] = digits[finger, joint].localRotation;
                    }
                }
                knuckles = Enumerable.Range(0, 4).Aggregate(Vector3.zero, (sum, i) => sum + digits[i, 0].position) / 4;
                across = (digits[0, 0].position - digits[3, 0].position).normalized;
                distal = Vector3.ProjectOnPlane(knuckles - wrist.position, across).normalized;
                normal = Vector3.Cross(across, distal).normalized;
                if (Vector3.Dot(digits[4, 2].position - knuckles, normal) < 0) normal = -normal;
                palmLength = Vector3.Dot(knuckles - wrist.position, distal);
                if (palmLength < .04f || Vector3.Distance(digits[0, 0].position, digits[3, 0].position) < .025f)
                    throw new InvalidDataException("Cannot frame the actual right palm in this sample.");
                palmCenter = knuckles - distal * (.17f * palmLength);

                skin = vrm.GetComponentsInChildren<SkinnedMeshRenderer>().Single(r => r.name == "Body");
                var bind = skin.sharedMesh;
                var bones = skin.bones;
                var dominant = new Transform[bind.vertexCount];
                var counts = bind.GetBonesPerVertex();
                var weights = bind.GetAllBoneWeights();
                int cursor = 0;
                for (int i = 0; i < dominant.Length; i++)
                {
                    if (counts[i] > 0) dominant[i] = bones[weights[cursor].boneIndex];
                    cursor += counts[i];
                }
                var fingerBones = new HashSet<Transform>(digits.Cast<Transform>());
                var initial = Vertices();
                bool Local(int i) => fingerBones.Contains(dominant[i]) || dominant[i] == wrist ||
                    dominant[i] == forearm && Vector3.Distance(initial[i], wrist.position) <= palmLength * .75f;
                HandRegion Region(int a, int b, int c)
                {
                    if (fingerBones.Contains(dominant[a]) || fingerBones.Contains(dominant[b]) || fingerBones.Contains(dominant[c]))
                        return HandRegion.Finger;
                    var centroid = (initial[a] + initial[b] + initial[c]) / 3;
                    return Vector3.Dot(centroid - wrist.position, distal) < palmLength * .5f ? HandRegion.Wrist : HandRegion.Palm;
                }
                var faces = bind.triangles;
                handFaces = Enumerable.Range(0, faces.Length / 3).Select(i => (a: faces[i * 3], b: faces[i * 3 + 1], c: faces[i * 3 + 2]))
                    .Where(t => Local(t.a) && Local(t.b) && Local(t.c))
                    .Select(t => (t.a, t.b, t.c, Region(t.a, t.b, t.c)))
                    .ToArray();
                palmIndices = Enumerable.Range(0, initial.Length).Where(i => dominant[i] == wrist &&
                    Mathf.Abs(Vector3.Dot(initial[i] - palmCenter, distal)) < .022f &&
                    Mathf.Abs(Vector3.Dot(initial[i] - palmCenter, across)) < .028f).ToArray();
                tipIndices = Enumerable.Range(0, 5).Select(finger => Enumerable.Range(0, initial.Length)
                    .Where(i => dominant[i] == digits[finger, 2]).ToArray()).ToArray();
                if (handFaces.Length == 0 || palmIndices.Length == 0 || tipIndices.Any(tip => tip.Length == 0))
                    throw new InvalidDataException("The skinned source lacks measurable right-hand surface regions.");
            }

            internal Vector3[] Vertices()
            {
                skin.BakeMesh(sample);
                return sample.vertices.Select(skin.transform.TransformPoint).ToArray();
            }

            internal float PalmDepth(Vector3[] points) => palmIndices.Max(i => Vector3.Dot(points[i] - palmCenter, normal));

            internal Triangle[] Surface(Vector3[] points) => handFaces.Select(t =>
                new Triangle(points[t.a], points[t.b], points[t.c], t.region)).ToArray();

            internal (GameObject surface, Mesh mesh, int triangles) Isolate()
            {
                skin.BakeMesh(sample);
                var mesh = Object.Instantiate(sample);
                var selected = handFaces.Select(t => (t.a, t.b, t.c)).ToHashSet();
                int count = 0;
                for (int submesh = 0; submesh < mesh.subMeshCount; submesh++)
                {
                    var indices = skin.sharedMesh.GetTriangles(submesh);
                    var handIndices = new List<int>();
                    for (int i = 0; i < indices.Length; i += 3)
                        if (selected.Contains((indices[i], indices[i + 1], indices[i + 2])))
                        {
                            handIndices.Add(indices[i]);
                            handIndices.Add(indices[i + 1]);
                            handIndices.Add(indices[i + 2]);
                        }
                    mesh.SetTriangles(handIndices, submesh);
                    count += handIndices.Count / 3;
                }
                if (count != handFaces.Length)
                {
                    Object.DestroyImmediate(mesh);
                    throw new InvalidDataException("The sampled hand lost source triangles.");
                }
                var view = new GameObject("Sampled right hand");
                view.transform.SetParent(skin.transform, false);
                view.AddComponent<MeshFilter>().sharedMesh = mesh;
                view.AddComponent<MeshRenderer>().sharedMaterials = skin.sharedMaterials;
                return (view, mesh, count);
            }

            static float NearestSample(int[] selected, Vector3[] points, Vector3[] riser) =>
                selected.Min(i => riser.Min(point => Vector3.Distance(points[i], point)));

            internal float PalmGap(Vector3[] points, Vector3[] riser) => NearestSample(palmIndices, points, riser);
            internal float[] TipGaps(Vector3[] points, Vector3[] riser) =>
                tipIndices.Select(indices => NearestSample(indices, points, riser)).ToArray();

            internal void Restore()
            {
                for (int finger = 0; finger < 5; finger++)
                    for (int joint = 0; joint < 3; joint++)
                        digits[finger, joint].localRotation = original[finger, joint];
            }

            internal void Curl(float amount)
            {
                Restore();
                for (int finger = 0; finger < 4; finger++)
                {
                    var proximal = digits[finger, 0];
                    var proximalAxis = (digits[finger, 1].position - proximal.position).normalized;
                    var hinge = Vector3.Cross(proximalAxis, normal).normalized;
                    for (int joint = 0; joint < 3; joint++)
                        digits[finger, joint].rotation = Quaternion.AngleAxis(amount * (joint == 0 ? 1 : joint == 1 ? 1.1f : .65f), hinge)
                            * digits[finger, joint].rotation;
                }
                var thumb = digits[4, 0];
                var thumbDirection = (digits[4, 1].position - thumb.position).normalized;
                var thumbHinge = Vector3.Cross(thumbDirection, normal - across * .6f).normalized;
                thumb.rotation = Quaternion.AngleAxis(amount * .53f, thumbHinge) * thumb.rotation;
                digits[4, 1].rotation = Quaternion.AngleAxis(amount * .42f, thumbHinge) * digits[4, 1].rotation;
            }

            public void Dispose() => Object.DestroyImmediate(sample);
        }

        static bool SegmentHits(Vector3 start, Vector3 end, Triangle triangle)
        {
            var direction = end - start;
            var ab = triangle.b - triangle.a;
            var ac = triangle.c - triangle.a;
            var axis = Vector3.Cross(direction, ac);
            float denominator = Vector3.Dot(ab, axis);
            if (Mathf.Abs(denominator) < 1e-11f) return false;
            var fromA = start - triangle.a;
            float u = Vector3.Dot(fromA, axis) / denominator;
            if (u < 0 || u > 1) return false;
            var cross = Vector3.Cross(fromA, ab);
            float v = Vector3.Dot(direction, cross) / denominator;
            float distance = Vector3.Dot(ac, cross) / denominator;
            return v >= 0 && u + v <= 1 && distance > 1e-4f && distance < 1 - 1e-4f;
        }

        static bool Crosses(Triangle a, Triangle b) => a.box.Intersects(b.box) &&
            (SegmentHits(a.a, a.b, b) || SegmentHits(a.b, a.c, b) || SegmentHits(a.c, a.a, b) ||
             SegmentHits(b.a, b.b, a) || SegmentHits(b.b, b.c, a) || SegmentHits(b.c, b.a, a));

        internal static (GameObject surface, Mesh mesh, int triangles) Isolate(Vrm10Instance vrm)
        {
            using var hand = new Hand(vrm);
            return hand.Isolate();
        }

        internal static Evidence Fit(GameObject model, Transform marker, Vrm10Instance vrm, bool compareBaseline)
        {
            using var hand = new Hand(vrm);
            var parts = model.GetComponentsInChildren<MeshFilter>();
            var body = parts.Single(f => f.name == "BowBody");
            var bowString = parts.Single(f => f.name == "BowString");
            var markerLocal = model.transform.InverseTransformPoint(marker.position);
            Vector3[] Source(MeshFilter part) => part.sharedMesh.vertices.Select(p =>
                model.transform.InverseTransformPoint(part.transform.TransformPoint(p)) - markerLocal).ToArray();
            var source = Source(body);
            var faces = body.sharedMesh.triangles;
            var stringSource = Source(bowString);
            var stringFaces = bowString.sharedMesh.triangles;
            var band = source.Where(p => Mathf.Abs(p.y - RiserHeight) < .012f).ToArray();
            if (band.Length < 8) throw new InvalidDataException("Missing the measured grip surface below the ornament.");
            float halfKnuckleSpan = Vector3.Distance(hand.digits[0, 0].position, hand.digits[3, 0].position) / 2;
            float sampleHalfSpan = (halfKnuckleSpan + .004f) / model.transform.lossyScale.y;
            var contactBand = source.Where(p => Mathf.Abs(p.y - RiserHeight) < sampleHalfSpan && p.y < .010f).ToArray();
            var center = new Vector3((band.Max(v => v.x) + band.Min(v => v.x)) / 2, RiserHeight,
                (band.Max(v => v.z) + band.Min(v => v.z)) / 2);
            var initial = hand.Vertices();
            float palmDepth = hand.PalmDepth(initial);
            Vector3 World(Vector3 point) => model.transform.TransformPoint(point + markerLocal);
            Contact Measure(Vector3[] points, Triangle[] handMesh)
            {
                var riser = contactBand.Select(World).ToArray();
                var metrics = new Contact { nearestPalmToRiserSampleMeters = hand.PalmGap(points, riser),
                    nearestDistalToRiserSamplesMeters = hand.TipGaps(points, riser) };
                var window = new Bounds(hand.knuckles, Vector3.one * (hand.palmLength * 3));
                void Crossings(Vector3[] positions, int[] indices, bool isString)
                {
                    var posed = positions.Select(World).ToArray();
                    for (int i = 0; i < indices.Length; i += 3)
                    {
                        int a = indices[i], b = indices[i + 1], c = indices[i + 2];
                        var bowFace = new Triangle(posed[a], posed[b], posed[c]);
                        if (!bowFace.box.Intersects(window)) continue;
                        float y = (positions[a].y + positions[b].y + positions[c].y) / 3;
                        foreach (var handFace in handMesh)
                        {
                            if (!Crosses(bowFace, handFace)) continue;
                            if (isString) metrics.stringCrossings++;
                            else if (y >= .010f && y <= .105f) metrics.ornamentCrossings++;
                            switch (handFace.region)
                            {
                                case HandRegion.Wrist: metrics.wristCrossings++; break;
                                case HandRegion.Palm: metrics.palmCrossings++; break;
                                case HandRegion.Finger: metrics.fingerCrossings++; break;
                            }
                        }
                    }
                }
                Crossings(source, faces, false);
                Crossings(stringSource, stringFaces, true);
                return metrics;
            }

            var baseline = compareBaseline ? Measure(initial, hand.Surface(initial)) : null;
            model.transform.rotation = Quaternion.LookRotation(-hand.distal, hand.across);
            var modeledCenter = World(center);
            var offsetPoints = band.Select(p => World(p) - modeledCenter).ToArray();
            var palmarExtents = offsetPoints.Select(p => Vector3.Dot(p, hand.normal)).ToArray();
            float nearSide = palmarExtents.Min();
            (float score, float outward, float along, float curl, Vector3 center, Contact result) best =
                (float.PositiveInfinity, 0, 0, 0, Vector3.zero, null);
            foreach (float curl in new[] { 30f, 37f, 44f, 51f, 58f })
            {
                hand.Curl(curl);
                var points = hand.Vertices();
                var handMesh = hand.Surface(points);
                foreach (float along in new[] { -.007f, 0f, .007f })
                foreach (float outward in new[] { -.004f, 0f, .004f, .008f, .012f })
                {
                    var target = hand.palmCenter + hand.normal * (palmDepth - nearSide + outward) + hand.across * along;
                    model.transform.position += target - World(center);
                    var measure = Measure(points, handMesh);
                    float score = (measure.ornamentCrossings + measure.stringCrossings) * 10000 + measure.wristCrossings * 100 +
                        (measure.palmCrossings + measure.fingerCrossings) * .04f +
                        (measure.nearestDistalToRiserSamplesMeters.Sum() + measure.nearestPalmToRiserSampleMeters * 4) * 1000;
                    if (score < best.score) best = (score, outward, along, curl, target, measure);
                }
            }
            hand.Curl(best.curl);
            model.transform.position += best.center - World(center);
            return new Evidence { baseline = baseline, fitted = best.result, wrist = hand.wrist.position,
                knuckleCenter = hand.knuckles, palmNormal = hand.normal, riserAxis = model.transform.up,
                riserCenter = best.center, bowPlaneNormal = model.transform.right, gripMarker = marker.position,
                metacarpalSpanMeters = Vector3.Distance(hand.digits[0, 0].position, hand.digits[3, 0].position),
                handleOffsetAlongBowMeters = RiserHeight, outwardAdjustmentMeters = best.outward, fingerCurlDegrees = best.curl,
                placementAlongGripMeters = best.along,
                bowLengthMeters = (source.Max(p => p.y) - source.Min(p => p.y)) * model.transform.lossyScale.y,
                riserPlacementErrorMeters = Vector3.Distance(best.center, World(center)) };
        }
    }
}
