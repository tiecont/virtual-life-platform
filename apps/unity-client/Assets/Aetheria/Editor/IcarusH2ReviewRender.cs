using System;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Aetheria.Icarus;

namespace Aetheria.Editor
{
    // Explicit H2 review command. It produces local evidence and edits no source assets.
    public static class IcarusH2ReviewRender
    {
        private const int Size = 960;

        public static void Render()
        {
            if (Application.unityVersion != "6000.3.14f1")
                throw new InvalidOperationException("Unity 6000.3.14f1 is required.");
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null)
                throw new InvalidOperationException("An actual graphics device is required.");
            string output = Environment.GetEnvironmentVariable("VL_ICARUS_H2_OUTPUT");
            if (string.IsNullOrWhiteSpace(output) || !Path.IsPathRooted(output) || Directory.Exists(output))
                throw new InvalidOperationException("A new absolute VL_ICARUS_H2_OUTPUT directory is required.");
            Directory.CreateDirectory(output);

            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(
                "Assets/Aetheria/Settings/BlockoutURP.asset");
            if (pipeline == null) throw new InvalidOperationException("Pinned URP pipeline missing.");
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;

            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(IcarusPrefabSetupEditor.PrefabPath);
            if (prefab == null) throw new InvalidOperationException("Icarus prefab missing.");
            GameObject root = UnityEngine.Object.Instantiate(prefab);
            root.name = "Icarus H2 review";

            Transform wingsSocket = Find(root, "Socket_Wings");
            Transform bowSocket = Find(root, "Socket_Bow");
            Transform wings = wingsSocket.Find("Icarus_Wings");
            Transform bow = bowSocket.Find("Icarus_Bow");
            if (wings == null || bow == null)
                throw new InvalidOperationException("Both verified Tripo accessories must be attached.");
            if (Triangles(wings.gameObject) != 26133 || Triangles(bow.gameObject) != 10489)
                throw new InvalidOperationException("Attached accessory triangle contract changed.");

            var wingController = root.GetComponent<IcarusWingController>();
            var signature = root.GetComponent<IcarusSignaturePresentation>();
            var bowString = root.GetComponent<IcarusBowString>();
            var fireZone = root.GetComponent<IcarusFireZonePresentation>() ??
                root.AddComponent<IcarusFireZonePresentation>();
            if (wingController == null || signature == null || bowString == null)
                throw new InvalidOperationException("Icarus presentation components missing.");
            Initialize(wingController);
            Initialize(bowString);
            Initialize(signature);

            var board = new GameObject("FIRE_ZONE board origin");
            board.transform.SetParent(root.transform, false);
            board.transform.localPosition = new Vector3(-3.5f, 0, -3.5f);
            var zoneFields = new SerializedObject(fireZone);
            zoneFields.FindProperty("boardRoot").objectReferenceValue = board.transform;
            zoneFields.FindProperty("cellSize").floatValue = 1;
            zoneFields.FindProperty("boardOrigin").vector3Value = Vector3.zero;
            zoneFields.FindProperty("mode").enumValueIndex = (int)IcarusPresentationMode.Normal;
            zoneFields.ApplyModifiedPropertiesWithoutUndo();
            Initialize(fireZone);
            if (!IcarusFireZoneSnapshot.TryCreate(1, 10, true, 3, 3, 9, out var snapshot) ||
                !fireZone.ApplyValidatedSnapshot(snapshot))
                throw new InvalidOperationException("Could not prepare authoritative FIRE_ZONE review state.");
            fireZone.SetPresentationMode(IcarusPresentationMode.Off);
            Transform generatedDecal = root.GetComponentsInChildren<Transform>(true)
                .SingleOrDefault(node => node.name == "FIRE_ZONE board decal");
            if (generatedDecal != null) generatedDecal.gameObject.SetActive(false);

            BuildStudio(out Camera camera, out RenderTexture target, out Texture2D texture,
                out GameObject boardVisual, out GameObject zoneVisual, fireZone.ActiveColumn, fireZone.ActiveRow);
            WarmUp(camera, target);
            RenderFrame(Path.Combine(output, "01-idle-wings-off.png"), false, false, false,
                wingsSocket, bowSocket, camera, target, texture,
                new Vector3(0, 1.05f, 3.4f), new Vector3(0, .92f, 0), 1.15f,
                boardVisual, zoneVisual);
            RenderFrame(Path.Combine(output, "02-ultimate-wings-bow-fire-zone.png"), true, true, true,
                wingsSocket, bowSocket, camera, target, texture,
                new Vector3(-2.25f, 1.35f, 3.15f), new Vector3(0, .95f, 0), 1.35f,
                boardVisual, zoneVisual, fireZone, signature);
            RenderFrame(Path.Combine(output, "03-back-closeup.png"), true, true, false,
                wingsSocket, bowSocket, camera, target, texture,
                new Vector3(0, 1.38f, -1.55f), new Vector3(0, 1.34f, 0), .72f,
                boardVisual, zoneVisual, fireZone, signature);
            RenderFrame(Path.Combine(output, "04-side-profile.png"), true, true, false,
                wingsSocket, bowSocket, camera, target, texture,
                new Vector3(3f, 1.15f, 1.1f), new Vector3(0, .92f, 0), 1.2f,
                boardVisual, zoneVisual, fireZone, signature);

            target.Release();
            UnityEngine.Object.DestroyImmediate(texture);
            UnityEngine.Object.DestroyImmediate(target);
            Debug.Log("ICARUS_H2_REVIEW_RENDER_PASS");
        }

        private static void RenderFrame(
            string path,
            bool wingsVisible,
            bool bowVisible,
            bool fireZoneVisible,
            Transform wingsSocket,
            Transform bowSocket,
            Camera camera,
            RenderTexture target,
            Texture2D texture,
            Vector3 cameraPosition,
            Vector3 focus,
            float orthographicSize,
            GameObject boardVisual,
            GameObject zoneVisual,
            IcarusFireZonePresentation fireZone = null,
            IcarusSignaturePresentation signature = null)
        {
            boardVisual.SetActive(fireZoneVisible);
            zoneVisual.SetActive(fireZoneVisible);
            if (fireZone != null && signature != null)
            {
                if (fireZoneVisible)
                {
                    fireZone.SetPresentationMode(IcarusPresentationMode.Normal);
                    if (!fireZone.BeginSignature(IcarusSignaturePresentation.PetId,
                            IcarusSignaturePresentation.Opcode))
                        throw new InvalidOperationException("FIRE_ZONE signature presentation did not start.");
                }
                else
                {
                    fireZone.SetPresentationMode(IcarusPresentationMode.Reduced);
                }
            }

            wingsSocket.gameObject.SetActive(wingsVisible);
            bowSocket.gameObject.SetActive(bowVisible);
            if (!wingsVisible && signature != null) signature.EndSignature();

            camera.orthographic = true;
            camera.orthographicSize = orthographicSize;
            camera.transform.position = cameraPosition;
            camera.transform.LookAt(focus);
            RenderPipeline.SubmitRenderRequest(camera,
                new UniversalRenderPipeline.SingleCameraRequest { destination = target });
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = target;
            texture.ReadPixels(new Rect(0, 0, Size, Size), 0, 0);
            texture.Apply();
            RenderTexture.active = previous;
            byte[] png = texture.EncodeToPNG();
            if (png == null || png.Length == 0) throw new InvalidOperationException("PNG encoding failed.");
            File.WriteAllBytes(path, png);
        }

        private static void BuildStudio(out Camera camera, out RenderTexture target, out Texture2D texture,
            out GameObject boardVisual, out GameObject zoneVisual, int activeColumn, int activeRow)
        {
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.48f, .52f, .62f);
            RenderSettings.ambientEquatorColor = new Color(.24f, .24f, .29f);
            RenderSettings.ambientGroundColor = new Color(.08f, .08f, .10f);

            var key = new GameObject("H2 Key").AddComponent<Light>();
            key.type = LightType.Directional;
            key.color = new Color(1f, .92f, .84f);
            key.intensity = .82f;
            key.shadows = LightShadows.Soft;
            key.transform.rotation = Quaternion.Euler(34, -32, 0);
            var rim = new GameObject("H2 Rim").AddComponent<Light>();
            rim.type = LightType.Directional;
            rim.color = new Color(1f, .55f, .28f);
            rim.intensity = .42f;
            rim.transform.rotation = Quaternion.Euler(18, 155, 0);
            var fill = new GameObject("H2 Fill").AddComponent<Light>();
            fill.type = LightType.Directional;
            fill.color = new Color(.55f, .68f, 1f);
            fill.intensity = .35f;
            fill.transform.rotation = Quaternion.Euler(12, 42, 0);

            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "H2 ground";
            ground.transform.position = new Vector3(0, -.012f, 0);
            ground.transform.localScale = new Vector3(3, 1, 3);
            var collider = ground.GetComponent<Collider>();
            if (collider != null) UnityEngine.Object.DestroyImmediate(collider);
            Shader lit = Shader.Find("Universal Render Pipeline/Lit");
            if (lit == null) throw new InvalidOperationException("URP Lit shader missing.");
            var material = new Material(lit) { name = "H2 review ground" };
            material.SetColor("_BaseColor", new Color(.10f, .11f, .14f));
            material.SetFloat("_Smoothness", .18f);
            ground.GetComponent<MeshRenderer>().sharedMaterial = material;
            boardVisual = CellGrid("H2 board", 0, 10, 0, 10, -0.004f, material);
            var zoneMaterial = new Material(lit) { name = "H2 FIRE_ZONE" };
            zoneMaterial.SetColor("_BaseColor", new Color(1f, .19f, .035f));
            zoneMaterial.EnableKeyword("_EMISSION");
            zoneMaterial.SetColor("_EmissionColor", new Color(1f, .12f, .015f) * .9f);
            zoneVisual = CellGrid("H2 FIRE_ZONE 4x4", activeColumn, activeColumn + 4,
                activeRow, activeRow + 4, .004f, zoneMaterial);
            boardVisual.transform.position = new Vector3(-5, 0, -5);
            zoneVisual.transform.position = new Vector3(-5, 0, -5);

            camera = new GameObject("H2 camera").AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.055f, .065f, .095f);
            camera.nearClipPlane = .01f;
            camera.farClipPlane = 40;
            camera.allowHDR = true;
            camera.GetUniversalAdditionalCameraData().renderPostProcessing = false;

            target = new RenderTexture(Size, Size, 24, RenderTextureFormat.ARGB32)
            {
                antiAliasing = 4,
                name = "Icarus H2 review target"
            };
            target.Create();
            texture = new Texture2D(Size, Size, TextureFormat.RGB24, false);
        }

        private static GameObject CellGrid(string name, int startColumn, int endColumn,
            int startRow, int endRow, float height, Material material)
        {
            var vertices = new System.Collections.Generic.List<Vector3>();
            var triangles = new System.Collections.Generic.List<int>();
            const float half = .47f;
            for (int row = startRow; row < endRow; row++)
            for (int column = startColumn; column < endColumn; column++)
            {
                int index = vertices.Count;
                float x = column + .5f;
                float z = row + .5f;
                vertices.Add(new Vector3(x - half, height, z - half));
                vertices.Add(new Vector3(x - half, height, z + half));
                vertices.Add(new Vector3(x + half, height, z + half));
                vertices.Add(new Vector3(x + half, height, z - half));
                triangles.Add(index);
                triangles.Add(index + 1);
                triangles.Add(index + 2);
                triangles.Add(index);
                triangles.Add(index + 2);
                triangles.Add(index + 3);
            }
            var mesh = new Mesh { name = name };
            mesh.SetVertices(vertices);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            var result = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            result.GetComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = result.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = true;
            return result;
        }

        private static void WarmUp(Camera camera, RenderTexture target)
        {
            camera.orthographic = true;
            camera.orthographicSize = 1.2f;
            camera.transform.position = new Vector3(0, 1.05f, 3.3f);
            camera.transform.LookAt(new Vector3(0, .9f, 0));
            RenderPipeline.SubmitRenderRequest(camera,
                new UniversalRenderPipeline.SingleCameraRequest { destination = target });
        }

        private static void Initialize(MonoBehaviour component)
        {
            MethodInfo awake = component.GetType().GetMethod("Awake",
                BindingFlags.Instance | BindingFlags.NonPublic);
            if (awake == null) throw new InvalidOperationException(
                component.GetType().Name + " has no editor review initializer.");
            awake.Invoke(component, null);
        }

        private static Transform Find(GameObject root, string name) =>
            root.GetComponentsInChildren<Transform>(true).Single(node => node.name == name);

        private static Transform Find(Transform root, string name) =>
            root.GetComponentsInChildren<Transform>(true).Single(node => node.name == name);

        private static int Triangles(GameObject root) =>
            root.GetComponentsInChildren<MeshFilter>(true)
                .Where(filter => filter.sharedMesh != null)
                .Sum(filter => filter.sharedMesh.triangles.Length / 3) +
            root.GetComponentsInChildren<SkinnedMeshRenderer>(true)
                .Where(renderer => renderer.sharedMesh != null)
                .Sum(renderer => renderer.sharedMesh.triangles.Length / 3);
    }
}
