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
            public float nearestPalmToRiserSurfaceMeters;
            public float[] nearestDistalToRiserSurfaceMeters;
        }

        [Serializable] internal sealed class Evidence
        {
            public Contact baseline, fitted;
            public Vector3 wrist, knuckleCenter, palmNormal, riserCenter, riserAxis, bowPlaneNormal, gripMarker;
            public Vector3 bowSocketLocalPosition;
            public Quaternion bowSocketLocalRotation;
            public Quaternion[] fingerLocalRotations;
            public bool usesFixedSocketPose;
            public int isolatedHandTriangles;
            public float metacarpalSpanMeters, handleOffsetAlongBowMeters, outwardAdjustmentMeters, fingerCurlDegrees, riserPlacementErrorMeters;
            public float bowLengthMeters, placementAlongGripMeters, placementAheadOfPalmMeters, bowTiltDegrees;
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
            internal readonly float minY, maxY;

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
                minY = Mathf.Min(a.y, Mathf.Min(b.y, c.y));
                maxY = Mathf.Max(a.y, Mathf.Max(b.y, c.y));
            }

            internal float SqDistance(Vector3 point)
            {
                var ab = b - a;
                var ac = c - a;
                var normal = Vector3.Cross(ab, ac);
                var ap = point - a;
                float length = normal.sqrMagnitude;
                if (length > 1e-18f &&
                    Vector3.Dot(Vector3.Cross(ab, ap), normal) >= 0 &&
                    Vector3.Dot(Vector3.Cross(c - b, point - b), normal) >= 0 &&
                    Vector3.Dot(Vector3.Cross(-ac, point - c), normal) >= 0)
                {
                    float height = Vector3.Dot(ap, normal);
                    return height * height / length;
                }
                float Edge(Vector3 start, Vector3 delta)
                {
                    float span = delta.sqrMagnitude;
                    float position = span > 0 ? Mathf.Clamp01(Vector3.Dot(point - start, delta) / span) : 0;
                    return (point - start - delta * position).sqrMagnitude;
                }
                return Mathf.Min(Edge(a, ab), Mathf.Min(Edge(b, c - b), Edge(c, -ac)));
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
                new Triangle(points[t.a], points[t.b], points[t.c], t.region)).OrderBy(t => t.minY).ToArray();

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

            static float SurfaceGap(int[] selected, Vector3[] points, Triangle[] riser)
            {
                float best = float.PositiveInfinity;
                foreach (int index in selected)
                {
                    var point = points[index];
                    foreach (var face in riser)
                        if (face.box.SqrDistance(point) < best)
                            best = Mathf.Min(best, face.SqDistance(point));
                }
                return Mathf.Sqrt(best);
            }

            internal void MeasureSurface(Contact contact, Vector3[] points, Triangle[] riser)
            {
                contact.nearestPalmToRiserSurfaceMeters = SurfaceGap(palmIndices, points, riser);
                contact.nearestDistalToRiserSurfaceMeters = tipIndices.Select(indices => SurfaceGap(indices, points, riser)).ToArray();
            }

            internal void Restore()
            {
                for (int finger = 0; finger < 5; finger++)
                    for (int joint = 0; joint < 3; joint++)
                        digits[finger, joint].localRotation = original[finger, joint];
            }

            internal Quaternion[] LocalPose() => digits.Cast<Transform>().Select(t => t.localRotation).ToArray();

            internal void ApplyLocalPose(Quaternion[] rotations)
            {
                if (rotations == null || rotations.Length != digits.Length)
                    throw new InvalidDataException("Missing authored grip finger rotations.");
                int index = 0;
                foreach (var joint in digits) joint.localRotation = rotations[index++];
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

        internal static Evidence Fit(GameObject model, Transform marker, Vrm10Instance vrm, Evidence fixedPose = null)
        {
            using var hand = new Hand(vrm);
            var parts = model.GetComponentsInChildren<Renderer>();
            var body = parts.Single(r => r.name == "BowBody");
            var bowString = parts.Single(r => r.name == "BowString");
            Mesh RestMesh(Renderer renderer) => renderer is SkinnedMeshRenderer skin
                ? skin.sharedMesh : renderer.GetComponent<MeshFilter>().sharedMesh;
            var markerLocal = model.transform.InverseTransformPoint(marker.position);
            Vector3[] Source(Renderer part) => RestMesh(part).vertices.Select(p =>
                model.transform.InverseTransformPoint(part.transform.TransformPoint(p)) - markerLocal).ToArray();
            var source = Source(body);
            var faces = RestMesh(body).triangles;
            var stringSource = Source(bowString);
            var stringFaces = RestMesh(bowString).triangles;
            var band = source.Where(p => Mathf.Abs(p.y - RiserHeight) < .012f).ToArray();
            if (band.Length < 8) throw new InvalidDataException("Missing the measured grip surface below the ornament.");
            float halfKnuckleSpan = Vector3.Distance(hand.digits[0, 0].position, hand.digits[3, 0].position) / 2;
            float sampleHalfSpan = (halfKnuckleSpan + .004f) / model.transform.lossyScale.y;
            var contactBand = source.Where(p => Mathf.Abs(p.y - RiserHeight) < sampleHalfSpan && p.y < .010f).ToArray();
            var riserFaces = Enumerable.Range(0, faces.Length / 3).Select(i => (a: faces[i * 3], b: faces[i * 3 + 1], c: faces[i * 3 + 2]))
                .Where(t =>
                {
                    float y = (source[t.a].y + source[t.b].y + source[t.c].y) / 3;
                    return Mathf.Abs(y - RiserHeight) < sampleHalfSpan && y < .010f;
                }).ToArray();
            if (riserFaces.Length == 0) throw new InvalidDataException("The measured grip has no contact triangles.");
            var center = new Vector3((band.Max(v => v.x) + band.Min(v => v.x)) / 2, RiserHeight,
                (band.Max(v => v.z) + band.Min(v => v.z)) / 2);
            var initial = hand.Vertices();
            float palmDepth = hand.PalmDepth(initial);
            Vector3 World(Vector3 point) => model.transform.TransformPoint(point + markerLocal);
            var window = new Bounds(hand.knuckles, Vector3.one * (hand.palmLength * 3));
            void MeasureGaps(Contact metrics, Vector3[] points, Vector3[] posedBody, bool includeVertexSamples)
            {
                if (includeVertexSamples)
                {
                    var riser = contactBand.Select(World).ToArray();
                    metrics.nearestPalmToRiserSampleMeters = hand.PalmGap(points, riser);
                    metrics.nearestDistalToRiserSamplesMeters = hand.TipGaps(points, riser);
                }
                hand.MeasureSurface(metrics, points, riserFaces.Select(t => new Triangle(posedBody[t.a], posedBody[t.b], posedBody[t.c])).ToArray());
            }
            Contact MeasureCrossings(Triangle[] handMesh, Vector3[] posedBody)
            {
                var metrics = new Contact();
                void Crossings(Vector3[] positions, int[] indices, bool isString)
                {
                    var posed = isString ? positions.Select(World).ToArray() : posedBody;
                    for (int i = 0; i < indices.Length; i += 3)
                    {
                        int a = indices[i], b = indices[i + 1], c = indices[i + 2];
                        var bowFace = new Triangle(posed[a], posed[b], posed[c]);
                        if (!bowFace.box.Intersects(window)) continue;
                        float y = (positions[a].y + positions[b].y + positions[c].y) / 3;
                        foreach (var handFace in handMesh)
                        {
                            if (handFace.minY > bowFace.maxY) break;
                            if (handFace.maxY < bowFace.minY || !Crosses(bowFace, handFace)) continue;
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

            Vector3 Target(float outward, float along, float ahead)
            {
                var modeledCenter = World(center);
                float nearSide = band.Min(p => Vector3.Dot(World(p) - modeledCenter, hand.normal));
                return hand.palmCenter + hand.normal * (palmDepth - nearSide + outward) + hand.across * along + hand.distal * ahead;
            }
            Evidence Report(Contact baseline, Contact chosen, float outward, float along, float ahead, float curl, float tilt, Vector3 target)
            {
                return new Evidence
                {
                    baseline = baseline, fitted = chosen, wrist = hand.wrist.position,
                    knuckleCenter = hand.knuckles, palmNormal = hand.normal, riserAxis = model.transform.up,
                    riserCenter = World(center), bowPlaneNormal = model.transform.right, gripMarker = marker.position,
                    bowSocketLocalPosition = model.transform.localPosition, bowSocketLocalRotation = model.transform.localRotation,
                    fingerLocalRotations = hand.LocalPose(), usesFixedSocketPose = fixedPose != null,
                    metacarpalSpanMeters = halfKnuckleSpan * 2,
                    handleOffsetAlongBowMeters = RiserHeight, outwardAdjustmentMeters = outward, fingerCurlDegrees = curl,
                    placementAlongGripMeters = along, placementAheadOfPalmMeters = ahead, bowTiltDegrees = tilt,
                    bowLengthMeters = (source.Max(p => p.y) - source.Min(p => p.y)) * model.transform.lossyScale.y,
                    riserPlacementErrorMeters = Vector3.Distance(target, World(center)),
                };
            }
            if (fixedPose != null)
            {
                model.transform.SetLocalPositionAndRotation(fixedPose.bowSocketLocalPosition, fixedPose.bowSocketLocalRotation);
                hand.ApplyLocalPose(fixedPose.fingerLocalRotations);
                var points = hand.Vertices();
                var posedBody = source.Select(World).ToArray();
                var contact = MeasureCrossings(hand.Surface(points), posedBody);
                MeasureGaps(contact, points, posedBody, true);
                return Report(null, contact, fixedPose.outwardAdjustmentMeters, fixedPose.placementAlongGripMeters,
                    fixedPose.placementAheadOfPalmMeters, fixedPose.fingerCurlDegrees, fixedPose.bowTiltDegrees,
                    Target(fixedPose.outwardAdjustmentMeters, fixedPose.placementAlongGripMeters, fixedPose.placementAheadOfPalmMeters));
            }

            var initialBody = source.Select(World).ToArray();
            var baseline = MeasureCrossings(hand.Surface(initial), initialBody);
            MeasureGaps(baseline, initial, initialBody, true);
            var gripRotation = Quaternion.LookRotation(-hand.distal, hand.across);
            (float score, float outward, float along, float ahead, float curl, float tilt, Vector3 center, Contact result) best =
                (float.PositiveInfinity, 0, 0, 0, 0, 0, Vector3.zero, null);
            void Consider(Vector3[] points, Triangle[] handMesh, float curl, float along, float outward, float ahead, float tilt)
            {
                model.transform.rotation = Quaternion.AngleAxis(tilt, hand.normal) * gripRotation;
                var target = Target(outward, along, ahead);
                model.transform.position += target - World(center);
                var posedBody = source.Select(World).ToArray();
                var measure = MeasureCrossings(handMesh, posedBody);
                float crossingScore = (measure.ornamentCrossings + measure.stringCrossings) * 10000 + measure.wristCrossings * 9 +
                    measure.palmCrossings * 1.25f + measure.fingerCrossings * .65f;
                if (crossingScore >= best.score) return;
                MeasureGaps(measure, points, posedBody, false);
                // Keep contact in the palm and at every fingertip while favoring fewer surface crossings.
                float palmGap = measure.nearestPalmToRiserSurfaceMeters;
                float[] tipGaps = measure.nearestDistalToRiserSurfaceMeters;
                float score = crossingScore + (tipGaps.Sum() + palmGap * 4) * 9000 +
                    Mathf.Max(0, palmGap - .004f) * 400000 + Mathf.Max(0, tipGaps.Max() - .008f) * 250000;
                if (score < best.score) best = (score, outward, along, ahead, curl, tilt, target, measure);
            }
            foreach (float curl in new[] { 30f, 37f, 44f, 51f, 58f })
            {
                hand.Curl(curl);
                var points = hand.Vertices();
                var handMesh = hand.Surface(points);
                foreach (float along in new[] { -.007f, 0f, .007f, .012f, .017f, .022f })
                foreach (float outward in new[] { 0f, .004f, .008f, .012f, .016f })
                foreach (float tilt in new[] { -8f, 0f, 8f })
                    Consider(points, handMesh, curl, along, outward, 0, tilt);
            }
            var coarse = best;
            foreach (float curl in new[] { coarse.curl - 3f, coarse.curl, coarse.curl + 3f })
            {
                hand.Curl(curl);
                var points = hand.Vertices();
                var handMesh = hand.Surface(points);
                foreach (float along in new[] { coarse.along - .0025f, coarse.along, coarse.along + .0025f })
                foreach (float outward in new[] { coarse.outward - .002f, coarse.outward, coarse.outward + .002f })
                foreach (float ahead in new[] { -.004f, 0f, .004f, .008f })
                foreach (float tilt in new[] { coarse.tilt - 3f, coarse.tilt, coarse.tilt + 3f })
                    Consider(points, handMesh, curl, along, outward, ahead, tilt);
            }
            hand.Curl(best.curl);
            model.transform.rotation = Quaternion.AngleAxis(best.tilt, hand.normal) * gripRotation;
            model.transform.position += best.center - World(center);
            MeasureGaps(best.result, hand.Vertices(), source.Select(World).ToArray(), true);
            return Report(baseline, best.result, best.outward, best.along, best.ahead, best.curl, best.tilt, best.center);
        }
    }
}
