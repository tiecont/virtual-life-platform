using UnityEngine;

namespace Aetheria.PetArena.Vfx
{
    // Pooled event VFX: six elemental bursts, board feedback, guard/shield,
    // Icarus FIRE_ZONE and bounded camera flash/shake. This component owns no
    // gameplay state and never mutates a board.
    [DisallowMultipleComponent]
    public sealed class ArenaVfxDirector : MonoBehaviour
    {
        private static readonly Color SelectionColor = new Color(.55f, .9f, 1f, 1f);
        private static readonly Color InvalidColor = new Color(1f, .32f, .28f, 1f);
        private static readonly Color GuardColor = new Color(.62f, .95f, 1f, 1f);

        [SerializeField] private bool reducedMotion = true;
        [SerializeField] private bool flashEnabled = true;
        [SerializeField, Range(0f, 2f)] private float shakeScale = .35f;
        [SerializeField, Range(0f, 1f)] private float flashOpacity = .3f;
        [SerializeField] private Camera targetCamera;

        private ArenaDecalPool decals;
        private ArenaParticleBurstPool bursts;
        private ArenaTileFeedbackPool tiles;
        private ArenaIcarusFireZoneVfx fireZone;
        private ArenaScreenFeedback screen;
        private bool initialized;

        public bool ReducedMotion => reducedMotion;
        public bool FlashEnabled => flashEnabled;
        public float ShakeScale => shakeScale;
        public bool IsInitialized => initialized;
        public int ActiveDecalCount => decals != null ? decals.ActiveCount : 0;
        public int BurstSystemCount => bursts != null ? bursts.Count : 0;
        public int ActiveTileFeedbackCount => tiles != null ? tiles.ActiveCount : 0;
        public bool IsFireZoneActive => fireZone != null && fireZone.IsActive;
        public int FireZoneCellCount => fireZone != null ? fireZone.CellCount : 0;
        public bool IsScreenFlashActive => screen != null && screen.FlashActive;
        public bool IsCameraShaking => screen != null && screen.ShakeActive;
        public Camera TargetCamera
        {
            get => targetCamera;
            set => targetCamera = value;
        }

        public static ArenaVfxDirector Ensure(GameObject host)
        {
            if (host == null) throw new System.ArgumentNullException(nameof(host));
            var existing = host.GetComponent<ArenaVfxDirector>();
            return existing != null ? existing : host.AddComponent<ArenaVfxDirector>();
        }

        public void SetReducedMotion(bool value)
        {
            reducedMotion = value;
            if (decals != null) decals.SetReducedMotion(value);
            if (bursts != null) bursts.SetReducedMotion(value);
            if (tiles != null) tiles.SetReducedMotion(value);
            if (screen != null) screen.ReducedMotion = value;
        }

        public void SetFlashEnabled(bool value)
        {
            flashEnabled = value;
            if (screen != null) screen.FlashEnabled = value;
        }

        public void SetShakeScale(float value) => shakeScale = Mathf.Clamp(value, 0f, 2f);

        public void BindCamera(Camera camera)
        {
            targetCamera = camera;
        }

        public void PlayElement(ArenaElement element, Vector3 position)
        {
            EnsureInitialized();
            if (decals != null) decals.Show(element, position, reducedMotion);
            if (bursts != null) bursts.Play(element, position, reducedMotion);
        }

        public void TileSelected(Vector3 position)
        {
            EnsureInitialized();
            if (tiles != null) tiles.Show(SelectionColor, position, .8f, .35f);
        }

        public void TileMatch(ArenaElement element, Vector3 position)
        {
            PlayElement(element, position);
            if (tiles != null) tiles.Show(ArenaVisualPalette.ParticleColor(element), position, 1.3f, .5f);
        }

        public void InvalidSwap(Vector3 position)
        {
            EnsureInitialized();
            if (tiles != null) tiles.Show(InvalidColor, position, .9f, .4f);
        }

        public void Cascade(Vector3 position, int count)
        {
            EnsureInitialized();
            var bounded = Mathf.Clamp(count, 1, 6);
            for (var index = 0; index < bounded; index++)
            {
                var offset = new Vector3((index - (bounded - 1) * .5f) * .22f, 0f, index * .12f);
                if (tiles != null) tiles.Show(SelectionColor, position + offset, .7f, .4f);
            }
        }

        public void Impact(Vector3 position, ArenaImpactStrength strength = ArenaImpactStrength.Neutral)
        {
            EnsureInitialized();
            var magnitude = ShakeMagnitude(strength);
            ScreenShake(magnitude, .18f);
            if (tiles != null) tiles.Show(InvalidColor, position, .9f, .3f);
        }

        public void AttackImpact(ArenaElement element, Vector3 position,
            ArenaImpactStrength strength = ArenaImpactStrength.Neutral)
        {
            PlayElement(element, position);
            Impact(position, strength);
            ScreenFlash(ArenaVisualPalette.ParticleColor(element), .16f, .8f);
        }

        public void Guard(Vector3 position)
        {
            EnsureInitialized();
            if (tiles != null) tiles.Show(GuardColor, position, 1.6f, .5f);
            if (decals != null) decals.Show(ArenaElement.Water, position, reducedMotion);
        }

        public void ShieldBreak(Vector3 position)
        {
            EnsureInitialized();
            if (tiles != null) tiles.Show(InvalidColor, position, 1.9f, .5f);
            if (bursts != null) bursts.Play(ArenaElement.Electric, position, reducedMotion);
            ScreenShake(ShakeMagnitude(ArenaImpactStrength.Strong) * .6f, .16f);
        }

        public int FireZone(Vector3 origin, float cellSize, int side = 4)
        {
            EnsureInitialized();
            var cells = fireZone != null ? fireZone.Show(origin, cellSize, side) : 0;
            ScreenFlash(ArenaVisualPalette.ParticleColor(ArenaElement.Fire), .3f, 1f);
            ScreenShake(ShakeMagnitude(ArenaImpactStrength.Strong), .28f);
            return cells;
        }

        public void HideFireZone()
        {
            if (fireZone != null) fireZone.Hide();
        }

        public void BossWarning(Vector3 position)
        {
            EnsureInitialized();
            if (tiles != null) tiles.Show(InvalidColor, position, 2.2f, .8f);
            ScreenFlash(new Color(1f, .25f, .2f, 1f), .2f, .7f);
        }

        public void Victory(Vector3 position)
        {
            EnsureInitialized();
            PlayElement(ArenaElement.Light, position);
            if (tiles != null) tiles.Show(GuardColor, position, 2.4f, .8f);
            ScreenFlash(Color.white, .35f, .5f);
        }

        public void Defeat(Vector3 position)
        {
            EnsureInitialized();
            if (decals != null) decals.Show(ArenaElement.Ghost, position, reducedMotion);
            if (tiles != null) tiles.Show(InvalidColor, position, 2.2f, .8f);
        }

        public void RewardPulse(Vector3 position)
        {
            EnsureInitialized();
            if (tiles != null) tiles.Show(GuardColor, position, 1.4f, .5f);
        }

        public void Clear()
        {
            if (decals != null) decals.HideAll();
            if (bursts != null) bursts.StopAll();
            if (tiles != null) tiles.HideAll();
            if (fireZone != null) fireZone.Hide();
        }

        private void Awake()
        {
            EnsureInitialized();
        }

        private void Update()
        {
            Tick(Time.unscaledDeltaTime);
        }

        // Advances pooled feedback deterministically; tests call this directly.
        public void Tick(float deltaTime)
        {
            if (!initialized || deltaTime <= 0f) return;
            if (decals != null) decals.Tick(deltaTime);
            if (tiles != null) tiles.Tick(deltaTime);
            if (fireZone != null) fireZone.Tick(deltaTime);
            if (screen != null) screen.Tick(deltaTime);
        }

        private void OnDestroy()
        {
            Dispose();
        }

        private void EnsureInitialized()
        {
            if (initialized) return;
            initialized = true;
            decals = new ArenaDecalPool(transform);
            bursts = new ArenaParticleBurstPool(transform);
            tiles = new ArenaTileFeedbackPool(transform);
            fireZone = new ArenaIcarusFireZoneVfx(transform);
            screen = new ArenaScreenFeedback
            {
                FlashEnabled = flashEnabled,
                ReducedMotion = reducedMotion
            };
            decals.SetReducedMotion(reducedMotion);
            bursts.SetReducedMotion(reducedMotion);
            tiles.SetReducedMotion(reducedMotion);
        }

        private void ScreenFlash(Color color, float seconds, float intensity)
        {
            if (screen == null) return;
            var camera = ResolveCamera();
            if (camera == null) return;
            screen.Flash(camera, color, seconds, flashOpacity * Mathf.Clamp01(intensity));
        }

        private void ScreenShake(float magnitude, float seconds)
        {
            if (screen == null) return;
            var camera = ResolveCamera();
            if (camera == null) return;
            screen.Shake(camera, magnitude, seconds);
        }

        private float ShakeMagnitude(ArenaImpactStrength strength)
        {
            var baseMagnitude = strength == ArenaImpactStrength.Strong ? .085f
                : strength == ArenaImpactStrength.Weak ? .02f : .05f;
            return baseMagnitude * shakeScale;
        }

        private Camera ResolveCamera()
        {
            if (targetCamera != null) return targetCamera;
            return Camera.main;
        }

        private void Dispose()
        {
            if (!initialized) return;
            initialized = false;
            if (decals != null)
            {
                decals.Dispose();
                decals = null;
            }
            if (bursts != null)
            {
                bursts.Dispose();
                bursts = null;
            }
            if (tiles != null)
            {
                tiles.Dispose();
                tiles = null;
            }
            if (fireZone != null)
            {
                fireZone.Dispose();
                fireZone = null;
            }
            if (screen != null)
            {
                screen.Dispose();
                screen = null;
            }
        }
    }
}
