using System;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace Aetheria.IcarusPrototype
{
    public sealed class IcarusPreview : MonoBehaviour
    {
        [SerializeField] private GameObject studyPrefab;
        [SerializeField] private Shader effectsShader;

        private const float ToolbarHeight = 112f;
        private static readonly Vector3 Stage = new Vector3(-1.9f, 0, 4.5f);
        // Playback of three complete fixture snapshots from a single board session.
        private static readonly FireZone FixtureZone = new FireZone(3, 4, 40);
        private static readonly (long revision, int turn, FireZone? zone)[] Snapshots = {
            (100, 40, FixtureZone), (101, 41, FixtureZone), (102, 42, null)
        };
        private static readonly string[] States = { "idle", "intro", "normal", "rage", "signature" };

        private PreviewMeshes meshes;
        private MeshRenderer marker;
        private Mesh markerMesh;
        private IcarusEffects effects;
        private FireZoneProjection projection;
        private Camera view;
        private Animator animator;
        private Transform bow;
        private int snapshot;
        private float idleAt = float.PositiveInfinity;
        private MotionMode motion = MotionMode.Reduced;

        public void Configure(GameObject model, Shader shader)
        {
            studyPrefab = model;
            effectsShader = shader;
        }

        private void Start() => Initialize();

        public void Initialize()
        {
            if (meshes != null) return;
            if (GraphicsSettings.currentRenderPipeline == null || studyPrefab == null || effectsShader == null)
                throw new InvalidOperationException("Pinned URP and Icarus review assets are required.");

            meshes = new PreviewMeshes(effectsShader);
            var board = meshes.Material("Tile identities", Color.white, 4);
            meshes.Surface(transform, "10 x 10 board", board, 0, out var boardMesh);
            PreviewMeshes.PaintBoard(boardMesh);
            var foot = meshes.Material("Summon dais", new Color(.62f, .40f, .25f, .85f), 1);
            meshes.Surface(transform, "Icarus dais", foot, 1, out var dais);
            PreviewMeshes.PaintQuad(dais, Stage + Vector3.up * .01f, 1.55f);
            var warning = meshes.Material("Enemy telegraph", new Color(1, .43f, .63f, .94f), 3);
            meshes.Surface(transform, "Enemy telegraph", warning, 3, out var telegraph);
            PreviewMeshes.PaintQuad(telegraph, PreviewMeshes.CellCenter(6, 6) + Vector3.up * .035f, .36f);
            var glyph = meshes.Material("Authoritative zone glyph", new Color(1, .73f, .30f, .97f), 3);
            marker = meshes.Surface(transform, FireZone.Opcode, glyph, 2, out markerMesh);
            effects = new IcarusEffects(transform, meshes);

            var model = Instantiate(studyPrefab, Stage, Quaternion.identity, transform);
            animator = model.GetComponent<Animator>();
            bow = model.GetComponentsInChildren<Transform>(true).Single(node => node.name == "hand.R");
            if (animator == null || animator.runtimeAnimatorController == null || animator.applyRootMotion)
                throw new InvalidOperationException("The review Animator must have its controller and root motion disabled.");
            animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;

            var key = new GameObject("Key light", typeof(Light));
            key.transform.SetParent(transform, false);
            key.transform.rotation = Quaternion.Euler(45, -35, 0);
            var light = key.GetComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(1, .91f, .81f);
            light.intensity = 1.15f;

            var cameraObject = new GameObject("URP preview camera", typeof(Camera));
            cameraObject.transform.SetParent(transform, false);
            cameraObject.transform.position = new Vector3(3.55f, 13.5f, -9.5f);
            cameraObject.transform.LookAt(new Vector3(3.55f, 0, 4.75f));
            view = cameraObject.GetComponent<Camera>();
            view.orthographic = true;
            view.clearFlags = CameraClearFlags.SolidColor;
            view.backgroundColor = new Color(.045f, .066f, .085f);
            view.allowHDR = false;
            FrameBoard();
            ResetReplay();
        }

        public void ResetReplay()
        {
            projection = new FireZoneProjection();
            snapshot = 0;
            ApplySnapshot();
            effects.Stop();
            SetIdle();
        }

        public void NextSnapshot()
        {
            if (snapshot >= Snapshots.Length - 1) return;
            snapshot++;
            ApplySnapshot();
            if (!projection.ActiveZone.HasValue)
            {
                effects.Stop();
                SetIdle();
            }
        }

        public void SetMotion(MotionMode mode)
        {
            motion = mode;
            effects.Stop();
            SetIdle();
        }

        private void ApplySnapshot()
        {
            var (revision, turn, zone) = Snapshots[snapshot];
            if (!projection.Apply(revision, turn, zone)) return;
            marker.enabled = projection.ActiveZone.HasValue;
            if (projection.ActiveZone is FireZone active) PreviewMeshes.PaintZone(markerMesh, active);
        }

        private void SetIdle()
        {
            idleAt = float.PositiveInfinity;
            if (!Application.isPlaying) return;
            animator.SetInteger("Action", 0);
            animator.Play("Base Layer." + States[0], 0, 0);
            animator.speed = motion == MotionMode.Off ? 0 : motion == MotionMode.Reduced ? .65f : 1f;
            if (motion == MotionMode.Off) animator.Update(0);
        }

        private void PlayCue(Cue cue)
        {
            if (motion == MotionMode.Off || (cue == Cue.Signature && !projection.ActiveZone.HasValue)) return;
            int action = (int)cue + 1;
            animator.SetInteger("Action", action);
            animator.Play("Base Layer." + States[action], 0, 0);
            animator.Update(0);
            idleAt = Time.unscaledTime + (motion == MotionMode.Reduced ? 2.3f : 1.65f);
            Vector3 target = PreviewMeshes.CellCenter(3, 4);
            if (cue == Cue.Signature && projection.ActiveZone is FireZone zone)
                target = new Vector3(zone.Column + FireZone.Side * .5f, 0, zone.Row + FireZone.Side * .5f);
            effects.Play(cue, motion, bow.position, Stage, target);
        }

        private void FrameBoard()
        {
            float fraction = 1 - Mathf.Min(.4f, ToolbarHeight / Mathf.Max(1, Screen.height));
            view.rect = new Rect(0, 0, 1, fraction);
            view.orthographicSize = Mathf.Max(5.1f, 7.9f / Mathf.Max(.1f, view.aspect));
        }

        private void Update()
        {
            FrameBoard();
            effects.Tick(Time.unscaledDeltaTime);
            if (Time.unscaledTime >= idleAt) SetIdle();
        }

        private void OnGUI()
        {
            if (projection == null) return;
            GUILayout.BeginArea(new Rect(16, 12, Mathf.Clamp(Screen.width - 32, 1, 465), ToolbarHeight - 12));
            GUILayout.Label($"Aetheria: SoulBound | Icarus | Fixture turn {projection.Turn} | FIRE_ZONE {projection.TurnsRemaining}/2");
            GUILayout.BeginHorizontal();
            foreach (MotionMode candidate in Enum.GetValues(typeof(MotionMode)))
                if (GUILayout.Toggle(candidate == motion, candidate.ToString(), GUI.skin.button) && candidate != motion)
                    SetMotion(candidate);
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            foreach (Cue cue in Enum.GetValues(typeof(Cue)))
            {
                using (new GUILayoutOptionScope(motion != MotionMode.Off &&
                    (cue != Cue.Signature || projection.ActiveZone.HasValue)))
                    if (GUILayout.Button(cue.ToString())) PlayCue(cue);
            }
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            using (new GUILayoutOptionScope(snapshot < Snapshots.Length - 1))
                if (GUILayout.Button("Next recorded snapshot")) NextSnapshot();
            if (GUILayout.Button("Restart fixture")) ResetReplay();
            GUILayout.EndHorizontal();
            GUILayout.EndArea();
        }

        private readonly struct GUILayoutOptionScope : IDisposable
        {
            private readonly bool previous;
            internal GUILayoutOptionScope(bool enabled) { previous = GUI.enabled; GUI.enabled = previous && enabled; }
            public void Dispose() => GUI.enabled = previous;
        }

        private void OnDestroy() => meshes?.Dispose();
    }
}
