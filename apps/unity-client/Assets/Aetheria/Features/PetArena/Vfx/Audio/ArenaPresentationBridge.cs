using UnityEngine;

namespace Aetheria.PetArena.Vfx
{
    // Integration seam for scenes and gameplay code. Every method raises a
    // presentation event only: no board, health, reward or authority write.
    // A scene can also call it statically through Active when no reference is
    // wired, and absent bridges are a no-op.
    [DisallowMultipleComponent]
    public sealed class ArenaPresentationBridge : MonoBehaviour
    {
        [SerializeField] private ArenaAudioDirector audio;
        [SerializeField] private ArenaVfxDirector vfx;
        [SerializeField] private bool reducedMotion = true;
        [SerializeField] private bool flashEnabled = true;
        [SerializeField, Range(0f, 2f)] private float shakeScale = .35f;

        public static ArenaPresentationBridge Active { get; private set; }

        public bool ReducedMotion => reducedMotion;
        public bool FlashEnabled => flashEnabled;
        public float ShakeScale => shakeScale;
        public bool HasWiredAudio => audio != null;
        public bool HasWiredVfx => vfx != null;

        public ArenaAudioDirector Audio
        {
            get
            {
                if (audio == null) audio = GetComponent<ArenaAudioDirector>();
                if (audio == null) audio = gameObject.AddComponent<ArenaAudioDirector>();
                return audio;
            }
        }

        public ArenaVfxDirector Vfx
        {
            get
            {
                if (vfx == null) vfx = GetComponent<ArenaVfxDirector>();
                if (vfx == null) vfx = gameObject.AddComponent<ArenaVfxDirector>();
                return vfx;
            }
        }

        public static ArenaPresentationBridge Ensure(GameObject host)
        {
            if (host == null) throw new System.ArgumentNullException(nameof(host));
            var existing = host.GetComponent<ArenaPresentationBridge>();
            return existing != null ? existing : host.AddComponent<ArenaPresentationBridge>();
        }

        public void Configure(ArenaAudioDirector audioDirector, ArenaVfxDirector vfxDirector,
            bool useReducedMotion, bool useFlash, float scale)
        {
            audio = audioDirector;
            vfx = vfxDirector;
            ApplyComfort(useReducedMotion, useFlash, scale);
        }

        public void ApplyComfort(bool useReducedMotion, bool useFlash, float scale)
        {
            reducedMotion = useReducedMotion;
            flashEnabled = useFlash;
            shakeScale = Mathf.Clamp(scale, 0f, 2f);
            var vfxDirector = Vfx;
            vfxDirector.SetReducedMotion(reducedMotion);
            vfxDirector.SetFlashEnabled(flashEnabled);
            vfxDirector.SetShakeScale(shakeScale);
        }

        public void SetReducedMotion(bool value)
        {
            reducedMotion = value;
            Vfx.SetReducedMotion(value);
        }

        public void SetFlashEnabled(bool value)
        {
            flashEnabled = value;
            Vfx.SetFlashEnabled(value);
        }

        public void SetShakeScale(float value)
        {
            shakeScale = Mathf.Clamp(value, 0f, 2f);
            Vfx.SetShakeScale(shakeScale);
        }

        // ---- ambience and score ----

        public void EnterHub(ArenaHub hub)
        {
            Audio.SetAmbience(ArenaAudioCues.AmbienceFor(hub));
            Audio.SetCombatScore(ArenaCombatScore.None);
        }

        public void SetArenaAmbience(ArenaAmbience ambience) => Audio.SetAmbience(ambience);

        public void BeginCombat(ArenaCombatScore score) => Audio.SetCombatScore(score);

        public void BeginBossEncounter(ArenaCombatScore score)
        {
            Audio.SetCombatScore(score == ArenaCombatScore.None ? ArenaCombatScore.Boss : score);
            Audio.Play(ArenaAudioCue.BossWarning);
            Vfx.BossWarning(BoardAnchor);
        }

        // ---- board feedback ----

        public void NotifyTileSelected(Vector3 position)
        {
            Audio.Play(ArenaAudioCue.TileSelect);
            Vfx.TileSelected(position);
        }

        public void NotifyTileMatch(ArenaElement element, Vector3 position)
        {
            Audio.Play(ArenaAudioCue.TileMatch);
            Audio.PlayElement(element, .8f);
            Vfx.TileMatch(element, position);
        }

        public void NotifyInvalidSwap(Vector3 position)
        {
            Audio.Play(ArenaAudioCue.TileInvalid);
            Vfx.InvalidSwap(position);
        }

        public void NotifyCascade(Vector3 position, int count)
        {
            Audio.Play(ArenaAudioCue.Cascade);
            Vfx.Cascade(position, count);
        }

        // ---- combat ----

        public void NotifyAttack(ArenaElement element, Vector3 position,
            ArenaImpactStrength strength = ArenaImpactStrength.Neutral)
        {
            Audio.Play(ArenaAudioCue.Attack);
            Audio.PlayElement(element, .9f);
            Vfx.AttackImpact(element, position, strength);
        }

        public void NotifyImpact(Vector3 position,
            ArenaImpactStrength strength = ArenaImpactStrength.Neutral)
        {
            Audio.Play(ArenaAudioCue.Impact);
            Vfx.Impact(position, strength);
        }

        public void NotifyElementCast(ArenaElement element, Vector3 position)
        {
            Audio.PlayElement(element, 1f);
            Vfx.PlayElement(element, position);
        }

        public void NotifyGuard(Vector3 position)
        {
            Audio.Play(ArenaAudioCue.Guard);
            Vfx.Guard(position);
        }

        public void NotifyShieldBreak(Vector3 position)
        {
            Audio.Play(ArenaAudioCue.ShieldBreak);
            Vfx.ShieldBreak(position);
        }

        public int NotifyFireZone(Vector3 origin, float cellSize, int side = 4)
        {
            Audio.Play(ArenaAudioCue.FireZone);
            return Vfx.FireZone(origin, cellSize, side);
        }

        public void HideFireZone() => Vfx.HideFireZone();

        // ---- progression and rewards ----

        public void NotifyArtifactEquipped(Vector3 position)
        {
            Audio.Play(ArenaAudioCue.ArtifactEquip);
            Vfx.RewardPulse(position);
        }

        public void NotifyArtifactUpgraded(Vector3 position)
        {
            Audio.Play(ArenaAudioCue.ArtifactUpgrade);
            Vfx.RewardPulse(position);
            Audio.Play(ArenaAudioCue.Reward);
        }

        public void NotifyVictory(Vector3 position)
        {
            Audio.Play(ArenaAudioCue.Victory);
            Vfx.Victory(position);
            Audio.SetCombatScore(ArenaCombatScore.None);
        }

        public void NotifyDefeat(Vector3 position)
        {
            Audio.Play(ArenaAudioCue.Defeat);
            Vfx.Defeat(position);
            Audio.SetCombatScore(ArenaCombatScore.None);
        }

        public void NotifyRecruitment(Vector3 position)
        {
            Audio.Play(ArenaAudioCue.Recruitment);
            Audio.Play(ArenaAudioCue.Reward);
            Vfx.RewardPulse(position);
        }

        public void NotifyReward(Vector3 position)
        {
            Audio.Play(ArenaAudioCue.Reward);
            Vfx.RewardPulse(position);
        }

        public void NotifyUiClick() => Audio.Play(ArenaAudioCue.UiClick);

        public void NotifyUiBack() => Audio.Play(ArenaAudioCue.UiBack);

        public void NotifyUiConfirm() => Audio.Play(ArenaAudioCue.UiConfirm);

        public void NotifyAnnouncerPrompt() => Audio.Play(ArenaAudioCue.AnnouncerPrompt);

        // ---- mixer controls ----

        public bool ApplyAudioSettings() => Audio.ApplySettings();

        public void SetChannelVolume(ArenaAudioChannel channel, float linear) =>
            Audio.SetChannelVolume(channel, linear);

        public void SetChannelMuted(ArenaAudioChannel channel, bool muted) =>
            Audio.SetChannelMuted(channel, muted);

        public bool ToggleChannelMuted(ArenaAudioChannel channel) =>
            Audio.ToggleChannelMuted(channel);

        public void StopAll()
        {
            Audio.StopAll();
            Vfx.Clear();
        }

        private Vector3 BoardAnchor => transform.position + Vector3.up * .2f;

        private void Awake()
        {
            Active = this;
            if (audio != null) audio.SetLibrary(audio.Library);
            Vfx.SetReducedMotion(reducedMotion);
            Vfx.SetFlashEnabled(flashEnabled);
            Vfx.SetShakeScale(shakeScale);
        }

        private void OnDestroy()
        {
            if (Active == this) Active = null;
        }
    }
}
