using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Aetheria.Icarus;
using UniVRM10;
using UnityEditor;
using UnityEngine;

namespace Aetheria.Editor
{
    // Private review of the existing rigid GLB accessories and gameplay
    // presentation controllers. No accessory asset is modified.
    internal sealed class IcarusAccessoryReview
    {
        private readonly Camera camera;
        private readonly IcarusSignaturePresentation signature;
        private readonly IcarusWingController wings;
        private readonly IcarusBowString bowString;
        private readonly LineRenderer stringLine;
        private readonly Transform bowSocket, wingSocket, bow, wingMesh, upper, lower;
        private readonly Renderer[] bowRenderers, wingRenderers;
        private readonly Vector3 bowStart, wingStart;
        private readonly Facts facts;
        private const double RevealAfterSeconds = .15;

        [Serializable]
        internal sealed class Facts
        {
            public string sourceCue, bowParent, wingParent, geometryMode, bowAssetSha256, wingAssetSha256;
            public int bowMeshes, wingMeshes, bowVertices, wingVertices, intermediateRevealSamples, visibleSamples;
            public double revealTimelineSeconds;
            public float bowTravelMeters, wingTravelMeters, maxStringEndpointErrorMeters, maxSocketErrorMeters;
            public bool hiddenBeforeCue, hiddenAfterCue;
        }

        internal IcarusAccessoryReview(Vrm10Instance vrm, Camera camera, double takeStart)
        {
            this.camera = camera;
            signature = vrm.GetComponent<IcarusSignaturePresentation>();
            wings = vrm.GetComponent<IcarusWingController>();
            bowString = vrm.GetComponent<IcarusBowString>();
            stringLine = vrm.GetComponent<LineRenderer>();
            Require(signature != null && wings != null && bowString != null && stringLine != null,
                "Icarus accessory recording requires the existing model presentation controllers.");
            bowSocket = Named(vrm, "Socket_Bow");
            wingSocket = Named(vrm, "Socket_Wings");
            bow = bowSocket.Find("Icarus_Bow");
            wingMesh = wingSocket.Find("Icarus_Wings");
            upper = Named(vrm, "Socket_BowString_Top");
            lower = Named(vrm, "Socket_BowString_Bottom");

            Require(vrm.TryGetBoneTransform(HumanBodyBones.RightHand, out var wrist) && bowSocket.parent == wrist,
                "The bow lost its mapped wrist attachment.");
            Require(vrm.TryGetBoneTransform(HumanBodyBones.UpperChest, out var chest) && wingSocket.parent == chest,
                "The wings lost their mapped upper chest attachment.");
            Require(upper.parent == bowSocket && lower.parent == bowSocket,
                "The bowstring endpoints must be mounted on the bow socket.");
            Require(bow != null && wingMesh != null, "A named socket exists without the actual accessory GLB.");
            bowRenderers = Geometry(bow);
            wingRenderers = Geometry(wingMesh);
            Require(bowRenderers.Concat(wingRenderers).All(renderer => renderer is MeshRenderer),
                "This rigid attachment review requires the imported unskinned accessory meshes.");
            bowStart = bow.position;
            wingStart = wingMesh.position;
            facts = new Facts {
                sourceCue = IcarusSignaturePresentation.Opcode,
                geometryMode = "Rigid accessory meshes attached to animated bones",
                bowParent = wrist.name, wingParent = chest.name,
                bowMeshes = bowRenderers.Length, wingMeshes = wingRenderers.Length,
                bowAssetSha256 = HashSource(bowRenderers, "Icarus_Bow.glb"),
                wingAssetSha256 = HashSource(wingRenderers, "Icarus_Wings.glb"),
                bowVertices = Vertices(bowRenderers), wingVertices = Vertices(wingRenderers),
                hiddenBeforeCue = !wingSocket.gameObject.activeSelf && !wings.WingsRequested && !bowString.IsVisible,
                revealTimelineSeconds = takeStart + RevealAfterSeconds,
            };
            Require(facts.hiddenBeforeCue, "Wings and string must start hidden before the showcase cue.");
            wings.SetReducedMotion(false);
        }

        internal static Bounds Frame(Vrm10Instance vrm, Bounds bounds)
        {
            var wingSocket = Named(vrm, "Socket_Wings");
            bool prior = wingSocket.gameObject.activeSelf;
            try
            {
                wingSocket.gameObject.SetActive(true);
                var bow = Named(vrm, "Socket_Bow").Find("Icarus_Bow");
                var wings = wingSocket.Find("Icarus_Wings");
                Require(bow != null && wings != null, "Accessory staging requires the existing bow and wing imports.");
                foreach (var renderer in Geometry(bow).Concat(Geometry(wings))) bounds.Encapsulate(renderer.bounds);
                return bounds;
            }
            finally { wingSocket.gameObject.SetActive(prior); }
        }

        internal void Observe(double time, double elapsed)
        {
            if (elapsed < RevealAfterSeconds) return;
            if (!wings.WingsRequested)
            {
                Require(signature.BeginSignature(IcarusSignaturePresentation.PetId, IcarusSignaturePresentation.Opcode),
                    "The model rejected the existing Icarus signature presentation cue.");
                facts.revealTimelineSeconds = time;
                return;
            }
            float wingScale = wingSocket.localScale.x;
            if (wingScale > .01f && wingScale < .98f) facts.intermediateRevealSamples++;
            if (!wingSocket.gameObject.activeInHierarchy || !bowString.IsVisible) return;

            facts.bowTravelMeters = Mathf.Max(facts.bowTravelMeters, Vector3.Distance(bowStart, bow.position));
            facts.wingTravelMeters = Mathf.Max(facts.wingTravelMeters, Vector3.Distance(wingStart, wingMesh.position));
            facts.maxSocketErrorMeters = Mathf.Max(facts.maxSocketErrorMeters,
                Vector3.Distance(bow.position, bowSocket.position), Vector3.Distance(wingMesh.position, wingSocket.position));
            facts.maxStringEndpointErrorMeters = Mathf.Max(facts.maxStringEndpointErrorMeters,
                Vector3.Distance(stringLine.GetPosition(0), upper.position),
                Vector3.Distance(stringLine.GetPosition(1), lower.position));
            if (wingScale >= .98f && bowRenderers.Any(InFrame) && wingRenderers.Any(InFrame)) facts.visibleSamples++;
        }

        internal Facts Complete()
        {
            Require(facts.intermediateRevealSamples > 0 && facts.visibleSamples > 0,
                "The existing wing reveal did not animate and reach the recorded framing.");
            Require(facts.bowTravelMeters > .001f && facts.wingTravelMeters > .001f &&
                facts.maxSocketErrorMeters < .002f && facts.maxStringEndpointErrorMeters < .025f,
                "Accessory attachment or bowstring endpoint measurements exceeded their tolerances.");
            Stop();
            facts.hiddenAfterCue = !wingSocket.gameObject.activeSelf && !wings.WingsRequested && !bowString.IsVisible;
            Require(facts.hiddenAfterCue, "Ending the review cue did not hide the temporary signature elements.");
            return facts;
        }

        internal void Stop()
        {
            wings.SetReducedMotion(true);
            signature.EndSignature();
        }

        private bool InFrame(Renderer renderer)
        {
            var point = camera.WorldToViewportPoint(renderer.bounds.center);
            return renderer.enabled && renderer.gameObject.activeInHierarchy && point.z > 0 &&
                point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1;
        }

        private static Transform Named(Vrm10Instance vrm, string name) =>
            vrm.GetComponentsInChildren<Transform>(true).Single(node => node.name == name);

        private static Renderer[] Geometry(Transform root)
        {
            var renderers = root.GetComponentsInChildren<Renderer>(true)
                .Where(renderer => renderer.GetComponent<MeshFilter>()?.sharedMesh != null ||
                    renderer is SkinnedMeshRenderer skin && skin.sharedMesh != null).ToArray();
            Require(renderers.Length > 0, root.name + " has no imported renderable geometry.");
            return renderers;
        }

        private static int Vertices(Renderer[] renderers) =>
            renderers.Sum(renderer => renderer.GetComponent<MeshFilter>().sharedMesh.vertexCount);

        private static string HashSource(Renderer[] renderers, string name)
        {
            var paths = renderers.Select(renderer => AssetDatabase.GetAssetPath(renderer.GetComponent<MeshFilter>().sharedMesh))
                .Distinct(StringComparer.Ordinal).ToArray();
            Require(paths.Length == 1 && Path.GetFileName(paths[0]) == name, "The recorded geometry is not the admitted " + name);
            string root = Path.GetDirectoryName(Application.dataPath);
            using var input = File.OpenRead(Path.Combine(root, paths[0]));
            using var sha256 = SHA256.Create();
            return BitConverter.ToString(sha256.ComputeHash(input)).Replace("-", "").ToLowerInvariant();
        }

        private static void Require(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException(message);
        }
    }
}
