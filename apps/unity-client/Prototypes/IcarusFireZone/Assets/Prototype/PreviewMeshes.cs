using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Aetheria.IcarusPrototype
{
    internal sealed class PreviewMeshes : IDisposable
    {
        private readonly Shader shader;
        private readonly List<UnityEngine.Object> resources = new List<UnityEngine.Object>();
        private static readonly Color[] Tiles = {
            new Color(.24f, .42f, .55f), new Color(.44f, .31f, .53f),
            new Color(.25f, .47f, .42f), new Color(.49f, .36f, .28f)
        };

        internal PreviewMeshes(Shader shader) => this.shader = shader;

        internal Material Material(string name, Color tint, int shape)
        {
            var material = new Material(shader) { name = name };
            material.SetColor("_Tint", tint);
            material.SetFloat("_Shape", shape);
            resources.Add(material);
            return material;
        }

        internal MeshRenderer Surface(Transform parent, string name, Material material, int order, out Mesh mesh)
        {
            var surface = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            surface.transform.SetParent(parent, false);
            var renderer = surface.GetComponent<MeshRenderer>();
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.sortingOrder = order;
            renderer.sharedMaterial = material;
            mesh = new Mesh { name = name };
            surface.GetComponent<MeshFilter>().sharedMesh = mesh;
            resources.Add(mesh);
            return renderer;
        }

        internal static Vector3 CellCenter(int column, int row) => new Vector3(column + .5f, 0, row + .5f);

        internal static void PaintBoard(Mesh mesh) =>
            PaintCells(mesh, 0, 0, FireZone.BoardSize, .47f, 0, true);

        internal static void PaintZone(Mesh mesh, FireZone zone) =>
            PaintCells(mesh, zone.Column, zone.Row, FireZone.Side, .46f, .025f, false);

        private static void PaintCells(Mesh mesh, int column, int row, int side, float half, float height, bool baseTile)
        {
            var cells = new List<(Vector3 center, Color color)>(side * side);
            for (int z = row; z < row + side; z++)
                for (int x = column; x < column + side; x++)
                    cells.Add((CellCenter(x, z) + Vector3.up * height, baseTile ? Tiles[(x + 3*z + x*z) % Tiles.Length] : Color.white));
            Paint(mesh, cells, half);
        }

        internal static void PaintQuad(Mesh mesh, Vector3 center, float half) =>
            Paint(mesh, new[] { (center, Color.white) }, half);

        private static void Paint(Mesh mesh, IList<(Vector3 center, Color color)> cells, float half)
        {
            int count = cells.Count;
            var positions = new Vector3[count * 4];
            var uv = new Vector2[count * 4];
            var colors = new Color[count * 4];
            var indices = new int[count * 6];
            for (int cell = 0; cell < count; cell++)
            {
                int vertex = cell * 4;
                int index = cell * 6;
                var (center, color) = cells[cell];
                positions[vertex] = center + new Vector3(-half, 0, -half);
                positions[vertex + 1] = center + new Vector3(-half, 0, half);
                positions[vertex + 2] = center + new Vector3(half, 0, half);
                positions[vertex + 3] = center + new Vector3(half, 0, -half);
                uv[vertex] = Vector2.zero;
                uv[vertex + 1] = Vector2.up;
                uv[vertex + 2] = Vector2.one;
                uv[vertex + 3] = Vector2.right;
                for (int i = 0; i < 4; i++) colors[vertex + i] = color;
                indices[index] = vertex;
                indices[index + 1] = vertex + 1;
                indices[index + 2] = vertex + 2;
                indices[index + 3] = vertex;
                indices[index + 4] = vertex + 2;
                indices[index + 5] = vertex + 3;
            }
            mesh.Clear();
            mesh.vertices = positions;
            mesh.uv = uv;
            mesh.colors = colors;
            mesh.triangles = indices;
        }

        public void Dispose()
        {
            foreach (var resource in resources)
            {
                if (Application.isPlaying) UnityEngine.Object.Destroy(resource);
                else UnityEngine.Object.DestroyImmediate(resource);
            }
            resources.Clear();
        }
    }
}
