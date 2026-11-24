using Aetheria.World.Domain;
using UnityEngine;

namespace Aetheria.World.Presentation
{
    // Scene-level identity and content stage. It keeps the "intermediate
    // developer composition" and "foundation only" labels inspectable instead
    // of implying finished production content.
    public sealed class WorldMapIdentity : MonoBehaviour
    {
        [SerializeField] private string mapId = string.Empty;
        [SerializeField] private string displayName = string.Empty;
        [SerializeField] private string contentStage = string.Empty;
        [SerializeField] private string sceneName = string.Empty;
        [SerializeField] private WorldMapElement element;
        [SerializeField] private WorldLayoutKind kind;
        [SerializeField] private bool playable;
        [SerializeField] private bool previewOnly;
        [SerializeField] private int boardCellCount;
        [SerializeField] private int placementCount;

        public string MapId => mapId;
        public string DisplayName => displayName;
        public string ContentStage => contentStage;
        public string SceneName => sceneName;
        public WorldMapElement Element => element;
        public WorldLayoutKind Kind => kind;
        public bool Playable => playable;
        public bool PreviewOnly => previewOnly;
        public int BoardCellCount => boardCellCount;
        public int PlacementCount => placementCount;

        public void Configure(WorldLayout layout)
        {
            mapId = layout.MapId;
            displayName = layout.DisplayName;
            contentStage = layout.ContentStage;
            sceneName = layout.SceneName;
            element = layout.Element;
            kind = layout.Kind;
            playable = !layout.PreviewOnly;
            previewOnly = layout.PreviewOnly;
            boardCellCount = layout.Board != null ? layout.Board.CellCount : 0;
            placementCount = layout.Placements.Count;
        }
    }
}
