# Pet Arena audio and presentation hooks

Wave B presentation foundation for the Pet Arena client. Everything here is a
presentation seam: audio cues, pooled VFX and comfort controls. No component
owns gameplay state, board contents, rewards or authority, and scenes remain
owned by the scene agent.

## Committed assets

- `AetheriaArenaMixer.mixer` — Master with Music, Ambient, SFX, Voice and UI
  child groups. Each bus exposes one `<Bus>Volume` parameter in decibels
  (Master/Music/Ambient/SFX/Voice/UI). Mute is the conventional -80 dB value
  because Unity mixers expose gain, not a boolean mute.
- `ArenaAudioLibrary.asset` — one override row per event. Every clip slot is
  empty until licensed or owner-approved media arrives, so generated
  placeholders run. Drop an approved clip into a row to replace it.
- `Resources/ArenaPresentation.prefab` — `ArenaAudioDirector`,
  `ArenaVfxDirector` and `ArenaPresentationBridge`, wired to the mixer and
  library. Add the prefab to a scene; do not add audio code to gameplay owners.

`Aetheria > Audio > Build arena audio assets` rebuilds the mixer, library rows
and prefab deterministically. `Aetheria > Audio > Validate arena audio assets`
checks the six groups, exposed parameters, library rows and prefab wiring.
Unity has no public mixer authoring API, so this Editor-only factory drives the
Editor's own `AudioMixerController` to create a real `.mixer` asset.

## Calling it from a scene

```csharp
var bridge = ArenaPresentationBridge.Ensure(host);   // or a prefab instance
bridge.EnterHub(ArenaHub.CinderTerraces);            // Fire ambience
bridge.BeginCombat(ArenaCombatScore.Boss);           // boss score
bridge.NotifyTileSelected(tile);                     // board feedback
bridge.NotifyTileMatch(ArenaElement.Fire, tile);
bridge.NotifyInvalidSwap(tile);
bridge.NotifyAttack(ArenaElement.Water, target, ArenaImpactStrength.Strong);
bridge.NotifyGuard(target); bridge.NotifyShieldBreak(target);
bridge.NotifyFireZone(origin, 1f, 4);                // bounded 4x4 Icarus zone
bridge.NotifyArtifactEquipped(anchor); bridge.NotifyArtifactUpgraded(anchor);
bridge.NotifyVictory(anchor); bridge.NotifyDefeat(anchor);
bridge.NotifyRecruitment(anchor); bridge.NotifyReward(anchor);
bridge.SetReducedMotion(true); bridge.SetFlashEnabled(false);
bridge.SetChannelMuted(ArenaAudioChannel.Ui, true);
```

Events are fire-and-forget. `ArenaAudioDirector` pools eight sources, applies
per-cue cooldowns, routes each cue to its bus and crossfades ambience and score
loops. `ArenaVfxDirector` pools elemental bursts, board rings, the 4x4
FIRE_ZONE overlay and camera flash/shake, all of which restore the camera and
respect reduced motion and the flash toggle.

## Placeholder media

All clips are generated at runtime by `ArenaAudioFallback`. It reuses the
existing `ArenaProceduralAudio` cues for attack, ultimate, victory, defeat,
evolution and pull, and synthesizes the remaining events. No external sample,
soundtrack, voice artist or engine content is included. Voice is therefore a
reserved bus with a placeholder announcer chime, not production VO.

## Checks

```sh
UNITY_EDITOR=/path/to/6000.3.14f1/Editor/Unity node scripts/unity-validate.mjs tests
UNITY_EDITOR=/path/to/6000.3.14f1/Editor/Unity node scripts/unity-validate.mjs linux
```

EditMode tests cover mixer structure and exposed parameters, persisted
independent volumes and mutes, cue coverage, placeholder generation, director
routing, prefab wiring and pooled VFX/comfort controls. PlayMode tests cover
real playback through the buses, mixer mute application, ambience/score loops,
FIRE_ZONE pooling, camera restore and PlayerPrefs persistence.
