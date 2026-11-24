using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Aetheria.Icarus
{
    public enum IcarusPresentationMode
    {
        Normal,
        Reduced,
        Off
    }

    // This is an adapter DTO for a future validated transport snapshot.
    // The current native client has no FIRE_ZONE DTO or event bridge, so no
    // network caller is wired to this component.
    public readonly struct IcarusFireZoneSnapshot
    {
        public const int BoardSize = 10;
        public const int ZoneSide = 4;
        public const int DurationTurns = 2;

        public readonly long Revision;
        public readonly int Turn;
        public readonly bool HasZone;
        public readonly int Column;
        public readonly int Row;
        public readonly int FirstTurn;

        private IcarusFireZoneSnapshot(long revision, int turn, bool hasZone, int column, int row, int firstTurn)
        {
            Revision = revision;
            Turn = turn;
            HasZone = hasZone;
            Column = column;
            Row = row;
            FirstTurn = firstTurn;
        }

        public static bool TryCreate(long revision, int turn, bool hasZone, int column, int row, int firstTurn,
            out IcarusFireZoneSnapshot snapshot)
        {
            snapshot = default;
            if (revision < 0 || turn < 0 || (hasZone && (
                    column < 0 || column > BoardSize - ZoneSide ||
                    row < 0 || row > BoardSize - ZoneSide ||
                    firstTurn < 0 || turn < firstTurn ||
                    turn - firstTurn >= DurationTurns)))
                return false;
            snapshot = new IcarusFireZoneSnapshot(revision, turn, hasZone, column, row, firstTurn);
            return true;
        }

        public bool Contains(int column, int row) =>
            HasZone && column >= Column && column < Column + ZoneSide &&
            row >= Row && row < Row + ZoneSide;
    }

    [DisallowMultipleComponent, RequireComponent(typeof(IcarusSignaturePresentation))]
    public sealed class IcarusFireZonePresentation : MonoBehaviour
    {
        private static readonly int BaseColor = Shader.PropertyToID("_BaseColor");
        private static readonly int ColorId = Shader.PropertyToID("_Color");
        private static readonly int Surface = Shader.PropertyToID("_Surface");
        private static readonly int Blend = Shader.PropertyToID("_Blend");
        private static readonly int SrcBlend = Shader.PropertyToID("_SrcBlend");
        private static readonly int DstBlend = Shader.PropertyToID("_DstBlend");
        private static readonly int ZWrite = Shader.PropertyToID("_ZWrite");

        [SerializeField] private Transform boardRoot;
        [SerializeField, Min(.01f)] private float cellSize = 1f;
        [SerializeField] private Vector3 boardOrigin;
        [SerializeField] private Material decalMaterial;
        [SerializeField] private Color decalColor = new Color(1f, .32f, .08f, .48f);
        [SerializeField] private Color particleColor = new Color(1f, .48f, .08f, 1f);
        [SerializeField] private IcarusPresentationMode mode = IcarusPresentationMode.Reduced;

        private IcarusSignaturePresentation signature;
        private MeshFilter decalMeshFilter;
        private MeshRenderer decalRenderer;
        private Mesh decalMesh;
        private Material runtimeMaterial;
        private Transform[] emberParticles;
        private bool firePlaying;
        private float fireTime;
        private long revision = -1;
        private int turn = -1;
        private bool hasActiveZone;

        public bool HasActiveZone => hasActiveZone;
        public int ActiveColumn { get; private set; } = -1;
        public int ActiveRow { get; private set; } = -1;
        public IcarusPresentationMode Mode => mode;

        private void Awake()
        {
            signature = GetComponent<IcarusSignaturePresentation>();
            EnsureDecal();
            EnsureEmbers();
            ClearVisuals();
        }

        public void SetPresentationMode(IcarusPresentationMode value)
        {
            mode = value;
            if (mode == IcarusPresentationMode.Off)
            {
                StopPhoenixFire();
                signature.EndSignature();
            }
            else if (mode == IcarusPresentationMode.Reduced)
            {
                StopPhoenixFire();
            }
            ApplyDecalVisibility();
        }

        // Invoke after receipt/scope/version validation by an eventual event bridge.
        public bool ApplyValidatedSnapshot(IcarusFireZoneSnapshot snapshot)
        {
            if (snapshot.Revision <= revision || snapshot.Turn < turn) return false;
            revision = snapshot.Revision;
            turn = snapshot.Turn;
            hasActiveZone = snapshot.HasZone;
            ActiveColumn = snapshot.HasZone ? snapshot.Column : -1;
            ActiveRow = snapshot.HasZone ? snapshot.Row : -1;
            RebuildDecal(snapshot);
            if (!hasActiveZone) StopPhoenixFire();
            return true;
        }

        private void Update()
        {
            if (!firePlaying || emberParticles == null) return;
            fireTime += Time.unscaledDeltaTime;
            for (var i = 0; i < emberParticles.Length; i++)
            {
                var ember = emberParticles[i];
                var phase = fireTime * (1.4f + (i % 4) * .22f) + i * 1.71f;
                var height = Mathf.Repeat(phase * .25f, 1f);
                var radius = .08f + (i % 3) * .04f;
                ember.localPosition = new Vector3(
                    Mathf.Sin(phase) * radius,
                    height * .95f,
                    Mathf.Cos(phase * .73f) * radius);
                var scale = (.035f + (i % 3) * .012f) * (1f - height * .35f);
                ember.localScale = Vector3.one * scale;
            }
        }

        public bool BeginSignature(string petId, string opcode)
        {
            if (mode == IcarusPresentationMode.Off || !hasActiveZone ||
                !signature.BeginSignature(petId, opcode))
                return false;
            if (mode == IcarusPresentationMode.Normal) PlayPhoenixFire();
            return true;
        }

        public void EndSignature()
        {
            StopPhoenixFire();
            signature.EndSignature();
        }

        private void EnsureDecal()
        {
            var decal = new GameObject("FIRE_ZONE board decal", typeof(MeshFilter), typeof(MeshRenderer));
            decal.transform.SetParent(boardRoot != null ? boardRoot : transform, false);
            decal.transform.localPosition = boardOrigin;
            decalMeshFilter = decal.GetComponent<MeshFilter>();
            decalRenderer = decal.GetComponent<MeshRenderer>();
            decalRenderer.shadowCastingMode = ShadowCastingMode.Off;
            decalRenderer.receiveShadows = false;
            decalRenderer.sortingOrder = 4;
            decalMesh = new Mesh { name = "FIRE_ZONE 4x4 decal" };
            decalMeshFilter.sharedMesh = decalMesh;
            runtimeMaterial = decalMaterial != null ? new Material(decalMaterial) : CreateDecalMaterial();
            decalRenderer.sharedMaterial = runtimeMaterial;
            ApplyColor(runtimeMaterial, decalColor);
        }

        private Material CreateDecalMaterial()
        {
            var shader = Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Sprites/Default");
            return shader == null ? null : new Material(shader) { name = "Icarus FIRE_ZONE runtime decal" };
        }

        private void EnsureEmbers()
        {
            emberParticles = new Transform[16];
            for (var i = 0; i < emberParticles.Length; i++)
            {
                var ember = GameObject.CreatePrimitive(PrimitiveType.Quad);
                ember.name = "Phoenix ember " + i;
                ember.transform.SetParent(transform, false);
                var collider = ember.GetComponent<Collider>();
                if (collider != null) Destroy(collider);
                var renderer = ember.GetComponent<MeshRenderer>();
                renderer.shadowCastingMode = ShadowCastingMode.Off;
                renderer.receiveShadows = false;
                renderer.sharedMaterial = runtimeMaterial;
                renderer.enabled = false;
                emberParticles[i] = ember.transform;
            }
        }

        private void RebuildDecal(IcarusFireZoneSnapshot snapshot)
        {
            decalMesh.Clear();
            if (!snapshot.HasZone)
            {
                ApplyDecalVisibility();
                return;
            }

            var vertices = new List<Vector3>(64);
            var colors = new List<Color>(64);
            var triangles = new List<int>(96);
            for (var row = snapshot.Row; row < snapshot.Row + IcarusFireZoneSnapshot.ZoneSide; row++)
                for (var column = snapshot.Column; column < snapshot.Column + IcarusFireZoneSnapshot.ZoneSide; column++)
                {
                    var index = vertices.Count;
                    var center = new Vector3((column + .5f) * cellSize, .015f, (row + .5f) * cellSize);
                    var half = cellSize * .45f;
                    vertices.Add(center + new Vector3(-half, 0, -half));
                    vertices.Add(center + new Vector3(-half, 0, half));
                    vertices.Add(center + new Vector3(half, 0, half));
                    vertices.Add(center + new Vector3(half, 0, -half));
                    for (var i = 0; i < 4; i++) colors.Add(decalColor);
                    triangles.Add(index); triangles.Add(index + 1); triangles.Add(index + 2);
                    triangles.Add(index); triangles.Add(index + 2); triangles.Add(index + 3);
                }
            decalMesh.SetVertices(vertices);
            decalMesh.SetColors(colors);
            decalMesh.SetTriangles(triangles, 0);
            decalMesh.RecalculateBounds();
            ApplyDecalVisibility();
        }

        private void ApplyDecalVisibility()
        {
            if (decalRenderer != null) decalRenderer.enabled = hasActiveZone && mode != IcarusPresentationMode.Off;
        }

        private void PlayPhoenixFire()
        {
            if (emberParticles == null) return;
            firePlaying = true;
            fireTime = 0;
            var center = hasActiveZone
                ? new Vector3((ActiveColumn + 2f) * cellSize, .08f, (ActiveRow + 2f) * cellSize)
                : Vector3.zero;
            for (var i = 0; i < emberParticles.Length; i++)
            {
                emberParticles[i].localPosition = center;
                emberParticles[i].GetComponent<MeshRenderer>().enabled = true;
            }
        }

        private void StopPhoenixFire()
        {
            firePlaying = false;
            fireTime = 0;
            if (emberParticles == null) return;
            for (var i = 0; i < emberParticles.Length; i++)
                if (emberParticles[i] != null) emberParticles[i].GetComponent<MeshRenderer>().enabled = false;
        }

        private void ClearVisuals()
        {
            decalMesh.Clear();
            hasActiveZone = false;
            ApplyDecalVisibility();
            StopPhoenixFire();
        }

        private static void ApplyColor(Material material, Color value)
        {
            if (material == null) return;
            if (material.HasProperty(BaseColor)) material.SetColor(BaseColor, value);
            if (material.HasProperty(ColorId)) material.SetColor(ColorId, value);
            if (material.HasProperty(Surface)) material.SetFloat(Surface, 1);
            if (material.HasProperty(Blend)) material.SetFloat(Blend, 0);
            if (material.HasProperty(SrcBlend)) material.SetFloat(SrcBlend, (float)BlendMode.SrcAlpha);
            if (material.HasProperty(DstBlend)) material.SetFloat(DstBlend, (float)BlendMode.OneMinusSrcAlpha);
            if (material.HasProperty(ZWrite)) material.SetFloat(ZWrite, 0);
            material.renderQueue = 3000;
        }

        private void OnDestroy()
        {
            if (runtimeMaterial != null) Destroy(runtimeMaterial);
            if (decalMesh != null) Destroy(decalMesh);
        }
    }
}
