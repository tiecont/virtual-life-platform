using System;
using System.Collections.Generic;
using Aetheria.PetArena.Domain;
using Aetheria.PetArena.Vfx;
using Aetheria.Pets.Presentation;
using Aetheria.RemoteContent;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetheria.PetArena.Presentation
{
    public sealed class PetArenaMvpController : MonoBehaviour
    {
        [SerializeField] private PetEvolutionController playerEvolution;
        [SerializeField] private PetEvolutionProfile evolutionProfile;
        [SerializeField] private R2RemoteContentSettings remoteSettings;
        [SerializeField] private bool reducedMotion = true;
        [SerializeField] private bool buildDeveloperStage = true;

        private readonly List<Renderer> arenaTiles = new List<Renderer>();
        private readonly Queue<string> combatLog = new Queue<string>();
        private readonly Color[] elementColors = {
            new Color(.72f, .72f, .68f),
            new Color(1f, .28f, .05f),
            new Color(.16f, .58f, .98f),
            new Color(.24f, .78f, .28f),
            new Color(1f, .82f, .12f),
            new Color(.42f, .9f, 1f),
        };

        private ArenaBattle battle;
        private Transform playerRoot;
        private Transform enemyRoot;
        private Renderer enemyRenderer;
        private Renderer playerRenderer;
        private Material runtimeMaterial;
        private MaterialPropertyBlock properties;
        private string status = "OFFLINE TRAINING / server authority not connected";
        private float presentationPulse;
        private bool initialized;
        private bool campaignMode;
        private bool campaignFireZone;
        private const int CampaignZoneStart = (ArenaBattle.BoardSize - ArenaBattle.FireZoneSide) / 2;
        private Color campaignPlayerColor, campaignEnemyColor;

        public Vector3 CampaignEffectPosition => enemyRoot != null
            ? enemyRoot.position : transform.TransformPoint(7.2f, 0, 1.5f);

        public ArenaBattle Battle => battle;
        public PetEvolutionController PlayerEvolution => playerEvolution;
        public bool ReducedMotion => reducedMotion;
        public string Status => status;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void OpenCampaignInPlayer()
        {
            if (!Application.isEditor && SceneManager.GetActiveScene().name == "AuroraBlockout" &&
                (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AETHERIA_WAVE1_API")) ||
                 !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AETHERIA_ARENA8_API"))))
                SceneManager.LoadSceneAsync("PetArenaPve");
        }

        private void Awake()
        {
            properties = new MaterialPropertyBlock();
            runtimeMaterial = CreateRuntimeMaterial();
            battle = new ArenaBattle(PetElement.Grass, PetElement.Fire, 120, 120, 7);
            if (buildDeveloperStage && arenaTiles.Count == 0) BuildDeveloperStage();
            playerEvolution = playerEvolution != null
                ? playerEvolution
                : FindFirstObjectByType<PetEvolutionController>();
            if (playerEvolution != null && evolutionProfile != null)
                playerEvolution.Bind(evolutionProfile);
            initialized = true;
            ApplyPresentation();
            // Native transport is selected by its own HTTPS origin; the frozen HTTP
            // compatibility bridge stays an explicit, default-off opt-in.
            var nativeOrigin = Environment.GetEnvironmentVariable(Arena8CampaignScreen.NativeOriginVariable);
            var arena8Origin = !string.IsNullOrWhiteSpace(nativeOrigin)
                ? nativeOrigin
                : Environment.GetEnvironmentVariable("AETHERIA_ARENA8_API");
            var wave1Origin = Environment.GetEnvironmentVariable("AETHERIA_WAVE1_API");
            if (!string.IsNullOrWhiteSpace(arena8Origin))
            {
                campaignMode = true;
                campaignPlayerColor = Color.white;
                campaignEnemyColor = Color.white;
                gameObject.AddComponent<Arena8CampaignScreen>().Initialize(this, arena8Origin);
            }
            else if (!string.IsNullOrWhiteSpace(wave1Origin))
            {
                campaignMode = true;
                campaignPlayerColor = Color.white;
                campaignEnemyColor = Color.white;
                gameObject.AddComponent<Wave1CampaignScreen>().Initialize(this, wave1Origin);
            }
        }

        public void PresentCampaignPet(ArenaElement element, int level)
        {
            campaignPlayerColor = ArenaPresentationKit.ElementColor(element);
            playerEvolution?.SetLevel(level);
            ApplyPresentation();
        }

        public void PresentCampaignOpponent(ArenaElement element)
        {
            campaignEnemyColor = ArenaPresentationKit.ElementColor(element);
            ApplyPresentation();
        }

        public void PresentCampaignFireZone(bool active)
        {
            campaignFireZone = active;
            ApplyPresentation();
        }

        private void Update()
        {
            if (!initialized) return;
            presentationPulse = Mathf.Max(0, presentationPulse - Time.unscaledDeltaTime);
            if (!reducedMotion && enemyRoot != null)
                enemyRoot.localScale = Vector3.one * (1f + presentationPulse * .08f);
            if (!campaignMode) HandleKeyboard();
        }

        private void HandleKeyboard()
        {
            if (Input.GetKeyDown(KeyCode.Alpha1) && battle.Phase == ArenaPhase.Intro)
                Perform(ArenaAction.Intro);
            if (Input.GetKeyDown(KeyCode.N) && battle.Phase == ArenaPhase.PlayerTurn)
                Perform(ArenaAction.Normal);
            if (Input.GetKeyDown(KeyCode.R) && battle.Phase == ArenaPhase.PlayerTurn)
                Perform(ArenaAction.Rage);
            if (Input.GetKeyDown(KeyCode.F) && battle.Phase == ArenaPhase.PlayerTurn)
                Perform(ArenaAction.Signature);
            if (Input.GetKeyDown(KeyCode.Tab) && battle.Phase == ArenaPhase.Intro)
                SelectEnemy((PetElement)(((int)battle.EnemyElement + 1) %
                    ElementalMatchup.ElementCount));
            if (Input.GetKeyDown(KeyCode.X)) ResetBattle();
            if (Input.GetKeyDown(KeyCode.L) && playerEvolution != null)
                playerEvolution.SetLevel(NextEvolutionLevel(playerEvolution.Level));
        }

        public ArenaActionResult Perform(ArenaAction action)
        {
            var result = battle.Perform(action);
            status = result.Message;
            if (result.Accepted)
            {
                AppendLog(result.Message + "  Damage " + result.Damage +
                    (result.Retaliation > 0 ? " / retaliation " + result.Retaliation : string.Empty));
                if (action == ArenaAction.Signature && !reducedMotion) presentationPulse = .28f;
                if (action == ArenaAction.Intro)
                    status = "Icarus enters. Select a skill or press N for a normal attack.";
            }
            ApplyPresentation();
            return result;
        }

        public bool SelectEnemy(PetElement element)
        {
            var changed = battle.SelectEnemyElement(element);
            if (changed)
            {
                status = "Training opponent: " + ElementalMatchup.Label(element) +
                    " / " + ElementalMatchup.Compare(battle.PlayerElement, element);
                ApplyPresentation();
            }
            return changed;
        }

        public void ResetBattle()
        {
            battle.Reset(battle.EnemyElement);
            combatLog.Clear();
            status = "Ready. Choose an opponent element, then press Intro.";
            ApplyPresentation();
        }

        public void SetReducedMotion(bool value)
        {
            reducedMotion = value;
            if (enemyRoot != null) enemyRoot.localScale = Vector3.one;
        }

        public void SetLevel(int level)
        {
            if (playerEvolution == null) return;
            playerEvolution.SetLevel(level);
            // Wave A: level growth unlocks skills/Artifact eligibility. Optional
            // cosmetics are not mandatory Lv20/40/60 visual evolution forms, so
            // the approved base silhouette remains visible at every level.
            if (playerEvolution.Halo != null) playerEvolution.Halo.gameObject.SetActive(false);
            if (playerEvolution.Wings != null) playerEvolution.Wings.gameObject.SetActive(false);
            if (playerEvolution.Aura != null) playerEvolution.Aura.gameObject.SetActive(false);
            if (playerEvolution.MaxVfx != null) playerEvolution.MaxVfx.gameObject.SetActive(false);
            AppendLog("Level presentation set to Lv " + level + " / base silhouette preserved; skills and Artifact eligibility updated.");
        }

        private void ApplyPresentation()
        {
            if (battle == null) return;
            if (enemyRenderer != null) SetColor(enemyRenderer, campaignMode ? campaignEnemyColor : elementColors[(int)battle.EnemyElement]);
            if (playerEvolution != null && playerRenderer != null)
                SetColor(playerRenderer, campaignMode ? campaignPlayerColor : elementColors[(int)battle.PlayerElement]);
            for (var index = 0; index < arenaTiles.Count; index++)
            {
                var column = index % ArenaBattle.BoardSize;
                var row = index / ArenaBattle.BoardSize;
                var zone = campaignMode
                    ? campaignFireZone && IsCampaignZoneCell(column, row)
                    : battle.IsFireZoneCell(column, row);
                var baseColor = (row + column) % 2 == 0
                    ? new Color(.12f, .17f, .25f)
                    : new Color(.17f, .23f, .34f);
                if (zone) baseColor = Lerp(baseColor, elementColors[(int)PetElement.Fire], .7f);
                SetColor(arenaTiles[index], baseColor);
            }
        }

        private static bool IsCampaignZoneCell(int column, int row)
        {
            const int end = CampaignZoneStart + ArenaBattle.FireZoneSide;
            return column >= CampaignZoneStart && column < end && row >= CampaignZoneStart && row < end;
        }

        private void BuildDeveloperStage()
        {
            gameObject.name = "Pet Arena PvE";
            BuildBoard();
            BuildPlayer();
            BuildEnemy();
            BuildLightingAndCamera();
            status = "Ready. Choose an opponent element, then press Intro.";
        }

        private void BuildBoard()
        {
            var board = new GameObject("8x8 Arena Board").transform;
            board.SetParent(transform, false);
            var center = (ArenaBattle.BoardSize - 1) * .5f;
            for (var row = 0; row < ArenaBattle.BoardSize; row++)
            for (var column = 0; column < ArenaBattle.BoardSize; column++)
            {
                var tile = CreatePart(board, "Tile " + column + "," + row, PrimitiveType.Cube,
                    new Vector3(column, 0, row), new Vector3(.94f, .08f, .94f),
                    new Color(.12f, .17f, .25f));
                arenaTiles.Add(tile.GetComponent<Renderer>());
            }
            var rim = CreatePart(board, "Arena Rim", PrimitiveType.Cube,
                new Vector3(center, -.15f, center), new Vector3(9f, .12f, 9f),
                new Color(.04f, .06f, .1f));
            Destroy(rim.GetComponent<Collider>());
        }

        private void BuildPlayer()
        {
            var root = new GameObject("Icarus Evolution Reference").transform;
            root.SetParent(transform, false);
            root.localPosition = new Vector3(2.5f, 1.15f, 6.6f);
            playerRoot = root;

            var body = CreatePart(root, "Icarus Body", PrimitiveType.Capsule, Vector3.zero,
                new Vector3(.9f, 1.2f, .7f), elementColors[(int)PetElement.Fire]);
            playerRenderer = body.GetComponent<Renderer>();
            var head = CreatePart(root, "Icarus Head", PrimitiveType.Sphere,
                new Vector3(0, 1.2f, 0), Vector3.one * .62f, new Color(.94f, .76f, .64f));
            Destroy(head.GetComponent<Collider>());

            var bow = CreatePart(root, "Socket_Bow", PrimitiveType.Cube,
                new Vector3(.72f, .1f, 0), new Vector3(.08f, 1.2f, .08f),
                new Color(1f, .72f, .22f));
            bow.transform.SetParent(root, false);
            var halo = CreatePart(root, "Socket_Halo", PrimitiveType.Cylinder,
                new Vector3(0, 1.72f, 0), new Vector3(.72f, .08f, .72f),
                new Color(1f, .78f, .22f));
            var wings = new GameObject("Socket_Wings").transform;
            wings.SetParent(root, false);
            wings.localPosition = new Vector3(0, .65f, -.4f);
            CreatePart(wings, "Wing L", PrimitiveType.Cube, new Vector3(-.62f, 0, 0),
                new Vector3(.08f, .9f, .48f), new Color(.95f, .62f, .18f));
            CreatePart(wings, "Wing R", PrimitiveType.Cube, new Vector3(.62f, 0, 0),
                new Vector3(.08f, .9f, .48f), new Color(.95f, .62f, .18f));
            var aura = CreatePart(root, "Aura", PrimitiveType.Cylinder,
                new Vector3(0, -1.06f, 0), new Vector3(1.4f, .025f, 1.4f),
                new Color(1f, .55f, .08f, .55f));
            var maxVfx = CreatePart(root, "MaxVFX", PrimitiveType.Cylinder,
                new Vector3(0, 1.95f, 0), new Vector3(.95f, .025f, .95f),
                new Color(1f, .82f, .2f, .65f));

            var evolution = root.gameObject.AddComponent<PetEvolutionController>();
            evolution.Bind(root, new[] {playerRenderer, head.GetComponent<Renderer>()},
                new[] {playerRenderer});
            evolution.SetLevel(20);
            playerEvolution = evolution;
            SetVisible(halo, false);
            SetVisible(aura, false);
            SetVisible(wings.gameObject, false);
            SetVisible(maxVfx, false);
            SetVisible(bow, true);
        }

        private void BuildEnemy()
        {
            enemyRoot = new GameObject("Training Opponent").transform;
            enemyRoot.SetParent(transform, false);
            enemyRoot.localPosition = new Vector3(6.2f, 1.05f, 1.5f);
            var body = CreatePart(enemyRoot, "Opponent Core", PrimitiveType.Sphere, Vector3.zero,
                new Vector3(1.15f, 1.05f, 1f), elementColors[(int)PetElement.Grass]);
            enemyRenderer = body.GetComponent<Renderer>();
            for (var side = -1; side <= 1; side += 2)
            {
                var horn = CreatePart(enemyRoot, "Horn " + side, PrimitiveType.Cube,
                    new Vector3(side * .55f, .88f, 0), new Vector3(.14f, .55f, .14f),
                    new Color(.9f, .9f, .82f));
                horn.transform.localRotation = Quaternion.Euler(0, 0, side * -20);
            }
        }

        private void BuildLightingAndCamera()
        {
            if (FindFirstObjectByType<Light>() == null)
            {
                var lightObject = new GameObject("Arena Key Light");
                lightObject.transform.SetParent(transform, false);
                lightObject.transform.rotation = Quaternion.Euler(48, -32, 0);
                var light = lightObject.AddComponent<Light>();
                light.type = LightType.Directional;
                light.intensity = 1.15f;
                light.color = new Color(1f, .88f, .72f);
            }
            if (FindFirstObjectByType<Camera>() != null) return;
            var cameraObject = new GameObject("Arena Camera");
            cameraObject.tag = "MainCamera";
            cameraObject.transform.SetParent(transform, false);
            cameraObject.transform.position = new Vector3(3.5f, 7.6f, -6.2f);
            cameraObject.transform.LookAt(new Vector3(3.5f, .6f, 3.5f));
            var camera = cameraObject.AddComponent<Camera>();
            camera.fieldOfView = 48f;
            camera.backgroundColor = new Color(.025f, .04f, .08f);
            camera.clearFlags = CameraClearFlags.SolidColor;
        }

        private GameObject CreatePart(Transform parent, string name, PrimitiveType primitive,
            Vector3 localPosition, Vector3 localScale, Color color)
        {
            var part = GameObject.CreatePrimitive(primitive);
            part.name = name;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPosition;
            part.transform.localScale = localScale;
            var collider = part.GetComponent<Collider>();
            if (collider != null) Destroy(collider);
            var renderer = part.GetComponent<Renderer>();
            renderer.sharedMaterial = runtimeMaterial;
            SetColor(renderer, color);
            return part;
        }

        private Material CreateRuntimeMaterial()
        {
            var shared = Resources.Load<Material>("BlockoutLit");
            if (shared != null) return new Material(shared);
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            return new Material(shader);
        }

        private void SetColor(Renderer renderer, Color color)
        {
            if (renderer == null) return;
            if (properties == null) properties = new MaterialPropertyBlock();
            renderer.GetPropertyBlock(properties);
            properties.SetColor("_BaseColor", color);
            properties.SetColor("_Color", color);
            renderer.SetPropertyBlock(properties);
        }

        private void AppendLog(string line)
        {
            combatLog.Enqueue(line);
            while (combatLog.Count > 5) combatLog.Dequeue();
        }

        private static int NextEvolutionLevel(int level)
        {
            if (level < 20) return 20;
            if (level < 40) return 40;
            if (level < 60) return 60;
            return 1;
        }

        private static Color Lerp(Color first, Color second, float amount) =>
            Color.Lerp(first, second, amount);

        private static void SetVisible(GameObject target, bool visible)
        {
            if (target != null) target.SetActive(visible);
        }

        private void OnGUI()
        {
            if (battle == null || campaignMode) return;
            DrawHeader();
            DrawBars();
            DrawOpponentChoice();
            DrawActions();
            DrawEvolution();
            DrawLog();
        }

        private void DrawHeader()
        {
            var header = new GUIStyle(GUI.skin.label) {
                fontSize = 22, fontStyle = FontStyle.Bold,
                normal = {textColor = new Color(1f, .85f, .52f)}
            };
            GUI.Label(new Rect(24, 18, 900, 34), "AETHERIA / PET ARENA PvE / OFFLINE MVP", header);
            GUI.Label(new Rect(24, 50, 820, 26), status);
        }

        private void DrawBars()
        {
            Bar(new Rect(24, 88, 340, 24), "Icarus HP " + battle.PlayerHealth + "/" +
                battle.PlayerMaximumHealth, battle.PlayerHealth / (float)battle.PlayerMaximumHealth,
                new Color(.88f, .2f, .18f));
            Bar(new Rect(24, 118, 340, 18), "Rage " + battle.Rage + "/" + ArenaBattle.MaxRage,
                battle.Rage / (float)ArenaBattle.MaxRage, new Color(1f, .62f, .08f));
            Bar(new Rect(24, 142, 340, 24), ElementalMatchup.Label(battle.EnemyElement) +
                " HP " + battle.EnemyHealth + "/" + battle.EnemyMaximumHealth,
                battle.EnemyHealth / (float)battle.EnemyMaximumHealth, elementColors[(int)battle.EnemyElement]);
        }

        private void DrawOpponentChoice()
        {
            GUI.Label(new Rect(24, 182, 340, 22), "Turn " + battle.Turn + " / " +
                (battle.Phase == ArenaPhase.Intro ? "INTRO" : battle.Phase.ToString().ToUpperInvariant()));
            if (battle.Phase != ArenaPhase.Intro) return;
            for (var index = 0; index < ElementalMatchup.ElementCount; index++)
            {
                var element = (PetElement)index;
                if (GUI.Button(new Rect(24 + index * 55, 210, 50, 28), ElementalMatchup.Label(element)))
                    SelectEnemy(element);
            }
        }

        private void DrawActions()
        {
            var enabled = GUI.enabled;
            GUI.enabled = battle.Phase == ArenaPhase.Intro;
            if (GUI.Button(new Rect(24, 252, 150, 34), "Intro [1]")) Perform(ArenaAction.Intro);
            GUI.enabled = battle.Phase == ArenaPhase.PlayerTurn;
            if (GUI.Button(new Rect(182, 252, 150, 34), "Normal [N]")) Perform(ArenaAction.Normal);
            if (GUI.Button(new Rect(24, 294, 150, 34), "Rage [R]")) Perform(ArenaAction.Rage);
            if (GUI.Button(new Rect(182, 294, 150, 34), "FIRE_ZONE [F]")) Perform(ArenaAction.Signature);
            GUI.enabled = true;
            if (GUI.Button(new Rect(24, 336, 150, 30), "Reset [X]")) ResetBattle();
            reducedMotion = GUI.Toggle(new Rect(182, 337, 150, 26), reducedMotion, "Reduced motion");
            GUI.enabled = enabled;
        }

        private void DrawEvolution()
        {
            if (playerEvolution == null) return;
            GUI.Box(new Rect(24, 386, 340, 92), "Evolution");
            GUI.Label(new Rect(36, 410, 315, 24), "Lv " + playerEvolution.Level + " / " +
                playerEvolution.CurrentStage);
            if (GUI.Button(new Rect(36, 438, 72, 28), "Lv 1")) SetLevel(1);
            if (GUI.Button(new Rect(114, 438, 72, 28), "Lv 20")) SetLevel(20);
            if (GUI.Button(new Rect(192, 438, 72, 28), "Lv 40")) SetLevel(40);
            if (GUI.Button(new Rect(270, 438, 72, 28), "Lv 60")) SetLevel(60);
        }

        private void DrawLog()
        {
            GUI.Box(new Rect(Screen.width - 470, 20, 446, 154), "Combat log");
            var y = 46;
            foreach (var line in combatLog)
            {
                GUI.Label(new Rect(Screen.width - 456, y, 420, 22), line);
                y += 22;
            }
            if (battle.HasFireZone)
                GUI.Label(new Rect(Screen.width - 470, 182, 446, 44),
                    "FIRE_ZONE active at " + battle.FireZoneColumn + "," + battle.FireZoneRow +
                    " for " + battle.FireZoneTurnsRemaining + " turns.");
        }

        private static void Bar(Rect rect, string label, float value, Color color)
        {
            GUI.Box(rect, label);
            var fill = new Rect(rect.x + 2, rect.y + 2, Mathf.Max(0, rect.width - 4) * Mathf.Clamp01(value),
                rect.height - 4);
            var old = GUI.color;
            GUI.color = color;
            GUI.DrawTexture(fill, Texture2D.whiteTexture);
            GUI.color = old;
        }

        private void OnDestroy()
        {
            if (runtimeMaterial != null) Destroy(runtimeMaterial);
        }
    }
}
