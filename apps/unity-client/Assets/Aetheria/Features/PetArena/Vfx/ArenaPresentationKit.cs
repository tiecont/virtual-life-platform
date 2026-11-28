using System;
using UnityEngine;

namespace Aetheria.PetArena.Vfx
{
    public enum ArenaElement
    {
        Fire,
        Water,
        Electric,
        Ghost,
        Ground,
        Light
    }

    public enum ArenaSfx
    {
        UiClick,
        Attack,
        Skill,
        Ultimate,
        Victory,
        Defeat,
        Evolution,
        GachaPull
    }

    public enum ArenaBgm
    {
        None,
        Lobby,
        Battle
    }

    // Offline MVP presentation bridge: runtime-generated board decals, particle
    // bursts and procedural audio. It owns no gameplay state and is safe to
    // create in batchmode without a graphics device or audio listener.
    [ExecuteAlways]
    public sealed class ArenaPresentationKit : MonoBehaviour
    {
        private ArenaDecalPool decals;
        private ArenaParticleBurstPool bursts;
        private AudioSource sfxSource;
        private AudioSource musicSource;
        private AudioClip[] sfxClips;
        private AudioClip[] bgmClips;
        private Transform audioRoot;
        private ArenaBgm currentBgm = ArenaBgm.None;
        private bool reducedMotion;
        private bool initialized;

        public bool ReducedMotion => reducedMotion;
        public ArenaBgm CurrentBgm => currentBgm;
        public bool MusicLooping => musicSource != null && musicSource.loop;
        public bool IsMusicPlaying => musicSource != null && musicSource.isPlaying;
        public int ActiveDecalCount => decals != null ? decals.ActiveCount : 0;
        public int BurstSystemCount => bursts != null ? bursts.Count : 0;

        public static ArenaPresentationKit Ensure(GameObject host)
        {
            if (host == null) throw new ArgumentNullException(nameof(host));
            var existing = host.GetComponent<ArenaPresentationKit>();
            if (existing != null) return existing;
            return host.AddComponent<ArenaPresentationKit>();
        }

        public void SetReducedMotion(bool reduced)
        {
            reducedMotion = reduced;
            if (bursts != null) bursts.SetReducedMotion(reduced);
            if (decals != null) decals.SetReducedMotion(reduced);
        }

        public static Color ElementColor(ArenaElement element) => ArenaVisualPalette.ParticleColor(element);

        public void PlayElement(ArenaElement element, Vector3 position)
        {
            var index = (int)element;
            if (index < 0 || index >= ArenaVisualPalette.ElementCount) return;
            EnsureInitialized();
            if (decals != null) decals.Show(element, position, reducedMotion);
            if (bursts != null) bursts.Play(element, position, reducedMotion);
        }

        public void PlaySfx(ArenaSfx sfx)
        {
            var index = (int)sfx;
            if (index < 0 || index >= ArenaProceduralAudio.SfxCount) return;
            EnsureInitialized();
            var clip = GetSfxClip(index);
            if (clip == null || sfxSource == null) return;
            if (!Application.isPlaying) return;
            sfxSource.PlayOneShot(clip, .85f);
        }

        public void PlayBgm(ArenaBgm bgm)
        {
            if (bgm == ArenaBgm.None)
            {
                StopMusic();
                return;
            }
            var index = (int)bgm;
            if (index <= 0 || index >= ArenaProceduralAudio.BgmCount) return;
            EnsureInitialized();
            var clip = GetBgmClip(index);
            currentBgm = bgm;
            if (musicSource == null) return;
            musicSource.loop = true;
            musicSource.clip = clip;
            if (Application.isPlaying && clip != null) musicSource.Play();
        }

        public void StopAll()
        {
            if (decals != null) decals.HideAll();
            if (bursts != null) bursts.StopAll();
            StopMusic();
            if (sfxSource != null) sfxSource.Stop();
        }

        public bool TryGetClip(ArenaSfx sfx, out AudioClip clip)
        {
            clip = null;
            var index = (int)sfx;
            if (index < 0 || index >= ArenaProceduralAudio.SfxCount) return false;
            EnsureInitialized();
            clip = GetSfxClip(index);
            return clip != null;
        }

        public bool TryGetBgmClip(ArenaBgm bgm, out AudioClip clip)
        {
            clip = null;
            var index = (int)bgm;
            if (index <= 0 || index >= ArenaProceduralAudio.BgmCount) return false;
            EnsureInitialized();
            clip = GetBgmClip(index);
            return clip != null;
        }

        private void Awake()
        {
            EnsureInitialized();
        }

        private void Update()
        {
            if (!initialized || decals == null) return;
            decals.Tick(Time.unscaledDeltaTime);
        }

        private void OnDestroy()
        {
            StopAll();
            DestroyOwnedAssets();
        }

        private void EnsureInitialized()
        {
            if (initialized) return;
            initialized = true;

            decals = new ArenaDecalPool(transform);

            bursts = new ArenaParticleBurstPool(transform);
            bursts.SetReducedMotion(reducedMotion);
            decals.SetReducedMotion(reducedMotion);

            audioRoot = new GameObject("Presentation Audio").transform;
            audioRoot.SetParent(transform, false);
            audioRoot.gameObject.hideFlags = HideFlags.DontSave;
            sfxSource = CreateSource("Sfx", .85f, false);
            musicSource = CreateSource("Music", .22f, true);
            sfxClips = new AudioClip[ArenaProceduralAudio.SfxCount];
            bgmClips = new AudioClip[ArenaProceduralAudio.BgmCount];

            if (Application.isPlaying && FindFirstObjectByType<AudioListener>() == null)
                gameObject.AddComponent<AudioListener>();
        }

        private AudioSource CreateSource(string name, float volume, bool loop)
        {
            var sourceObject = new GameObject(name);
            sourceObject.transform.SetParent(audioRoot, false);
            sourceObject.hideFlags = HideFlags.DontSave;
            var source = sourceObject.AddComponent<AudioSource>();
            source.playOnAwake = false;
            source.loop = loop;
            source.volume = volume;
            source.spatialBlend = 0f;
            source.dopplerLevel = 0f;
            return source;
        }

        private AudioClip GetSfxClip(int index)
        {
            if (sfxClips == null || index < 0 || index >= sfxClips.Length) return null;
            if (sfxClips[index] == null)
                sfxClips[index] = ArenaProceduralAudio.CreateSfx((ArenaSfx)index);
            return sfxClips[index];
        }

        private AudioClip GetBgmClip(int index)
        {
            if (bgmClips == null || index <= 0 || index >= bgmClips.Length) return null;
            if (bgmClips[index] == null)
                bgmClips[index] = ArenaProceduralAudio.CreateBgm((ArenaBgm)index);
            return bgmClips[index];
        }

        private void StopMusic()
        {
            currentBgm = ArenaBgm.None;
            if (musicSource == null) return;
            musicSource.Stop();
            musicSource.loop = false;
            musicSource.clip = null;
        }

        private void DestroyOwnedAssets()
        {
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
            if (sfxClips != null)
            {
                for (var index = 0; index < sfxClips.Length; index++)
                    ArenaRuntimeAssets.Destroy(sfxClips[index]);
                sfxClips = null;
            }
            if (bgmClips != null)
            {
                for (var index = 0; index < bgmClips.Length; index++)
                    ArenaRuntimeAssets.Destroy(bgmClips[index]);
                bgmClips = null;
            }
            if (audioRoot != null)
            {
                ArenaRuntimeAssets.Destroy(audioRoot.gameObject);
                audioRoot = null;
            }
            sfxSource = null;
            musicSource = null;
        }
    }
}
