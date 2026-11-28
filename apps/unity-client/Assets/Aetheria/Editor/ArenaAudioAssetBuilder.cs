using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Aetheria.PetArena.Vfx;
using UnityEditor;
using UnityEngine;
using UnityEngine.Audio;
using Object = UnityEngine.Object;

namespace Aetheria.Editor
{
    // Builds the committed AudioMixer, override library and integration prefab.
    // Unity exposes no public API to author mixer groups; this deterministic
    // Editor-only factory uses the Editor's own AudioMixerController so the
    // result is a real .mixer asset rather than a hand-written serialized file.
    public static class ArenaAudioAssetBuilder
    {
        public const string Folder = "Assets/Aetheria/Features/PetArena/Vfx/Audio";
        public const string MixerPath = Folder + "/AetheriaArenaMixer.mixer";
        public const string LibraryPath = Folder + "/ArenaAudioLibrary.asset";
        public const string PrefabPath = Folder + "/Resources/ArenaPresentation.prefab";

        [MenuItem("Aetheria/Audio/Build arena audio assets")]
        public static void Build()
        {
            EnsureFolder(Folder);
            EnsureFolder(Folder + "/Resources");
            var mixer = EnsureMixer();
            var library = EnsureLibrary();
            EnsurePrefab(mixer, library);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("ARENA_AUDIO_ASSETS " + MixerPath + " " + LibraryPath + " " + PrefabPath);
        }

        [MenuItem("Aetheria/Audio/Validate arena audio assets")]
        public static void Validate()
        {
            var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>(MixerPath);
            if (mixer == null) throw new InvalidOperationException("Missing mixer asset " + MixerPath);
            for (var index = 0; index < ArenaAudioChannels.Count; index++)
            {
                var channel = (ArenaAudioChannel)index;
                if (mixer.FindMatchingGroups(ArenaAudioChannels.Name(channel)).Length == 0)
                    throw new InvalidOperationException("Mixer group missing: " + ArenaAudioChannels.Name(channel));
                if (!mixer.GetFloat(ArenaAudioChannels.VolumeParameter(channel), out _))
                    throw new InvalidOperationException("Exposed parameter missing: " +
                                                        ArenaAudioChannels.VolumeParameter(channel));
            }
            var library = AssetDatabase.LoadAssetAtPath<ArenaAudioLibrary>(LibraryPath);
            if (library == null) throw new InvalidOperationException("Missing library " + LibraryPath);
            if (!library.CoversEveryCue(out var missing))
                throw new InvalidOperationException("Library cue rows incomplete: " + missing);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            if (prefab == null) throw new InvalidOperationException("Missing prefab " + PrefabPath);
            var director = prefab.GetComponent<ArenaAudioDirector>();
            if (director == null || director.Mixer != mixer)
                throw new InvalidOperationException("Prefab is not wired to the committed mixer");
            Debug.Log("ARENA_AUDIO_ASSETS_VALID");
        }

        private static AudioMixer EnsureMixer()
        {
            var existing = AssetDatabase.LoadAssetAtPath<AudioMixer>(MixerPath);
            if (existing != null) return existing;
            var controllerType = FindType("UnityEditor.Audio.AudioMixerController");
            var groupType = FindType("UnityEditor.Audio.AudioMixerGroupController");
            if (controllerType == null || groupType == null)
                throw new InvalidOperationException("UnityEditor.Audio audio mixer authoring types are unavailable");
            var create = controllerType.GetMethod("CreateMixerControllerAtPath",
                BindingFlags.Public | BindingFlags.Static);
            if (create == null)
                throw new InvalidOperationException("AudioMixerController.CreateMixerControllerAtPath is unavailable");
            var controller = create.Invoke(null, new object[] {MixerPath});
            if (controller == null) throw new InvalidOperationException("AudioMixer was not created");
            var createGroup = controllerType.GetMethod("CreateNewGroup", new[] {typeof(string), typeof(bool)});
            var addChild = controllerType.GetMethod("AddChildToParent", new[] {groupType, groupType});
            var master = controllerType.GetProperty("masterGroup").GetValue(controller);
            var mixer = (AudioMixer)controller;
            if (createGroup == null || master == null)
                throw new InvalidOperationException("AudioMixer group authoring API is unavailable");
            for (var index = 1; index < ArenaAudioChannels.Count; index++)
            {
                var channel = (ArenaAudioChannel)index;
                var name = ArenaAudioChannels.Name(channel);
                var group = createGroup.Invoke(controller, new object[] {name, false});
                if (group == null) throw new InvalidOperationException("AudioMixer group was not created: " + name);
                if (mixer.FindMatchingGroups("Master/" + name).Length == 0 && addChild != null)
                    addChild.Invoke(controller, new[] {group, master});
            }
            ExposeVolumes(controllerType, groupType, controller);
            EditorUtility.SetDirty(controller as Object);
            AssetDatabase.SaveAssets();
            AssetDatabase.ImportAsset(MixerPath, ImportAssetOptions.ForceSynchronousImport |
                                                  ImportAssetOptions.ForceUpdate);
            var created = AssetDatabase.LoadAssetAtPath<AudioMixer>(MixerPath);
            if (created == null) throw new InvalidOperationException("AudioMixer asset was not imported");
            return created;
        }

        private static void ExposeVolumes(Type controllerType, Type groupType, object controller)
        {
            var getAll = controllerType.GetMethod("GetAllAudioGroupsSlow");
            var guidForVolume = groupType.GetMethod("GetGUIDForVolume");
            var exposedType = FindType("UnityEditor.Audio.ExposedAudioParameter");
            var exposedSetter = controllerType.GetProperty("exposedParameters");
            if (getAll == null || guidForVolume == null || exposedType == null || exposedSetter == null)
                throw new InvalidOperationException("AudioMixer exposed-parameter API is unavailable");
            var groups = ((IEnumerable)getAll.Invoke(controller, null)).Cast<object>().ToArray();
            var parameters = new List<object>();
            for (var index = 0; index < groups.Length; index++)
            {
                var groupObject = groups[index] as Object;
                if (groupObject == null) continue;
                if (!ArenaAudioChannels.TryParse(groupObject.name, out var channel)) continue;
                var parameter = Activator.CreateInstance(exposedType);
                exposedType.GetField("guid").SetValue(parameter, guidForVolume.Invoke(groups[index], null));
                exposedType.GetField("name").SetValue(parameter,
                    ArenaAudioChannels.VolumeParameter(channel));
                parameters.Add(parameter);
            }
            var array = Array.CreateInstance(exposedType, parameters.Count);
            for (var index = 0; index < parameters.Count; index++) array.SetValue(parameters[index], index);
            exposedSetter.SetValue(controller, array);
        }

        private static ArenaAudioLibrary EnsureLibrary()
        {
            var library = AssetDatabase.LoadAssetAtPath<ArenaAudioLibrary>(LibraryPath);
            if (library == null)
            {
                library = ScriptableObject.CreateInstance<ArenaAudioLibrary>();
                AssetDatabase.CreateAsset(library, LibraryPath);
            }
            if (library.CueEntryCount == ArenaAudioCues.Count - 1) return library;
            var cues = new ArenaAudioCueEntry[ArenaAudioCues.Count - 1];
            for (var index = 1; index < ArenaAudioCues.Count; index++)
            {
                var cue = (ArenaAudioCue)index;
                cues[index - 1] = new ArenaAudioCueEntry
                {
                    cue = cue,
                    volume = DefaultCueVolume(cue),
                    pitch = Vector2.one
                };
            }
            var ambiences = new[]
            {
                new ArenaAmbienceEntry {ambience = ArenaAmbience.Plaza, volume = .32f},
                new ArenaAmbienceEntry {ambience = ArenaAmbience.Fire, volume = .4f},
                new ArenaAmbienceEntry {ambience = ArenaAmbience.Water, volume = .36f}
            };
            var music = new[]
            {
                new ArenaMusicEntry {score = ArenaCombatScore.Regular, volume = .3f},
                new ArenaMusicEntry {score = ArenaCombatScore.Boss, volume = .34f}
            };
            library.Configure(cues, ambiences, music);
            EditorUtility.SetDirty(library);
            return library;
        }

        private static float DefaultCueVolume(ArenaAudioCue cue)
        {
            switch (cue)
            {
                case ArenaAudioCue.TileSelect: return .55f;
                case ArenaAudioCue.TileInvalid: return .5f;
                case ArenaAudioCue.UiClick: return .6f;
                case ArenaAudioCue.UiBack: return .55f;
                case ArenaAudioCue.Victory: return .9f;
                case ArenaAudioCue.Defeat: return .85f;
                case ArenaAudioCue.FireZone: return .95f;
                case ArenaAudioCue.BossWarning: return .8f;
                case ArenaAudioCue.AnnouncerPrompt: return .7f;
                default: return .8f;
            }
        }

        private static void EnsurePrefab(AudioMixer mixer, ArenaAudioLibrary library)
        {
            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            if (existing != null) return;
            var root = new GameObject("Arena Presentation");
            try
            {
                var audio = root.AddComponent<ArenaAudioDirector>();
                var vfx = root.AddComponent<ArenaVfxDirector>();
                var bridge = root.AddComponent<ArenaPresentationBridge>();
                var audioSerialized = new SerializedObject(audio);
                audioSerialized.FindProperty("mixer").objectReferenceValue = mixer;
                audioSerialized.FindProperty("library").objectReferenceValue = library;
                audioSerialized.ApplyModifiedPropertiesWithoutUndo();
                var bridgeSerialized = new SerializedObject(bridge);
                bridgeSerialized.FindProperty("audio").objectReferenceValue = audio;
                bridgeSerialized.FindProperty("vfx").objectReferenceValue = vfx;
                bridgeSerialized.FindProperty("reducedMotion").boolValue = true;
                bridgeSerialized.FindProperty("flashEnabled").boolValue = true;
                bridgeSerialized.FindProperty("shakeScale").floatValue = .35f;
                bridgeSerialized.ApplyModifiedPropertiesWithoutUndo();
                PrefabUtility.SaveAsPrefabAsset(root, PrefabPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        private static Type FindType(string name)
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type type = null;
                try
                {
                    type = assembly.GetType(name, false);
                }
                catch (Exception)
                {
                    // Assembly type resolution is best effort.
                }
                if (type != null) return type;
            }
            return null;
        }

        private static void EnsureFolder(string path)
        {
            var segments = path.Split('/');
            var current = segments[0];
            for (var index = 1; index < segments.Length; index++)
            {
                var next = current + "/" + segments[index];
                if (!AssetDatabase.IsValidFolder(next)) AssetDatabase.CreateFolder(current, segments[index]);
                current = next;
            }
        }
    }
}
