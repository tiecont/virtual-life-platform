using UnityEngine;

namespace Aetheria.PetArena.Vfx
{
    // Generated placeholder audio. No external media, sample library or engine
    // content is used. These clips are temporary by design and are replaced per
    // event through ArenaAudioLibrary once licensed media is delivered.
    public static class ArenaAudioFallback
    {
        public const int SampleRate = ArenaProceduralAudio.SampleRate;
        private const float TwoPi = 6.2831853f;

        private delegate float Waveform(float time, float duration);


        public static AudioClip CreateCue(ArenaAudioCue cue)
        {
            switch (cue)
            {
                case ArenaAudioCue.UiClick: return ArenaProceduralAudio.CreateSfx(ArenaSfx.UiClick);
                case ArenaAudioCue.Attack: return ArenaProceduralAudio.CreateSfx(ArenaSfx.Attack);
                case ArenaAudioCue.Victory: return ArenaProceduralAudio.CreateSfx(ArenaSfx.Victory);
                case ArenaAudioCue.Defeat: return ArenaProceduralAudio.CreateSfx(ArenaSfx.Defeat);
                case ArenaAudioCue.FireZone: return ArenaProceduralAudio.CreateSfx(ArenaSfx.Ultimate);
                case ArenaAudioCue.ArtifactUpgrade: return ArenaProceduralAudio.CreateSfx(ArenaSfx.Evolution);
                case ArenaAudioCue.Recruitment: return ArenaProceduralAudio.CreateSfx(ArenaSfx.GachaPull);
                case ArenaAudioCue.UiBack: return Build("arena_proc_ui_back", .16f, UiBack);
                case ArenaAudioCue.UiConfirm: return Build("arena_proc_ui_confirm", .22f, UiConfirm);
                case ArenaAudioCue.TileSelect: return Build("arena_proc_tile_select", .1f, TileSelect);
                case ArenaAudioCue.TileMatch: return Build("arena_proc_tile_match", .3f, TileMatch);
                case ArenaAudioCue.TileInvalid: return Build("arena_proc_tile_invalid", .22f, TileInvalid);
                case ArenaAudioCue.Cascade: return Build("arena_proc_cascade", .5f, Cascade);
                case ArenaAudioCue.Impact: return Build("arena_proc_impact", .2f, Impact);
                case ArenaAudioCue.Guard: return Build("arena_proc_guard", .42f, Guard);
                case ArenaAudioCue.ShieldBreak: return Build("arena_proc_shield_break", .5f, ShieldBreak);
                case ArenaAudioCue.BossWarning: return Build("arena_proc_boss_warning", .9f, BossWarning);
                case ArenaAudioCue.ElementFire: return Build("arena_proc_element_fire", .42f, ElementFire);
                case ArenaAudioCue.ElementWater: return Build("arena_proc_element_water", .42f, ElementWater);
                case ArenaAudioCue.ElementElectric: return Build("arena_proc_element_electric", .3f, ElementElectric);
                case ArenaAudioCue.ElementGhost: return Build("arena_proc_element_ghost", .55f, ElementGhost);
                case ArenaAudioCue.ElementGround: return Build("arena_proc_element_ground", .4f, ElementGround);
                case ArenaAudioCue.ElementLight: return Build("arena_proc_element_light", .46f, ElementLight);
                case ArenaAudioCue.ArtifactEquip: return Build("arena_proc_artifact_equip", .34f, ArtifactEquip);
                case ArenaAudioCue.Reward: return Build("arena_proc_reward", .45f, Reward);
                case ArenaAudioCue.AnnouncerPrompt: return Build("arena_proc_announcer_prompt", .5f, AnnouncerPrompt);
                default: return Build("arena_proc_click", .07f, UiBack);
            }
        }

        public static AudioClip CreateAmbience(ArenaAmbience ambience)
        {
            switch (ambience)
            {
                case ArenaAmbience.Plaza: return Build("arena_ambience_plaza", 4f, PlazaAmbience);
                case ArenaAmbience.Fire: return Build("arena_ambience_fire", 2f, FireAmbience);
                case ArenaAmbience.Water: return Build("arena_ambience_water", 2f, WaterAmbience);
                default: return null;
            }
        }

        public static AudioClip CreateMusic(ArenaCombatScore score)
        {
            switch (score)
            {
                case ArenaCombatScore.Regular: return ArenaProceduralAudio.CreateBgm(ArenaBgm.Battle);
                case ArenaCombatScore.Boss: return Build("arena_score_boss", 4f, BossScore);
                default: return null;
            }
        }

        private static AudioClip Build(string name, float duration, Waveform waveform)
        {
            var sampleCount = Mathf.Max(1, Mathf.CeilToInt(duration * SampleRate));
            var data = new float[sampleCount];
            for (var index = 0; index < sampleCount; index++)
            {
                var time = index / (float)SampleRate;
                data[index] = Mathf.Clamp(waveform(time, duration), -1f, 1f);
            }
            var clip = AudioClip.Create(name, sampleCount, 1, SampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private static float Note(float time, float start, float length, float frequency, float gain)
        {
            var local = time - start;
            if (local < 0f || local > length) return 0f;
            var attack = Mathf.Clamp01(local / .01f);
            var decay = Mathf.Exp(-local * (4f / length));
            return Mathf.Sin(TwoPi * frequency * local) * attack * decay * gain;
        }

        private static float Envelope(float time, float duration, float attack, float release)
        {
            var attackGain = attack <= 0f ? 1f : Mathf.Clamp01(time / attack);
            var releaseGain = release <= 0f ? 1f : Mathf.Clamp01((duration - time) / release);
            return attackGain * releaseGain;
        }

        private static float Noise(float time)
        {
            var value = Mathf.Sin(time * 127.1f + 311.7f) * 43758.5453f;
            return (value - Mathf.Floor(value)) * 2f - 1f;
        }

        private static float UiBack(float time, float duration)
        {
            return Note(time, 0f, .06f, 660f, .35f) + Note(time, .05f, .08f, 440f, .3f);
        }

        private static float UiConfirm(float time, float duration)
        {
            return Note(time, 0f, .07f, 587.33f, .35f) + Note(time, .07f, .12f, 880f, .4f);
        }

        private static float TileSelect(float time, float duration)
        {
            return Note(time, 0f, .09f, 1320f, .34f) + Note(time, 0f, .06f, 1980f, .14f);
        }

        private static float TileMatch(float time, float duration)
        {
            var value = Note(time, 0f, .16f, 659.25f, .3f) + Note(time, .04f, .18f, 987.77f, .28f);
            value += Note(time, .09f, .2f, 1318.51f, .22f);
            return value * Envelope(time, duration, .005f, .1f);
        }

        private static float TileInvalid(float time, float duration)
        {
            var buzz = Mathf.Sign(Mathf.Sin(TwoPi * 150f * time)) * .16f;
            return (buzz + Note(time, 0f, .16f, 220f, .28f)) * Envelope(time, duration, .005f, .07f);
        }

        private static float Cascade(float time, float duration)
        {
            var value = 0f;
            var frequency = 523.25f;
            for (var step = 0; step < 5; step++)
            {
                value += Note(time, step * .07f, .14f, frequency, .22f);
                frequency *= 1.1892f;
            }
            return value;
        }

        private static float Impact(float time, float duration)
        {
            var thump = Mathf.Sin(TwoPi * 78f * time) * Mathf.Exp(-time * 26f) * .5f;
            var grit = Noise(time) * Mathf.Exp(-time * 34f) * .3f;
            return thump + grit;
        }

        private static float Guard(float time, float duration)
        {
            var ring = Mathf.Sin(TwoPi * 880f * time) * Mathf.Exp(-time * 7f);
            ring += Mathf.Sin(TwoPi * 1320f * time) * Mathf.Exp(-time * 9f) * .5f;
            ring += Mathf.Sin(TwoPi * 1760f * time) * Mathf.Exp(-time * 11f) * .25f;
            return ring * .42f * Envelope(time, duration, .004f, .12f);
        }

        private static float ShieldBreak(float time, float duration)
        {
            var shatter = Noise(time) * Mathf.Exp(-time * 12f) * .45f;
            shatter += Mathf.Sin(TwoPi * (1400f * time - 900f * time * time)) *
                       Mathf.Exp(-time * 8f) * .3f;
            return shatter * Envelope(time, duration, .002f, .1f);
        }

        private static float BossWarning(float time, float duration)
        {
            var swell = Mathf.Clamp01(time / .12f) * Mathf.Clamp01((duration - time) / .2f);
            var horn = Mathf.Sin(TwoPi * 98f * time) + Mathf.Sin(TwoPi * 147f * time) * .45f;
            horn += Mathf.Sin(TwoPi * 196f * time) * .2f;
            return horn * swell * .34f;
        }

        private static float ElementFire(float time, float duration)
        {
            var crackle = Noise(time * 1.7f) * Mathf.Exp(-time * 9f) * .3f;
            var body = Mathf.Sin(TwoPi * (180f * time + 700f * time * time)) *
                       Mathf.Exp(-time * 6f) * .34f;
            return (crackle + body) * Envelope(time, duration, .006f, .12f);
        }

        private static float ElementWater(float time, float duration)
        {
            var value = 0f;
            for (var drop = 0; drop < 4; drop++)
            {
                var start = drop * .07f;
                value += Note(time, start, .1f, 740f + drop * 190f, .22f);
            }
            value += Noise(time) * .06f * Envelope(time, duration, .01f, .16f);
            return value;
        }

        private static float ElementElectric(float time, float duration)
        {
            var zap = Mathf.Sin(TwoPi * (900f * time + 5200f * time * time)) *
                      Mathf.Exp(-time * 10f) * .32f;
            var crack = Noise(time * 3.1f) * Mathf.Exp(-time * 18f) * .2f;
            return (zap + crack) * Envelope(time, duration, .001f, .09f);
        }

        private static float ElementGhost(float time, float duration)
        {
            var drift = Mathf.Sin(TwoPi * 220f * time + Mathf.Sin(TwoPi * 5f * time) * 2.2f) * .26f;
            drift += Mathf.Sin(TwoPi * 330f * time) * .12f;
            return drift * Envelope(time, duration, .05f, .2f);
        }

        private static float ElementGround(float time, float duration)
        {
            var thud = Mathf.Sin(TwoPi * 62f * time) * Mathf.Exp(-time * 12f) * .5f;
            thud += Noise(time) * Mathf.Exp(-time * 20f) * .2f;
            return thud * Envelope(time, duration, .004f, .12f);
        }

        private static float ElementLight(float time, float duration)
        {
            var chime = Mathf.Sin(TwoPi * 1046.5f * time) * .3f;
            chime += Mathf.Sin(TwoPi * 1568f * time) * .18f;
            chime += Mathf.Sin(TwoPi * 2093f * time) * .1f;
            return chime * Mathf.Exp(-time * 5f) * Envelope(time, duration, .004f, .1f);
        }

        private static float ArtifactEquip(float time, float duration)
        {
            var value = Note(time, 0f, .12f, 783.99f, .3f);
            value += Note(time, .08f, .18f, 1174.66f, .26f);
            return value * Envelope(time, duration, .004f, .1f);
        }

        private static float Reward(float time, float duration)
        {
            var value = Note(time, 0f, .1f, 1046.5f, .28f);
            value += Note(time, .08f, .1f, 1318.51f, .26f);
            value += Note(time, .16f, .16f, 1567.98f, .24f);
            value += Note(time, .16f, .16f, 2093f, .12f);
            return value * Envelope(time, duration, .004f, .12f);
        }

        private static float AnnouncerPrompt(float time, float duration)
        {
            var value = Note(time, 0f, .16f, 523.25f, .24f);
            value += Note(time, .14f, .3f, 659.25f, .22f);
            return value * Envelope(time, duration, .01f, .16f);
        }

        private static float PlazaAmbience(float time, float duration)
        {
            var value = Mathf.Sin(TwoPi * 110f * time) * .07f;
            value += Mathf.Sin(TwoPi * 164.81f * time) * .055f;
            value += Mathf.Sin(TwoPi * 220f * time) * .04f;
            value += Mathf.Sin(TwoPi * 329.63f * time) * .022f;
            var breath = .8f + .2f * Mathf.Sin(TwoPi * (1f / duration) * time);
            return value * breath;
        }

        private static float FireAmbience(float time, float duration)
        {
            var hum = Mathf.Sin(TwoPi * 55f * time) * .07f;
            var gate = Mathf.Pow(Mathf.Max(0f, Mathf.Sin(TwoPi * 3f * time)), 6f);
            var crackle = Noise(time * 2.3f) * gate * .16f;
            var shimmer = Mathf.Sin(TwoPi * 880f * time) * .012f;
            return hum + crackle + shimmer;
        }

        private static float WaterAmbience(float time, float duration)
        {
            var swell = .55f + .45f * Mathf.Sin(TwoPi * .5f * time);
            var waves = (Noise(time * .7f) + Noise(time * .7f + .37f)) * .08f * swell;
            var bubbles = Mathf.Sin(TwoPi * (240f * time + 60f * time * time)) *
                          (Mathf.Pow(Mathf.Max(0f, Mathf.Sin(TwoPi * 1.5f * time)), 14f)) * .06f;
            return waves + bubbles;
        }

        private static float BossScore(float time, float duration)
        {
            var pulse = .55f + .45f * Mathf.Sin(TwoPi * 2f * time);
            var bass = Mathf.Sin(TwoPi * 49f * time) * .22f * pulse;
            bass += Mathf.Sin(TwoPi * 73.42f * time) * .1f;
            bass += Mathf.Sin(TwoPi * 98f * time) * .06f;
            return bass;
        }
    }
}
