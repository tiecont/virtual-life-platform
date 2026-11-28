using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Aetheria.PetArena.Infrastructure;
using Aetheria.PetArena.Vfx;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    // Local authoritative Arena8 client. Every board cell, resource, skill
    // availability and terminal state comes from the Nest projection; Unity only
    // sends bounded intents and never calculates damage, rewards or outcomes.
    [RequireComponent(typeof(UIDocument))]
    public sealed partial class Arena8CampaignScreen : MonoBehaviour
    {
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private readonly HashSet<string> renderedReceipts = new HashSet<string>();
        private Wave1LocalApi api;
        private PetArenaMvpController stage;
        private PanelSettings panel;
        private VisualElement root, board;
        private ScrollView content;
        private Wave1Manifest chapterManifest;
        private Arena8RecruitmentCatalog recruitmentCatalog;
        private Wave1State state;
        private WaveAArtifactState artifacts;
        private Arena8View view;
        private string matchId, selectedPet = "fire-coalwhisk", selectedMap = "cinder-terraces";
        private string displayName = "Arena Guest " + Guid.NewGuid().ToString("N").Substring(0, 6);
        private string notice = "";
        private string settlementText = "";
        private string webOrigin;
        private int selectedCell = -1;
        private bool busy, boss, loadedSession;

        public void Initialize(PetArenaMvpController arena, string origin)
        {
            stage = arena;
            webOrigin = Environment.GetEnvironmentVariable("AETHERIA_WAVE1_WEB_ORIGIN") ?? "http://127.0.0.1:3300";
            ArenaPresentationKit.Ensure(gameObject).PlayBgm(ArenaBgm.Lobby);
            BuildDocument();
            ConfigureTransport();
            if (nativeUnavailable) notice = UnconfiguredTransportNotice();
            else
            {
                try
                {
                    api = new Wave1LocalApi(TransportOrigin(origin), webOrigin, Application.persistentDataPath);
                    loadedSession = api.LoadSession();
                }
                catch (Exception exception)
                {
                    notice = "Check the local API and session directory: " + exception.Message;
                }
            }
            Draw();
            if (NativeCaptureDirectory() != null)
            {
                _ = AutomatedNativeAcceptance();
                return;
            }
            if (CaptureDirectory() != null)
            {
                _ = ResumeRequested() ? AutomatedResume() : AutomatedAcceptance();
                return;
            }
            if (loadedSession) Run(LoadLobby, "Loading your roster");
        }

        private void OnDestroy()
        {
            lifetime.Cancel();
            DisposeNative();
            api?.Dispose();
            lifetime.Dispose();
            if (panel != null) Destroy(panel);
        }

        private void BuildDocument()
        {
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
            root.style.flexGrow = 1;
        }

        private static Label Label(string text, string className = null)
        {
            var label = new Label(text);
            if (!string.IsNullOrEmpty(className)) label.AddToClassList(className);
            label.style.whiteSpace = WhiteSpace.Normal;
            return label;
        }

        private void Button(string text, Action action, string className = null, bool enabled = true)
        {
            var button = new Button(action) { text = text };
            button.SetEnabled(enabled);
            if (!string.IsNullOrEmpty(className)) button.AddToClassList(className);
            content.Add(button);
        }

        private static string NewRequestId() => Guid.NewGuid().ToString();

        private void Draw()
        {
            if (functionalHud != null) return;
            root.Clear();
            CampaignLocale.ApplyFont(root);
            if (nativeMode && nativeView?.Terminal == false)
            {
                DrawNativeCombat();
                FocusFirst();
                return;
            }
            var panelElement = new VisualElement();
            panelElement.AddToClassList("arena-panel");
            panelElement.style.paddingLeft = 24;
            panelElement.style.paddingRight = 24;
            panelElement.style.paddingTop = 18;
            panelElement.style.paddingBottom = 18;
            root.Add(panelElement);
            panelElement.Add(Label(CampaignLocale.Text("brand.title", "Aetheria: SoulBound"), "arena-eyebrow"));
            panelElement.Add(Label(CampaignLocale.Text("brand.subtitle", "Pet Arena"), "arena-title"));
            var transport = nativeMode ? "native arena8.view.v1" : "HTTP compatibility bridge";
            var meta = state == null ? "Local authoritative campaign · " + transport :
                state.wallet.coins + " coins · " + state.campaign.clearedMaps.Length + " chapters cleared · " + transport;
            panelElement.Add(Label(meta, "arena-meta"));
            if (!string.IsNullOrEmpty(notice)) panelElement.Add(Label(notice, "arena-notice"));

            content = new ScrollView();
            content.style.flexGrow = 1;
            panelElement.Add(content);
            if (busy)
            {
                content.Add(Label("Contacting the local authoritative API…"));
                return;
            }
            if (nativeUnavailable)
            {
                content.Add(Label(notice));
                return;
            }
            if (api == null)
            {
                content.Add(Label("The loopback API is unavailable."));
                return;
            }
            if (!loadedSession) DrawSession();
            else if (state == null) content.Add(Label("Loading the persisted roster and campaign…"));
            else if (nativeMode && nativeView != null) DrawNativeTerminal();
            else if (!nativeMode && view != null && !view.terminal) DrawCombat();
            else if (!nativeMode && view != null) DrawTerminal();
            else DrawLobby();
            if (!loadedSession || (view == null && nativeView == null)) CampaignLocale.AddSelector(content, Draw);
            FocusFirst();
        }

        private void DrawSession()
        {
            content.Add(Label("Create or resume a local guest session. The session is stored under the player's persistent data directory."));
            var name = new TextField("Display name") { value = displayName, maxLength = 24 };
            name.RegisterValueChangedCallback(change => displayName = change.newValue);
            content.Add(name);
            Button("Enter local arena", () => Run(async () =>
            {
                await api.CreateGuest(displayName, NewRequestId(), lifetime.Token);
                loadedSession = true;
                await LoadLobby();
            }, "Creating session"));
        }

        private async Task LoadLobby()
        {
            recruitmentCatalog = null;
            chapterManifest ??= await api.Get<Wave1Manifest>("/manifest", lifetime.Token);
            if (chapterManifest?.maps == null || chapterManifest.maps.Length == 0)
                throw new InvalidOperationException("Campaign chapters are unavailable.");
            state = await api.GetWave1State(lifetime.Token);
            artifacts = await api.GetArtifactState(lifetime.Token);
            DisposeNative();
            view = null;
            matchId = null;
            if (!chapterManifest.maps.Any(map => map.id == selectedMap && ChapterOpen(map.id)))
            {
                selectedMap = chapterManifest.maps.FirstOrDefault(map => ChapterOpen(map.id))?.id;
                boss = false;
            }
            if (state.FindPet(selectedPet) == null)
                selectedPet = state.pets.FirstOrDefault()?.petId;
            DrawLobby();
        }

        private bool ChapterOpen(string id) =>
            state.campaign.nextMapId == id || state.campaign.clearedMaps.Contains(id);

        private void DrawLobby()
        {
            content.Add(Label(CampaignLocale.Text("nav.my_pets", "My Pets"), "arena-title"));
            foreach (var pet in state.pets)
            {
                var chosen = pet.petId == selectedPet;
                Button((chosen ? "● " : "○ ") + pet.name + " · Lv" + pet.level,
                    () => { selectedPet = pet.petId; Draw(); }, enabled: true);
            }

            content.Add(Label(CampaignLocale.Text("nav.campaign_regular", "Campaign Map"), "arena-title"));
            foreach (var chapter in chapterManifest.maps)
            {
                var open = ChapterOpen(chapter.id);
                foreach (var bossEncounter in new[] { false, true })
                {
                    var selected = chapter.id == selectedMap && bossEncounter == boss;
                    Button(CampaignLocale.Text("map." + chapter.id.Replace('-', '_'), chapter.name) + (bossEncounter ? " · Boss" : " · Regular") +
                        (open ? (selected ? " · selected" : "") : " · Locked"),
                        () => { selectedMap = chapter.id; boss = bossEncounter; Draw(); }, enabled: open);
                }
            }

            if (UsesFunctionalBoard)
            {
                var title = CampaignLocale.Text("map.recruitment", "Recruitment encounters");
                Button(title, () => Run(async () =>
                {
                    recruitmentCatalog = await api.GetRecruitmentCatalog(lifetime.Token);
                }, title));
                if (recruitmentCatalog?.routes != null)
                {
                    if (recruitmentCatalog.routes.Length == 0)
                        content.Add(Label(CampaignLocale.Text("map.no_recruitment", "No recruitment encounters available.")));
                    var names = recruitmentCatalog.routes.ToDictionary(route => route.id, route => route.name);
                    foreach (var route in recruitmentCatalog.routes)
                    {
                        var mapName = CampaignLocale.Text("map." + route.mapId.Replace('-', '_'), route.mapId);
                        var routeLabel = mapName + " · " + route.name + (route.cleared ? " ✓" : "");
                        if (!route.canEnterSolo && route.prerequisiteEncounterId != null &&
                            names.TryGetValue(route.prerequisiteEncounterId, out var prerequisite))
                            routeLabel += " · " + CampaignLocale.Text("map.requires_clear", "Requires clear") + " " + prerequisite;
                        Button(routeLabel, () => Run(() => AllocateMatch(route.mapId, route.id), route.name),
                            enabled: route.canEnterSolo && state.FindPet(selectedPet) != null);
                    }
                }
            }

            content.Add(Label(CampaignLocale.Text("nav.artifacts", "Artifacts & Bag"), "arena-title"));
            var petArtifact = artifacts?.FindPet(selectedPet);
            content.Add(Label(petArtifact == null ? "No Artifact snapshot yet." :
                "Equipped: core=" + (petArtifact.slots.core ?? "—") +
                " aegis=" + (petArtifact.slots.aegis ?? "—") +
                " rune=" + (petArtifact.slots.rune ?? "—") + " · materials=" + artifacts.materials));
            var candidate = artifacts?.inventory?.FirstOrDefault(item => item.Equipment == null);
            if (candidate != null)
                Button("Equip " + candidate.name + " (" + candidate.slot + ")", () => Run(async () =>
                {
                    await api.EquipArtifact(new WaveAArtifactEquipRequest
                    {
                        requestId = NewRequestId(), petId = selectedPet, artifactId = candidate.artifactId,
                    }, lifetime.Token);
                    artifacts = await api.GetArtifactState(lifetime.Token);
                    Draw();
                }, "Equipping Artifact"));

            var map = selectedMap;
            var encounter = map + (boss ? "-boss" : "-regular");
            var label = UsesFunctionalBoard ? "Enter functional battle" : "Enter authoritative match";
            Button(label, () => Run(() => AllocateMatch(map, encounter), "Allocating match"),
                enabled: map != null && ChapterOpen(map));
            if (!string.IsNullOrEmpty(notice)) content.Add(Label(notice));
        }

        private async Task Allocate(string map, string encounter)
        {
            if (state.FindPet(selectedPet) == null)
                throw new InvalidOperationException("Choose an owned Pet first.");
            var response = await api.AllocateArena8(new Arena8AllocateRequest
            {
                requestId = NewRequestId(), petId = selectedPet, mapId = map, encounterId = encounter,
            }, lifetime.Token);
            matchId = response.matchId;
            view = response.view;
            selectedCell = -1;
            settlementText = "";
            notice = "";
            renderedReceipts.Clear();
            Draw();
        }

        private async Task Send(object action)
        {
            if (view == null || matchId == null) return;
            Arena8CommandResponse response;
            switch (action)
            {
                case Arena8StartCommandRequest start:
                    response = await api.CommandArena8(start, lifetime.Token); break;
                case Arena8GuardCommandRequest guard:
                    response = await api.CommandArena8(guard, lifetime.Token); break;
                case Arena8SwapCommandRequest swap:
                    response = await api.CommandArena8(swap, lifetime.Token); break;
                case Arena8SkillCommandRequest skill:
                    response = await api.CommandArena8(skill, lifetime.Token); break;
                default: throw new ArgumentException("Unsupported Arena8 action");
            }
            var receiptKey = matchId + ":" + response.receiptId;
            if (renderedReceipts.Add(receiptKey))
                notice = response.events == null ? "" : response.events.Length + " committed events · v" + response.version;
            view = response.view;
            selectedCell = -1;
            Draw();
        }

        private void DrawCombat()
        {
            content.Add(Label("Match " + matchId.Substring(0, 8) + " · v" + view.version + " · " + view.phase, "arena-meta"));
            content.Add(Label("HP " + view.health + " / enemy " + view.enemyHealth +
                " · shield " + view.enemyShield, "arena-title"));
            content.Add(Label("Mana " + view.mana + " · Rage " + view.rage + " · Cooldown " + view.cooldown +
                " · FireZone " + view.fireZoneTurns + " · Turn " + view.turn));
            if (view.telegraph != null)
                content.Add(Label("Telegraph: " + view.telegraph.kind + " " + view.telegraph.axis +
                    " " + view.telegraph.target + " resolves turn " + view.telegraph.resolvesTurn, "arena-notice"));

            board = new VisualElement();
            board.style.flexDirection = FlexDirection.Row;
            board.style.flexWrap = Wrap.Wrap;
            board.style.width = 520;
            for (var index = 0; index < view.board.Length; index++)
            {
                var cell = index;
                var button = new Button(() => SelectCell(cell))
                {
                    text = ElementName(view.board[cell]),
                };
                button.style.width = 58;
                button.style.height = 48;
                button.style.marginRight = 2;
                button.style.marginBottom = 2;
                if (cell == selectedCell) button.style.borderBottomWidth = 4;
                board.Add(button);
            }
            content.Add(board);
            content.Add(Label(selectedCell < 0 ? "Select a tile, then an adjacent tile to swap."
                : "Selected " + selectedCell + ". Choose an adjacent tile."));

            if (view.phase == "ready")
                Button("Start match", () => Run(() => Send(new Arena8StartCommandRequest
                {
                    requestId = NewRequestId(), matchId = matchId, expectedVersion = view.version,
                }), "Starting match"), "start-match");
            else
            {
                foreach (var skill in view.skills)
                {
                    var id = skill.id;
                    Button((skill.id + " · Lv" + skill.skillLevel) + (skill.canCast ? "" : " · " + skill.reason),
                        () => Run(() => SendSkill(id), "Casting " + id), enabled: skill.canCast);
                }
                Button("Guard", () => Run(() => Send(new Arena8GuardCommandRequest
                {
                    requestId = NewRequestId(), matchId = matchId, expectedVersion = view.version,
                }), "Guarding"));
            }
        }

        private Task SendSkill(string id)
        {
            var kind = id == "shared-skill" ? "skill" :
                id == "fire-zone" ? "fireZone" : id;
            var skill = new Arena8SkillAction { kind = kind };
            return Send(new Arena8SkillCommandRequest
            {
                requestId = NewRequestId(), matchId = matchId, expectedVersion = view.version, action = skill,
            });
        }

        private void SelectCell(int cell)
        {
            if (view == null || view.terminal) return;
            if (selectedCell < 0)
            {
                selectedCell = cell;
                Draw();
                return;
            }
            if (Math.Abs(selectedCell - cell) != 1 && Math.Abs(selectedCell - cell) != 8)
            {
                notice = "Choose an adjacent tile.";
                selectedCell = cell;
                Draw();
                return;
            }
            var first = selectedCell;
            selectedCell = -1;
            Run(() => Send(new Arena8SwapCommandRequest
            {
                requestId = NewRequestId(), matchId = matchId, expectedVersion = view.version,
                action = new Arena8SwapAction { first = first, second = cell },
            }), "Swapping tiles");
        }

        private void DrawTerminal()
        {
            content.Add(Label(view.phase == "won" ? "Victory" : "Defeat", "arena-title"));
            content.Add(Label("Authoritative terminal receipt · match " + matchId));
            if (string.IsNullOrEmpty(settlementText))
                Button("Settle match", () => Run(async () =>
                {
                    var settlement = await api.SettleArena8(matchId, new Arena8SettleRequest
                    {
                        requestId = NewRequestId(),
                    }, lifetime.Token);
                    settlementText = "Settlement: " + (settlement.won ? "victory" : "defeat") +
                        " · +" + settlement.coins + " coins · +" + settlement.exp + " EXP" +
                        (settlement.recruitedPetId == null ? "" : " · recruited " + settlement.recruitedPetId) +
                        (settlement.artifactId == null ? "" : " · Artifact " + settlement.artifactId) +
                        " · materials " + settlement.materials;
                    state = await api.GetWave1State(lifetime.Token);
                    artifacts = await api.GetArtifactState(lifetime.Token);
                    Draw();
                }, "Settling match"));
            else
            {
                content.Add(Label(settlementText, "arena-notice"));
                Button("Return to roster / next match", () => Run(LoadLobby, "Loading roster"));
            }
        }

        private void Run(Func<Task> operation, string busyText)
        {
            if (busy) return;
            busy = true;
            notice = busyText;
            Draw();
            _ = RunAsync(operation);
        }

        private async Task RunAsync(Func<Task> operation)
        {
            try
            {
                await operation();
                notice = "";
            }
            catch (OperationCanceledException) { return; }
            catch (Exception exception)
            {
                notice = exception.Message;
            }
            finally
            {
                busy = false;
                if (!lifetime.IsCancellationRequested) Draw();
            }
        }

        private void FocusFirst()
        {
            var first = content?.Children().OfType<Button>().FirstOrDefault();
            first?.Focus();
        }

        private static string ElementName(int element)
        {
            switch (element)
            {
                case 0: return "Ash";
                case 1: return "Ember";
                case 2: return "Tide";
                case 3: return "Storm";
                case 4: return "Stone";
                case 5: return "Light";
                default: return "?";
            }
        }
    }
}
