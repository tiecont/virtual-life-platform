using UnityEngine;

namespace Aetheria.PetArena.Vfx
{
    internal static class ArenaProceduralAudio
    {
        public const int SfxCount = 8;
        public const int BgmCount = 3;
        public const int SampleRate = 22050;

        private const float TwoPi = 6.2831853f;

        private delegate float Waveform(float time, float duration);

        public static AudioClip CreateSfx(ArenaSfx sfx)
        {
            switch (sfx)
            {
                case ArenaSfx.UiClick: return Build("arena_sfx_ui_click", .06f, UiClick);
                case ArenaSfx.Attack: return Build("arena_sfx_attack", .16f, Attack);
                case ArenaSfx.Skill: return Build("arena_sfx_skill", .3f, Skill);
                case ArenaSfx.Ultimate: return Build("arena_sfx_ultimate", .6f, Ultimate);
                case ArenaSfx.Victory: return Build("arena_sfx_victory", .85f, Victory);
                case ArenaSfx.Defeat: return Build("arena_sfx_defeat", .95f, Defeat);
                case ArenaSfx.Evolution: return Build("arena_sfx_evolution", .9f, Evolution);
                case ArenaSfx.GachaPull: return Build("arena_sfx_gacha_pull", .75f, GachaPull);
                default: return null;
            }
        }

        public static AudioClip CreateBgm(ArenaBgm bgm)
        {
            switch (bgm)
            {
                case ArenaBgm.Lobby: return Build("arena_bgm_lobby", 8f, LobbyPad);
                case ArenaBgm.Battle: return Build("arena_bgm_battle", 6f, BattlePad);
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

        private static float UiClick(float time, float duration)
        {
            var envelope = Mathf.Exp(-time * 95f);
            return (Mathf.Sin(TwoPi * 1560f * time) * .55f +
                    Mathf.Sin(TwoPi * 2340f * time) * .2f) * envelope;
        }

        private static float Attack(float time, float duration)
        {
            var sweep = Mathf.Sin(TwoPi * (540f * time - 1450f * time * time));
            var thump = Mathf.Sin(TwoPi * 90f * time) * Mathf.Exp(-time * 18f);
            var grit = Mathf.Sin(TwoPi * 3170f * time) * Mathf.Sin(TwoPi * 1710f * time);
            return sweep * Mathf.Exp(-time * 20f) * .7f +
                   thump * .55f +
                   grit * Mathf.Exp(-time * 45f) * .18f;
        }

        private static float Skill(float time, float duration)
        {
            var sweep = Mathf.Sin(TwoPi * (420f * time + 880f * time * time));
            var shimmer = Mathf.Sin(TwoPi * (1260f * time + 1500f * time * time)) * .35f;
            var tremolo = .72f + .28f * Mathf.Sin(TwoPi * 16f * time);
            return (sweep * .62f + shimmer) * tremolo *
                   Envelope(time, duration, .02f, .14f);
        }

        private static float Ultimate(float time, float duration)
        {
            var bass = Mathf.Sin(TwoPi * 55f * time) * .45f;
            var sweep = Mathf.Sin(TwoPi * (170f * time + 2400f * time * time)) * .45f;
            var chord = (Mathf.Sin(TwoPi * 330f * time) +
                         Mathf.Sin(TwoPi * 495f * time) * .7f +
                         Mathf.Sin(TwoPi * 660f * time) * .4f) * .3f;
            var body = bass + (sweep + chord) * Mathf.Exp(-time * 1.8f);
            return body * Envelope(time, duration, .015f, .25f);
        }

        private static float Victory(float time, float duration)
        {
            var value = Note(time, 0f, .28f, 523.25f, .5f);
            value += Note(time, .13f, .28f, 659.25f, .48f);
            value += Note(time, .26f, .28f, 783.99f, .46f);
            value += Note(time, .39f, .44f, 1046.5f, .55f);
            value += Note(time, .39f, .44f, 1567.98f, .16f);
            return value;
        }

        private static float Defeat(float time, float duration)
        {
            var value = Note(time, 0f, .32f, 392f, .5f);
            value += Note(time, .16f, .32f, 329.63f, .5f);
            value += Note(time, .32f, .36f, 261.63f, .52f);
            value += Note(time, .5f, .42f, 196f, .58f);
            value += Note(time, .5f, .42f, 98f, .3f);
            return value;
        }

        private static float Evolution(float time, float duration)
        {
            var rise = Mathf.Sin(TwoPi * (220f * time + 1500f * time * time)) * .4f;
            rise *= Envelope(time, duration, .05f, .3f);
            var value = rise;
            value += Note(time, .08f, .3f, 659.25f, .28f);
            value += Note(time, .24f, .32f, 880f, .28f);
            value += Note(time, .4f, .5f, 1318.5f, .34f);
            value += Note(time, .56f, .34f, 1760f, .16f);
            return value;
        }

        private static float GachaPull(float time, float duration)
        {
            var value = 0f;
            value += Note(time, 0f, .18f, 783.99f, .3f);
            value += Note(time, .08f, .18f, 987.77f, .3f);
            value += Note(time, .16f, .2f, 1174.66f, .32f);
            value += Note(time, .26f, .22f, 1567.98f, .34f);
            value += Note(time, .38f, .26f, 1975.53f, .32f);
            value += Note(time, .5f, .24f, 2637.02f, .26f);
            value += Note(time, .5f, .24f, 1318.51f, .2f);
            value *= Envelope(time, duration, .01f, .16f);
            return value;
        }

        private static float LobbyPad(float time, float duration)
        {
            var value = PadVoice(time, 130.81f, duration, .085f);
            value += PadVoice(time, 196f, duration, .075f);
            value += PadVoice(time, 329.63f, duration, .065f);
            value += PadVoice(time, 493.88f, duration, .05f);
            var breath = .8f + .2f * Mathf.Sin(TwoPi * (1f / duration) * time);
            return value * breath;
        }

        private static float BattlePad(float time, float duration)
        {
            var value = PadVoice(time, 73.42f, duration, .1f);
            value += PadVoice(time, 146.83f, duration, .08f);
            value += PadVoice(time, 174.61f, duration, .07f);
            value += PadVoice(time, 220f, duration, .065f);
            value += PadVoice(time, 293.66f, duration, .05f);
            var pulse = .76f + .24f * Mathf.Sin(TwoPi * 2f * time);
            return value * pulse;
        }

        private static float PadVoice(float time, float frequency, float duration, float gain)
        {
            var step = 1f / duration;
            var baseFrequency = Mathf.Round(frequency * duration) / duration;
            var detuned = baseFrequency + step;
            var voice = Mathf.Sin(TwoPi * baseFrequency * time) +
                        Mathf.Sin(TwoPi * detuned * time) * .6f +
                        Mathf.Sin(TwoPi * baseFrequency * 2f * time) * .15f;
            return voice * gain;
        }

        private static float Note(float time, float start, float length, float frequency,
            float gain)
        {
            var local = time - start;
            if (local < 0f || local > length) return 0f;
            var attack = Mathf.Clamp01(local / .012f);
            var decay = Mathf.Exp(-local * (3.5f / length));
            return Mathf.Sin(TwoPi * frequency * local) * attack * decay * gain;
        }

        private static float Envelope(float time, float duration, float attack, float release)
        {
            var attackGain = attack <= 0f ? 1f : Mathf.Clamp01(time / attack);
            var releaseGain = release <= 0f ? 1f : Mathf.Clamp01((duration - time) / release);
            return attackGain * releaseGain;
        }
    }
}
