using UnityEngine;
using UnityEngine.UIElements;

namespace Aetheria.PetArena.Presentation
{
    internal static class BattleScreenLayout
    {
        public static VisualElement Stage()
        {
            var stage = new VisualElement { name = "battle-stage" };
            stage.AddToClassList("battle-stage");
            return stage;
        }

        public static VisualElement Side(string name, string sideClass)
        {
            var side = new VisualElement { name = name };
            side.AddToClassList("battle-side");
            side.AddToClassList(sideClass);
            return side;
        }

        public static VisualElement Center(string boardName) => Center(new VisualElement { name = boardName });

        public static VisualElement Center(VisualElement board)
        {
            var center = new VisualElement { name = "battle-center" };
            center.AddToClassList("battle-center");
            board.AddToClassList("battle-board");
            center.Add(board);
            return center;
        }

        public static void AddCell(VisualElement board, Button cell, int index)
        {
            const int side = 8;
            if (index % side == 0)
            {
                var row = new VisualElement();
                row.AddToClassList("battle-board-row");
                board.Add(row);
            }
            cell.AddToClassList("battle-cell");
            board[index / side].Add(cell);
        }

        public static void Size(VisualElement content, Vector2 viewport)
        {
            var stage = content?.Q("battle-stage");
            var center = stage?.Q("battle-center");
            if (center == null || viewport.x <= 0f || viewport.y <= 0f) return;

            // Keep the grid square and reserve dedicated width for matching left and right sides.
            // Short editor windows retain a readable tile size and can scroll to the action row.
            var widthLimit = viewport.x * .53f;
            // Bundled locale fonts need room for the two-line skill labels and footer.
            const float actionSpace = 132f;
            var heightLimit = Mathf.Max(400f, viewport.y - actionSpace);
            var boardEdge = Mathf.Floor(Mathf.Min(704f, widthLimit, heightLimit) / 8f) * 8f;
            center.style.width = boardEdge;
            center[0].style.height = boardEdge;
            stage.EnableInClassList("battle-compact", viewport.x < 960f);
            var upperMargin = 14f + Mathf.Max(0f, viewport.y - boardEdge - actionSpace) * .5f;
            stage.style.paddingTop = upperMargin;
            foreach (var element in stage.Children())
                if (element.ClassListContains("battle-side")) element.style.top = upperMargin;
            stage.style.minHeight = viewport.y;
        }
    }
}
