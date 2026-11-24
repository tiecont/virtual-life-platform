using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Aetheria.PetArena.Infrastructure;
using Aetheria.PetArena.Vfx;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    [RequireComponent(typeof(UIDocument))]
    public sealed class Wave1CampaignScreen : MonoBehaviour
    {
        private enum Screen { Session, Lobby, Maps, Combat, Rewards, Collection, Gacha, Artifacts }

        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private readonly List<string> party = new List<string>();
        private readonly List<string> regularActions = new List<string>();
        private readonly List<string> bossActions = new List<string>();
        private PetArenaMvpController stage;
        private ArenaPresentationKit effects;
        private Wave1LocalApi api;
        private PanelSettings panel;
        private VisualElement root;
        private ScrollView content;
        private Wave1Manifest manifest;
        private Wave1State state;
        private WaveAArtifactState artifacts;
        private Wave1Map map;
        private Wave1Pet fighter;
        private Wave1Encounter encounter;
        private Wave1PlayResponse result;
        private Screen screen;
        private string selectedPet;
        private string displayName = "Arena Guest " + Guid.NewGuid().ToString("N").Substring(0, 6);
        private string notice;
        private string gachaSummary;
        private string combatMessage;
        private Func<Task> retry;
        private bool busy, boss, registered, reduced = true, loadedSession;

        public void Initialize(PetArenaMvpController arena, string origin)
        {
            stage = arena;
            effects = ArenaPresentationKit.Ensure(gameObject);
            effects.SetReducedMotion(reduced);
            panel = ScriptableObject.CreateInstance<PanelSettings>();
            panel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            panel.referenceResolution = new Vector2Int(1280, 720);
            panel.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            panel.match = .5f;
            panel.themeStyleSheet = Resources.Load<ThemeStyleSheet>("Wave1Theme");
            var document = GetComponent<UIDocument>();
            document.panelSettings = panel;
            root = document.rootVisualElement;
            var stylesheet = Resources.Load<StyleSheet>("Wave1");
            if (stylesheet != null) root.styleSheets.Add(stylesheet);
            root.pickingMode = PickingMode.Ignore;
            try
            {
                var webOrigin = Environment.GetEnvironmentVariable("AETHERIA_WAVE1_WEB_ORIGIN")
                    ?? "http://127.0.0.1:3300";
                api = new Wave1LocalApi(origin, webOrigin, Application.persistentDataPath);
                loadedSession = api.LoadSession();
            }
            catch (Exception exception) when (exception is ArgumentException || exception is System.IO.IOException ||
                                              exception is UnauthorizedAccessException)
            {
                notice = "Check the loopback API address and local session directory.";
            }
            effects.PlayBgm(ArenaBgm.Lobby);
            Draw();
            if (loadedSession) Run(LoadLobby);
        }

        private void OnDestroy()
        {
            lifetime.Cancel();
            api?.Dispose();
            lifetime.Dispose();
            if (panel != null) Destroy(panel);
        }

        private void Draw()
        {
            root.Clear();
            var column = new VisualElement();
            column.AddToClassList("arena-panel");
            root.Add(column);
            var eyebrow = Label("AETHERIA / SOULBOUND", "arena-eyebrow");
            column.Add(eyebrow);
            column.Add(Label(Title(), "arena-title"));
            column.Add(Label(state == null ? "Offline campaign" : state.wallet.coins + " coins · Offline campaign", "arena-meta"));
            if (!string.IsNullOrEmpty(notice)) column.Add(Label(notice, "arena-notice"));

            if (busy)
            {
                column.Add(Label("Contacting the local API…"));
                return;
            }

            content = new ScrollView();
            column.Add(content);
            if (retry != null)
            {
                Button("Retry", () => Run(retry));
                if (screen == Screen.Session) Button("Back", () => { retry = null; Draw(); });
                FocusFirst();
                return;
            }

            switch (screen)
            {
                case Screen.Session: DrawSession(); break;
                case Screen.Lobby: DrawLobby(); break;
                case Screen.Maps: DrawMaps(); break;
                case Screen.Combat: DrawCombat(); break;
                case Screen.Rewards: DrawRewards(); break;
                case Screen.Collection: DrawCollection(); break;
                case Screen.Gacha: DrawGacha(); break;
                case Screen.Artifacts: DrawArtifacts(); break;
            }
            FocusFirst();
        }

        private string Title()
        {
            switch (screen)
            {
                case Screen.Session: return "Pet Arena PvE";
                case Screen.Lobby: return "Your party";
                case Screen.Maps: return "Campaign maps";
                case Screen.Combat: return map.name + (boss ? " · Boss" : "");
                case Screen.Rewards: return result.result.won ? "Victory" : "Defeat";
                case Screen.Collection: return "Pet profile";
                case Screen.Artifacts: return "Artifact loadout";
                default: return "Icarus banner";
            }
        }

        private void DrawSession()
        {
            if (api == null) return;
            if (loadedSession)
            {
                Button("Resume session", () => Run(LoadLobby), "resume-session");
                return;
            }

            if (registered)
            {
                var login = new TextField("Sign-in name");
                var password = new TextField("Password") { isPasswordField = true };
                content.Add(login);
                content.Add(password);
                Button("Sign in", () =>
                {
                    var loginName = login.value;
                    var credential = password.value;
                    var id = NewRequestId();
                    Run(async () =>
                    {
                        if (!loadedSession) await api.Login(loginName, credential, id, lifetime.Token);
                        loadedSession = true;
                        await LoadLobby();
                    });
                }, "sign-in");
            }
            else
            {
                var name = new TextField("Display name") { value = displayName, maxLength = 24 };
                name.RegisterValueChangedCallback(change => displayName = change.newValue);
                content.Add(name);
                Button("Enter as guest", () =>
                {
                    var guestName = displayName;
                    var id = NewRequestId();
                    Run(async () =>
                    {
                        if (!loadedSession) await api.CreateGuest(guestName, id, lifetime.Token);
                        loadedSession = true;
                        await LoadLobby();
                    });
                }, "enter-guest");
            }
            Button(registered ? "Use a guest session" : "Use an existing account", () =>
            {
                registered = !registered;
                notice = null;
                Draw();
            });
        }

        private async Task LoadLobby()
        {
            manifest = await api.Get<Wave1Manifest>("/manifest", lifetime.Token);
            ApplyState(await api.Get<Wave1State>("/state", lifetime.Token));
            Show(Screen.Lobby);
        }

        private void DrawLobby()
        {
            content.Add(Label("Select 1–4 Pets. Choose the active Pet on the next screen.", "arena-meta"));
            foreach (var pet in state.pets)
            {
                var slot = party.IndexOf(pet.petId);
                var tag = slot >= 0 ? (slot + 1) + ". " : "+ ";
                Button(tag + PetLabel(pet), () =>
                {
                    if (slot >= 0) party.RemoveAt(slot);
                    else if (party.Count < 4) party.Add(pet.petId);
                    Draw();
                }, "party-" + pet.petId, slot >= 0 || party.Count < 4);
            }

            Button("Choose a map", () =>
            {
                if (party.SequenceEqual(state.party))
                {
                    Show(Screen.Maps);
                    Draw();
                    return;
                }
                var request = new Wave1PartyRequest { requestId = NewRequestId(), petIds = party.ToArray() };
                Run(async () =>
                {
                    var saved = await api.Post<Wave1PartyResponse>("/party", request, lifetime.Token);
                    state.party = saved.party;
                    state.revision = saved.revision;
                    if (!state.party.Contains(selectedPet)) selectedPet = state.party[0];
                    Show(Screen.Maps);
                });
            }, "choose-map", party.Count > 0);
            Button("Pet profile", () => Navigate(Screen.Collection), "open-evolution");
            Button("Artifacts", () => Run(LoadArtifacts), "open-artifacts");
            Button("Icarus banner", () => Navigate(Screen.Gacha), "open-gacha");
            Button("Reduced motion · " + (reduced ? "On" : "Off"), () =>
            {
                reduced = !reduced;
                stage.SetReducedMotion(reduced);
                effects.SetReducedMotion(reduced);
                Draw();
            });
        }

        private async Task LoadArtifacts()
        {
            artifacts = await api.GetArtifactState(lifetime.Token);
            var pet = artifacts.FindPet(selectedPet);
            if (pet == null && artifacts.pets != null && artifacts.pets.Length > 0)
            {
                selectedPet = artifacts.pets[0].petId;
                pet = artifacts.pets[0];
            }
            if (pet != null) selectedPet = pet.petId;
            Show(Screen.Artifacts);
        }

        private void DrawArtifacts()
        {
            if (artifacts == null)
            {
                content.Add(Label("Artifact inventory is unavailable.", "arena-notice"));
                Button("Back to party", () => Navigate(Screen.Lobby), "artifacts-back");
                return;
            }

            content.Add(Label("Three slots: Core / Aegis / Rune. Equip by Pet level, never by presentation power class.", "arena-meta"));
            content.Add(Label(artifacts.materials + " materials · " + (artifacts.inventory?.Length ?? 0) + " owned artifacts", "arena-notice"));
            var pet = artifacts.FindPet(selectedPet);
            var petName = pet == null ? "No owned Pet" : PetLabel(state?.FindPet(selectedPet));
            if (pet != null)
            {
                content.Add(Label(petName + " · Lv " + pet.level + " · power " + pet.powerClass, "arena-title"));
                content.Add(Label("Core: " + ArtifactName(pet.slots?.core)));
                content.Add(Label("Aegis: " + ArtifactName(pet.slots?.aegis)));
                content.Add(Label("Rune: " + ArtifactName(pet.slots?.rune)));
                content.Add(Label("Totals · HP +" + pet.totals.hp + " · ATK +" + pet.totals.attack +
                                  " · DEF +" + pet.totals.defense + " · SPD +" + pet.totals.speed, "arena-meta"));
            }

            foreach (var item in artifacts.inventory ?? Array.Empty<WaveAArtifactInstance>())
            {
                var stateLabel = item.equipped == null ? "unequipped" : "on " + item.equipped.petId;
                content.Add(Label(item.name + " · " + item.rank + " " + item.slot + " · Lv " + item.upgradeLevel +
                                  "/" + item.maxUpgradeLevel + " · " + stateLabel, "arena-notice"));
                if (item.equipped == null)
                    Button("Equip to " + petName, () => EquipArtifact(item), "equip-" + item.artifactId, pet != null);
                else if (item.equipped.petId == selectedPet)
                    Button("Unequip", () => UnequipArtifact(item), "unequip-" + item.artifactId);
                if (item.upgradeLevel < item.maxUpgradeLevel)
                    Button("Upgrade · " + item.nextUpgradeCost + " materials", () => UpgradeArtifact(item),
                        "upgrade-" + item.artifactId, artifacts.materials >= item.nextUpgradeCost);
            }

            if (artifacts.pve?.available != null && artifacts.pve.available.Length > 0)
                Button("Claim PvE artifact reward", ClaimArtifactReward, "claim-artifact-reward");
            Button("Back to party", () => Navigate(Screen.Lobby), "artifacts-back");
        }

        private string ArtifactName(string artifactId)
        {
            if (string.IsNullOrEmpty(artifactId)) return "empty";
            var item = artifacts?.FindArtifact(artifactId);
            return item == null ? "empty" : item.name + " · " + item.rank + " Lv" + item.upgradeLevel;
        }

        private void EquipArtifact(WaveAArtifactInstance item)
        {
            if (string.IsNullOrEmpty(selectedPet)) return;
            Run(async () =>
            {
                var response = await api.EquipArtifact(new WaveAArtifactEquipRequest {
                    requestId = NewRequestId(), petId = selectedPet, artifactId = item.artifactId
                }, lifetime.Token);
                artifacts = response.state;
                notice = "Equipped " + item.name + ". The next battle snapshot will use its modifiers.";
            });
        }

        private void UnequipArtifact(WaveAArtifactInstance item)
        {
            if (item.equipped == null) return;
            Run(async () =>
            {
                var response = await api.UnequipArtifact(new WaveAArtifactUnequipRequest {
                    requestId = NewRequestId(), petId = item.equipped.petId, slot = item.equipped.slot
                }, lifetime.Token);
                artifacts = response.state;
                notice = "Unequipped " + item.name + ".";
            });
        }

        private void UpgradeArtifact(WaveAArtifactInstance item)
        {
            Run(async () =>
            {
                var response = await api.UpgradeArtifact(new WaveAArtifactUpgradeRequest {
                    requestId = NewRequestId(), artifactId = item.artifactId
                }, lifetime.Token);
                artifacts = response.state;
                notice = "Upgraded " + item.name + " with " + response.spent + " materials.";
            });
        }

        private void ClaimArtifactReward()
        {
            Run(async () =>
            {
                var response = await api.ClaimArtifactReward(new WaveAArtifactClaimRequest {
                    requestId = NewRequestId()
                }, lifetime.Token);
                artifacts = response.state;
                notice = "Claimed an Artifact reward and materials.";
            });
        }

        private void DrawMaps()
        {
            content.Add(Label("Active Pet", "arena-meta"));
            foreach (var id in state.party)
            {
                var pet = state.FindPet(id);
                Button((id == selectedPet ? "✓ " : "") + PetLabel(pet), () =>
                {
                    selectedPet = id;
                    stage.PresentCampaignPet(Element(pet.element), pet.level);
                    Draw();
                }, "active-" + id);
            }

            foreach (var candidate in manifest.maps)
            {
                var cleared = state.campaign.clearedMaps.Contains(candidate.id);
                var unlocked = cleared || state.campaign.nextMapId == candidate.id;
                var progress = cleared ? "Replay" : unlocked ? "Open" : "Locked";
                Button(candidate.name + " · " + Element(candidate.element) + " · " + progress,
                    () => StartMap(candidate), "map-" + candidate.id, unlocked);
            }
            Button("Back to party", () => Navigate(Screen.Lobby));
        }

        private void StartMap(Wave1Map candidate)
        {
            var pet = state.FindPet(selectedPet);
            var request = new Wave1PreviewRequest {
                mapId = candidate.id, petId = pet.petId, actions = Array.Empty<string>()
            };
            Run(async () =>
            {
                var opening = await api.Post<Wave1Encounter>("/campaign/preview", request, lifetime.Token);
                map = candidate;
                fighter = pet;
                encounter = opening;
                boss = false;
                regularActions.Clear();
                bossActions.Clear();
                combatMessage = "Win the encounter to face the map boss.";
                stage.PresentCampaignPet(Element(pet.element), pet.level);
                stage.PresentCampaignOpponent(Element(map.element));
                Show(Screen.Combat);
            });
        }

        private void DrawCombat()
        {
            var opponent = boss ? map.boss : map.regular;
            Meter(fighter.name + " HP", encounter.remainingHp, fighter.stats.hp);
            Meter("Rage", encounter.rage, 100);
            Meter((boss ? "Boss" : "Opponent") + " HP", encounter.enemyHp, opponent.hp);
            var factor = encounter.effectiveness / 1000f;
            content.Add(Label("Turn " + encounter.turns + "/12 · " + Element(fighter.element)
                + " → " + Element(map.element) + " · ×" + factor.ToString("0.##"), "arena-meta"));
            content.Add(Label(combatMessage, "arena-notice"));

            if (encounter.complete)
            {
                if (encounter.won && !boss)
                    Button("Fight the boss", StartBoss, "fight-boss");
                else
                    Button(encounter.won ? "Claim rewards" : "View result", SubmitMap, "finish-map");
                return;
            }

            Button("Attack", () => PlayTurn("strike", ArenaSfx.Attack), "attack");
            Button("Guard", () => PlayTurn("guard", ArenaSfx.Skill), "guard");
            Button("Skill", () => PlayTurn("skill", ArenaSfx.Skill), "skill", encounter.skillReady);
            if (fighter.stage >= 1)
                Button("Power skill", () => PlayTurn("power-skill", ArenaSfx.Skill), "power-skill", encounter.skillReady);
            if (fighter.stage >= 2)
            {
                var icarus = fighter.petId == "pet-v3-fire-icarus";
                Button(icarus ? "Signature / FIRE_ZONE" : "Signature",
                    () => PlayTurn(icarus ? "fire-zone" : "signature", ArenaSfx.Ultimate), "signature",
                    encounter.skillReady && encounter.rage == 100);
            }
            if (fighter.stage >= 3)
                Button("Ultimate", () => PlayTurn("ultimate", ArenaSfx.Ultimate), "ultimate",
                    encounter.skillReady && encounter.rage == 100);
            Button("Leave encounter", () => Navigate(Screen.Maps), "leave-encounter");
        }

        private void PlayTurn(string action, ArenaSfx sound)
        {
            var transcript = boss ? bossActions : regularActions;
            var proposed = transcript.Append(action).ToArray();
            Wave1PreviewRequest request = boss
                ? new Wave1BossPreviewRequest { actions = regularActions.ToArray(), bossActions = proposed }
                : new Wave1PreviewRequest { actions = proposed };
            request.mapId = map.id;
            request.petId = fighter.petId;
            Run(async () =>
            {
                var next = await api.Post<Wave1Encounter>("/campaign/preview", request, lifetime.Token);
                transcript.Add(action);
                combatMessage = action == "guard" ? "Guard absorbs half the incoming damage."
                    : (encounter.enemyHp - next.enemyHp) + " damage dealt.";
                if (action == "fire-zone") combatMessage = "FIRE_ZONE deployed. " + combatMessage;
                stage.PresentCampaignFireZone(next.fireZoneTurns > 0);
                effects.PlaySfx(sound);
                if (action != "guard")
                    effects.PlayElement(Element(fighter.element), stage.CampaignEffectPosition);
                encounter = next;
            });
        }

        private void StartBoss()
        {
            var request = new Wave1BossPreviewRequest {
                mapId = map.id, petId = fighter.petId, actions = regularActions.ToArray(),
                bossActions = Array.Empty<string>()
            };
            Run(async () =>
            {
                encounter = await api.Post<Wave1Encounter>("/campaign/preview", request, lifetime.Token);
                boss = true;
                stage.PresentCampaignFireZone(false);
                combatMessage = "Boss encounter. HP and Rage reset.";
            });
        }

        private void SubmitMap()
        {
            Wave1PreviewRequest request = boss
                ? new Wave1BossPlayRequest { requestId = NewRequestId(), bossActions = bossActions.ToArray() }
                : new Wave1PlayRequest { requestId = NewRequestId() };
            request.mapId = map.id;
            request.petId = fighter.petId;
            request.actions = regularActions.ToArray();
            Run(async () =>
            {
                result = await api.Post<Wave1PlayResponse>("/campaign/play", request, lifetime.Token);
                ApplyState(result.state);
                var progressed = state.FindPet(fighter.petId);
                stage.PresentCampaignPet(Element(progressed.element), progressed.level);
                Show(Screen.Rewards);
                effects.PlaySfx(result.result.won ? ArenaSfx.Victory : ArenaSfx.Defeat);
                if (progressed.stage > fighter.stage) effects.PlaySfx(ArenaSfx.Evolution);
            });
        }

        private void DrawRewards()
        {
            content.Add(Label(map.name + (result.result.firstClear ? " · First clear" : ""), "arena-meta"));
            var rewards = result.result.rewards;
            content.Add(Label("+" + rewards.exp + " EXP  ·  +" + rewards.coins + " coins"));
            content.Add(Label(PetLabel(state.FindPet(fighter.petId)) + " · +" + rewards.levelsGained + " levels"));
            if (!string.IsNullOrEmpty(result.acquiredPetId))
                content.Add(Label("Recruited " + state.FindPet(result.acquiredPetId).name, "arena-notice"));
            Button("Choose another map", () => Navigate(Screen.Maps), "return-maps");
            Button("See evolution", () => Navigate(Screen.Collection), "reward-evolution");
            Button("Back to party", () => Navigate(Screen.Lobby));
        }

        private void DrawCollection()
        {
            var current = state.FindPet(selectedPet) ?? state.pets[0];
            content.Add(Label(PetLabel(current) + " · Lv " + current.level, "arena-notice"));
            content.Add(Label(current.level == 60 ? "Max level" : current.exp + "/" + current.expToNext + " EXP"));
            var milestones = new[] { 20, 40, 60 };
            var unlocks = new[] { "Power skill & Artifact C eligibility", "Signature & Artifact A eligibility", "Ultimate & Artifact S eligibility" };
            for (var index = 0; index < milestones.Length; index++)
                content.Add(Label("Lv " + milestones[index] + " · " + unlocks[index] +
                    (current.stage > index ? " ✓" : "")));
            foreach (var pet in state.pets)
                Button(PetLabel(pet), () =>
                {
                    selectedPet = pet.petId;
                    stage.PresentCampaignPet(Element(pet.element), pet.level);
                    effects.PlaySfx(ArenaSfx.UiClick);
                    Draw();
                }, "evolution-" + pet.petId);
            Button("Back to party", () => Navigate(Screen.Lobby), "evolution-back");
        }

        private void DrawGacha()
        {
            content.Add(Label("Limited S Icarus · Six Standard S off-rate Pets", "arena-meta"));
            content.Add(Label("S pity " + state.gacha.misses + "/80" +
                (state.gacha.guaranteed ? " · Next S is Icarus" : "")));
            Button("Pull once · 100 coins", () => Pull(1), "pull-one", state.wallet.coins >= 100);
            Button("Pull ten · 1,000 coins", () => Pull(10), "pull-ten", state.wallet.coins >= 1000);
            if (!string.IsNullOrEmpty(gachaSummary)) content.Add(Label(gachaSummary, "arena-notice"));
            Button("Back to party", () => Navigate(Screen.Lobby), "gacha-back");
            content.Add(Label("Recent pulls", "arena-meta"));
            foreach (var pull in state.gacha.history.Reverse().Take(20))
                content.Add(Label("#" + pull.seq + " · " + PullLabel(pull)));
        }

        private void Pull(int count)
        {
            var request = new Wave1PullRequest { requestId = NewRequestId(), count = count };
            Run(async () =>
            {
                var response = await api.Post<Wave1PullResponse>("/gacha/pull", request, lifetime.Token);
                var evolved = response.state.pets.Any(pet => pet.stage > (state.FindPet(pet.petId)?.stage ?? 0));
                ApplyState(response.state);
                gachaSummary = response.pulls.Length == 0 ? "No S Pets in this pull."
                    : string.Join(", ", response.pulls.Select(PullLabel));
                effects.PlaySfx(ArenaSfx.GachaPull);
                if (evolved) effects.PlaySfx(ArenaSfx.Evolution);
            });
        }

        private string PullLabel(Wave1Pull pull)
        {
            if (string.IsNullOrEmpty(pull.petId)) return "No S Pet";
            var name = state.FindPet(pull.petId)?.name ?? pull.petId;
            return name + (pull.duplicate ? " · Duplicate EXP" : pull.featured ? " · Featured" : "");
        }

        private void ApplyState(Wave1State value)
        {
            state = value;
            party.Clear();
            party.AddRange(value.party);
            if (state.FindPet(selectedPet) == null) selectedPet = party[0];
        }

        private void Navigate(Screen next)
        {
            if (next == Screen.Maps && !state.party.Contains(selectedPet)) selectedPet = state.party[0];
            if (next == Screen.Collection)
            {
                var pet = state.FindPet(selectedPet);
                stage.PresentCampaignPet(Element(pet.element), pet.level);
            }
            Show(next);
            Draw();
        }

        private void Show(Screen next)
        {
            screen = next;
            var bgm = next == Screen.Combat ? ArenaBgm.Battle : ArenaBgm.Lobby;
            if (effects.CurrentBgm != bgm) effects.PlayBgm(bgm);
            if (next != Screen.Combat) stage.PresentCampaignFireZone(false);
        }

        private async void Run(Func<Task> command)
        {
            if (busy) return;
            busy = true;
            retry = null;
            notice = null;
            Draw();
            try { await command(); }
            catch (Wave1ApiException error)
            {
                notice = error.Message;
                if (error.Status == 401 && loadedSession)
                {
                    loadedSession = false;
                    state = null;
                    Show(Screen.Session);
                    try { api.ForgetSession(); }
                    catch (Exception failure) when (failure is System.IO.IOException || failure is UnauthorizedAccessException)
                    {
                        notice = "Could not remove the expired local session.";
                    }
                }
                else if (error.Status >= 500 || error.Status == 429) retry = command;
            }
            catch (Exception error) when (error is HttpRequestException || error is OperationCanceledException ||
                                          error is System.IO.IOException || error is UnauthorizedAccessException)
            {
                if (this == null) return;
                notice = "The local API or session directory is unavailable. Try again.";
                retry = command;
            }
            finally
            {
                busy = false;
                if (this != null) Draw();
            }
        }

        private void Button(string text, Action action, string name = null, bool enabled = true)
        {
            var button = new Button(() =>
            {
                effects.PlaySfx(ArenaSfx.UiClick);
                action();
            }) { text = text, name = name };
            button.SetEnabled(enabled);
            content.Add(button);
        }

        private void Meter(string title, int value, int max)
        {
            var bar = new ProgressBar { title = title + " " + value + "/" + max, highValue = max, value = value };
            bar.AddToClassList("arena-meter");
            content.Add(bar);
        }

        private void FocusFirst()
        {
            content.schedule.Execute(() =>
            {
                var input = content.Q<TextField>();
                if (input != null) input.Focus();
                else content.Query<Button>().Where(button => button.enabledSelf).First()?.Focus();
            });
        }

        private static Label Label(string text, string className = null)
        {
            var label = new Label(text);
            if (className != null) label.AddToClassList(className);
            return label;
        }

        private static ArenaElement Element(string id) =>
            Enum.TryParse<ArenaElement>(id, true, out var element) ? element
                : throw new InvalidOperationException("Unknown Wave 1 element.");
        private static string PetLabel(Wave1Pet pet) => pet.name + " · " + Element(pet.element) + " · Lv " + pet.level;
        private static string NewRequestId() => Guid.NewGuid().ToString();
    }
}
