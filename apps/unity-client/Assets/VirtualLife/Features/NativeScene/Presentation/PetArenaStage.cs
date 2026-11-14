using System.Collections.Generic;
using UnityEngine;
using VirtualLife.Networking;

namespace VirtualLife.NativeScene
{
    // Original code-authored developer figures, no imported media. Decorative
    // primitives have no colliders and never affect authoritative navigation.
    public sealed class PetArenaStage : MonoBehaviour
    {
        private readonly List<GameObject> figures = new List<GameObject>();
        private readonly HashSet<string> seen = new HashSet<string>();
        private readonly Queue<string> order = new Queue<string>();
        private float pulse;
        private bool reducedMotion = true;
        public int ReceiptEventCount { get; private set; }
        public bool OptionalPulseActive => !reducedMotion && pulse > 0;
        private void Awake()
        {
            for (var pet = 0; pet < 3; pet++) {
                var root = new GameObject(new[] {"Cinder developer figure", "Brook developer figure", "Briar developer figure"}[pet]);
                root.transform.position = new Vector3(7 + pet * 2, 1.25f, 10.5f); figures.Add(root);
                var color = new[] {new Color(.95f, .4f, .17f), new Color(.2f, .7f, .95f), new Color(.4f, .8f, .3f)}[pet];
                var body = Part(root.transform, PrimitiveType.Sphere, Vector3.zero, new Vector3(.9f, 1.05f, .8f), color);
                var detail = new List<Renderer>();
                for (var side = -1; side <= 1; side += 2) {
                    detail.Add(Part(root.transform, pet == 1 ? PrimitiveType.Sphere : PrimitiveType.Capsule, new Vector3(side * .28f, .55f, 0), new Vector3(.18f, pet == 1 ? .25f : .3f, .18f), color));
                    detail.Add(Part(root.transform, PrimitiveType.Sphere, new Vector3(side * .19f, .13f, -.36f), Vector3.one * .1f, Color.black));
                }
                detail.Add(Part(root.transform, PrimitiveType.Capsule, new Vector3(.42f, -.2f, .24f), new Vector3(.18f, .3f, .18f), color));
                var all = new List<Renderer>(detail) {body};
                var lod = root.AddComponent<LODGroup>();
                lod.SetLODs(new[] {new LOD(.12f, all.ToArray()), new LOD(.01f, new[] {body})}); lod.RecalculateBounds();
            }
        }
        private static Renderer Part(Transform root, PrimitiveType type, Vector3 at, Vector3 scale, Color color)
        {
            var part = GameObject.CreatePrimitive(type); part.transform.SetParent(root, false);
            part.transform.localPosition = at; part.transform.localScale = scale; Destroy(part.GetComponent<Collider>());
            var renderer = part.GetComponent<Renderer>(); renderer.sharedMaterial = Resources.Load<Material>("BlockoutLit");
            var properties = new MaterialPropertyBlock(); properties.SetColor("_BaseColor", color); renderer.SetPropertyBlock(properties); return renderer;
        }
        public void Present(PetArenaView view, string receiptId, bool reduced)
        {
            SetReducedMotion(reduced);
            if (receiptId == null || !seen.Add(receiptId)) return;
            ReceiptEventCount++;
            order.Enqueue(receiptId); if (order.Count > 61) seen.Remove(order.Dequeue());
            if (!reducedMotion) pulse = .2f;
        }
        public void SetReducedMotion(bool value) { reducedMotion = value; if (value) pulse = 0; }
        public void Clear() { seen.Clear(); order.Clear(); ReceiptEventCount = 0; pulse = 0; }
        private void Update()
        {
            pulse = Mathf.Max(0, pulse - Time.unscaledDeltaTime);
            foreach (var figure in figures) if (figure != null) figure.transform.localScale = Vector3.one * (1 + (reducedMotion ? 0 : pulse * .3f));
        }
        private void OnDestroy() { foreach (var figure in figures) if (figure != null) Destroy(figure); }
    }
}
