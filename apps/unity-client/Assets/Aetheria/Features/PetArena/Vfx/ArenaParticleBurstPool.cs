using UnityEngine;
using UnityEngine.Rendering;

namespace Aetheria.PetArena.Vfx
{
    internal sealed class ArenaParticleBurstPool
    {
        private readonly ParticleSystem[] systems = new ParticleSystem[ArenaVisualPalette.ElementCount];
        private readonly GameObject root;
        private readonly Texture2D texture;
        private readonly Material material;

        public int Count => systems.Length;

        public ArenaParticleBurstPool(Transform parent)
        {
            root = new GameObject("Bursts");
            root.transform.SetParent(parent, false);
            root.hideFlags = HideFlags.DontSave;
            texture = ArenaRuntimeAssets.CreateParticleTexture(32);
            material = ArenaRuntimeAssets.CreateMaterial("Arena Particle (Runtime)", texture);
            for (var index = 0; index < systems.Length; index++)
                systems[index] = CreateSystem(index);
        }

        public void Play(ArenaElement element, Vector3 position, bool reduced)
        {
            var index = (int)element;
            if (index < 0 || index >= systems.Length) return;
            var system = systems[index];
            if (system == null) return;
            var main = system.main;
            main.startSizeMultiplier = reduced ? .55f : 1f;
            system.transform.position = new Vector3(position.x, position.y + .35f, position.z);
            if (!Application.isPlaying) return;
            system.Play(false);
            system.Emit(reduced
                ? ArenaVisualPalette.ReducedBurstCount(element)
                : ArenaVisualPalette.BurstCount(element));
        }

        public void SetReducedMotion(bool reduced)
        {
            for (var index = 0; index < systems.Length; index++)
            {
                var system = systems[index];
                if (system == null) continue;
                var main = system.main;
                main.startSizeMultiplier = reduced ? .55f : 1f;
            }
        }

        public void StopAll()
        {
            for (var index = 0; index < systems.Length; index++)
            {
                var system = systems[index];
                if (system == null) continue;
                system.Clear(true);
                if (Application.isPlaying)
                    system.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            }
        }

        public void Dispose()
        {
            StopAll();
            ArenaRuntimeAssets.Destroy(root);
            ArenaRuntimeAssets.Destroy(material);
            ArenaRuntimeAssets.Destroy(texture);
        }

        private ParticleSystem CreateSystem(int index)
        {
            var part = new GameObject("Burst " + (ArenaElement)index);
            part.transform.SetParent(root.transform, false);
            part.hideFlags = HideFlags.DontSave;
            var system = part.AddComponent<ParticleSystem>();
            system.Stop(false, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = system.main;
            main.loop = false;
            main.playOnAwake = false;
            main.duration = 1f;
            main.maxParticles = 64;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.scalingMode = ParticleSystemScalingMode.Hierarchy;

            var emission = system.emission;
            emission.enabled = false;

            var renderer = part.GetComponent<ParticleSystemRenderer>();
            if (renderer != null)
            {
                renderer.renderMode = ParticleSystemRenderMode.Billboard;
                renderer.alignment = ParticleSystemRenderSpace.View;
                renderer.shadowCastingMode = ShadowCastingMode.Off;
                renderer.receiveShadows = false;
                if (material != null) renderer.sharedMaterial = material;
            }
            Configure(system, (ArenaElement)index);
            return system;
        }

        private static void Configure(ParticleSystem system, ArenaElement element)
        {
            var main = system.main;
            var shape = system.shape;
            shape.enabled = true;
            main.startColor = new ParticleSystem.MinMaxGradient(
                ArenaVisualPalette.ParticleColor(element));
            switch (element)
            {
                case ArenaElement.Fire:
                    main.startLifetime = .65f;
                    main.startSpeed = 2.2f;
                    main.startSize = .18f;
                    main.gravityModifier = -.12f;
                    shape.shapeType = ParticleSystemShapeType.Cone;
                    shape.angle = 22f;
                    shape.radius = .12f;
                    shape.rotation = new Vector3(-90f, 0f, 0f);
                    break;
                case ArenaElement.Water:
                    main.startLifetime = .6f;
                    main.startSpeed = 2.6f;
                    main.startSize = .14f;
                    main.gravityModifier = 1.1f;
                    shape.shapeType = ParticleSystemShapeType.Sphere;
                    shape.radius = .25f;
                    break;
                case ArenaElement.Electric:
                    main.startLifetime = .22f;
                    main.startSpeed = 4.2f;
                    main.startSize = .07f;
                    main.gravityModifier = 0f;
                    shape.shapeType = ParticleSystemShapeType.Sphere;
                    shape.radius = .1f;
                    break;
                case ArenaElement.Ghost:
                    main.startLifetime = 1.1f;
                    main.startSpeed = .8f;
                    main.startSize = .24f;
                    main.gravityModifier = -.15f;
                    shape.shapeType = ParticleSystemShapeType.Sphere;
                    shape.radius = .3f;
                    break;
                case ArenaElement.Ground:
                    main.startLifetime = .55f;
                    main.startSpeed = 1.3f;
                    main.startSize = .22f;
                    main.gravityModifier = .9f;
                    shape.shapeType = ParticleSystemShapeType.Hemisphere;
                    shape.radius = .4f;
                    break;
                case ArenaElement.Light:
                    main.startLifetime = .7f;
                    main.startSpeed = 2.8f;
                    main.startSize = .11f;
                    main.gravityModifier = -.05f;
                    shape.shapeType = ParticleSystemShapeType.Cone;
                    shape.angle = 35f;
                    shape.radius = .15f;
                    shape.rotation = new Vector3(-90f, 0f, 0f);
                    break;
            }
        }
    }
}
