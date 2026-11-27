using System;
using System.Diagnostics;
using UnityEngine;
using UnityEngine.Profiling;
using Debug = UnityEngine.Debug;

namespace Aetheria.World.Presentation
{
    // The camera is fixed during play. Only the backdrop crop and stage wings
    // respond to a viewport aspect change.
    [RequireComponent(typeof(Camera))]
    public sealed class FixedBattleCamera : MonoBehaviour
    {
        private static readonly bool ProfileBackdrop = Debug.isDebugBuild &&
            Array.IndexOf(Environment.GetCommandLineArgs(), "-aetheria-profile-battle-backdrop") >= 0;

        private Camera view;
        private Transform pet, enemy, backdrop;
        private Vector3 petAnchor, enemyAnchor;
        private Sprite backdropSprite;
        private float aspect;

        public bool HasBackdrop => backdrop != null;

        public void Frame(Vector3 center, Transform playerActor, Transform enemyActor, string mapId)
        {
            if (backdrop != null)
            {
                Destroy(backdrop.gameObject);
                backdrop = null;
            }
            if (backdropSprite != null)
            {
                Destroy(backdropSprite);
                backdropSprite = null;
            }
            view = GetComponent<Camera>();
            pet = playerActor;
            enemy = enemyActor;
            if (pet != null) petAnchor = pet.position;
            if (enemy != null) enemyAnchor = enemy.position;
            view.orthographic = true;
            view.orthographicSize = 4.5f;
            transform.position = center + new Vector3(0f, 4.8f, -16f);
            transform.LookAt(center);
            view.clearFlags = CameraClearFlags.SolidColor;
            view.backgroundColor = new Color(.09f, .07f, .13f);

            var resourcePath = "BattleBackdrops/" + mapId;
            var loadStarted = ProfileBackdrop ? Stopwatch.GetTimestamp() : 0;
            var asset = Resources.Load<Sprite>(resourcePath);
            var texture = asset == null ? Resources.Load<Texture2D>(resourcePath) : null;
            if (ProfileBackdrop)
            {
                var requestMs = (Stopwatch.GetTimestamp() - loadStarted) * 1000d / Stopwatch.Frequency;
                var measuredTexture = asset != null ? asset.texture : texture;
                var textureDetails = measuredTexture == null
                    ? "found=false"
                    : $"found=true dimensions={measuredTexture.width}x{measuredTexture.height} format={measuredTexture.format} " +
                      $"mips={measuredTexture.mipmapCount} unityRuntimeBytes={Profiler.GetRuntimeMemorySizeLong(measuredTexture)}";
                Debug.Log(FormattableString.Invariant(
                    $"[Aetheria Battle Backdrop] map={mapId} requestMs={requestMs:F3} {textureDetails}"));
            }
            if (asset == null && texture != null)
                backdropSprite = Sprite.Create(texture, new Rect(0, 0, texture.width, texture.height),
                    new Vector2(.5f, .5f), 100f, 0, SpriteMeshType.FullRect);
            if (asset != null || backdropSprite != null)
            {
                var plate = new GameObject("Battle backdrop");
                plate.transform.SetParent(transform, false);
                plate.transform.localPosition = new Vector3(0, 0, Mathf.Min(60f, view.farClipPlane - 1f));
                var renderer = plate.AddComponent<SpriteRenderer>();
                renderer.sprite = asset != null ? asset : backdropSprite;
                renderer.sortingOrder = -100;
                backdrop = plate.transform;
            }

            aspect = 0;
            ReframeWings();
        }

        private void LateUpdate() { ReframeWings(); }

        private void ReframeWings()
        {
            if (view == null || Mathf.Approximately(aspect, view.aspect)) return;
            aspect = view.aspect;
            var side = view.orthographicSize * aspect * .70f;
            if (pet != null) pet.position = new Vector3(transform.position.x - side, petAnchor.y, petAnchor.z);
            if (enemy != null) enemy.position = new Vector3(transform.position.x + side, enemyAnchor.y, enemyAnchor.z);
            if (backdrop == null) return;

            var bounds = backdrop.GetComponent<SpriteRenderer>().sprite.bounds.size;
            var fit = Mathf.Max(view.orthographicSize * 2f * aspect / bounds.x,
                view.orthographicSize * 2f / bounds.y);
            backdrop.localScale = Vector3.one * fit;
        }

        private void OnDestroy()
        {
            if (backdropSprite != null) Destroy(backdropSprite);
        }
    }
}
