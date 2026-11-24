using System.Collections.Generic;
using UnityEngine;

namespace Aetheria.Pets.Presentation
{
    [DisallowMultipleComponent]
    public sealed class PetEvolutionController : MonoBehaviour
    {
        private static readonly int BaseColor = Shader.PropertyToID("_BaseColor");
        private static readonly int EmissionColor = Shader.PropertyToID("_EmissionColor");

        [SerializeField] private PetEvolutionProfile profile;
        [SerializeField, Range(1, 100)] private int level = 1;
        [SerializeField] private Transform modelRoot;
        [SerializeField] private Transform weapon;
        [SerializeField] private Transform halo;
        [SerializeField] private Transform wings;
        [SerializeField] private Transform aura;
        [SerializeField] private Transform maxVfx;
        [SerializeField] private Renderer[] emissionRenderers;
        [SerializeField] private Renderer[] materialVariantRenderers;

        private Material[] originalMaterials;
        private MaterialPropertyBlock properties;

        public PetEvolutionProfile Profile => profile;
        public int Level => level;
        public PetEvolutionStage CurrentStage =>
            profile != null ? profile.StageForLevel(level) : PetEvolutionStage.Base;
        public Transform Weapon => weapon;
        public Transform Halo => halo;
        public Transform Wings => wings;
        public Transform Aura => aura;
        public Transform MaxVfx => maxVfx;

        private void Awake()
        {
            properties = new MaterialPropertyBlock();
            CacheOriginalMaterials();
            if (modelRoot != null) Bind(modelRoot);
            ApplyLevel(level);
        }

        public void Bind(PetEvolutionProfile nextProfile)
        {
            profile = nextProfile;
            ApplyLevel(level);
        }

        public void Bind(Transform root)
        {
            modelRoot = root;
            weapon = Find(root, profile != null ? profile.WeaponPath : "Socket_Bow");
            halo = Find(root, profile != null ? profile.HaloPath : "Socket_Halo");
            wings = Find(root, profile != null ? profile.WingsPath : "Socket_Wings");
            aura = Find(root, profile != null ? profile.AuraPath : "Aura");
            maxVfx = Find(root, profile != null ? profile.MaxVfxPath : "MaxVFX");
            if (emissionRenderers == null || emissionRenderers.Length == 0)
                emissionRenderers = root.GetComponentsInChildren<Renderer>(true);
            CacheOriginalMaterials();
        }

        public void Bind(Transform root, Renderer[] emissive, Renderer[] materialVariants)
        {
            emissionRenderers = emissive;
            materialVariantRenderers = materialVariants;
            Bind(root);
        }

        public void SetLevel(int value)
        {
            level = Mathf.Clamp(value, 1, 100);
            ApplyLevel(level);
        }

        public void ApplyLevel(int value)
        {
            level = Mathf.Clamp(value, 1, 100);
            var stage = CurrentStage;
            SetVisible(weapon, stage >= PetEvolutionStage.Awakened);
            SetVisible(halo, stage >= PetEvolutionStage.Ascendant);
            SetVisible(aura, stage >= PetEvolutionStage.Ascendant);
            SetVisible(wings, stage >= PetEvolutionStage.Celestial);
            SetVisible(maxVfx, stage >= PetEvolutionStage.Celestial);
            ApplyEmission(stage);
            ApplyMaterialVariant(stage >= PetEvolutionStage.Ascendant);
        }

        private void ApplyEmission(PetEvolutionStage stage)
        {
            if (emissionRenderers == null) return;
            if (properties == null) properties = new MaterialPropertyBlock();
            var visual = profile != null ? profile.Visual(stage) : null;
            var color = visual != null ? visual.emission : Color.clear;
            foreach (var renderer in emissionRenderers)
            {
                if (renderer == null) continue;
                renderer.GetPropertyBlock(properties);
                properties.SetColor(BaseColor, color);
                properties.SetColor(EmissionColor, color);
                renderer.SetPropertyBlock(properties);
            }
        }

        private void ApplyMaterialVariant(bool enabled)
        {
            if (materialVariantRenderers == null) return;
            var variant = profile != null ? profile.StageTwoMaterial : null;
            for (var i = 0; i < materialVariantRenderers.Length; i++)
            {
                var renderer = materialVariantRenderers[i];
                if (renderer == null || originalMaterials == null || i >= originalMaterials.Length) continue;
                renderer.sharedMaterial = enabled && variant != null ? variant : originalMaterials[i];
            }
        }

        private void CacheOriginalMaterials()
        {
            if (materialVariantRenderers == null)
            {
                originalMaterials = null;
                return;
            }
            originalMaterials = new Material[materialVariantRenderers.Length];
            for (var i = 0; i < materialVariantRenderers.Length; i++)
                if (materialVariantRenderers[i] != null)
                    originalMaterials[i] = materialVariantRenderers[i].sharedMaterial;
        }

        private static Transform Find(Transform root, string path)
        {
            if (root == null || string.IsNullOrWhiteSpace(path)) return null;
            var direct = root.Find(path);
            if (direct != null) return direct;
            foreach (var candidate in root.GetComponentsInChildren<Transform>(true))
                if (candidate.name == path) return candidate;
            return null;
        }

        private static void SetVisible(Transform target, bool visible)
        {
            if (target != null && target.gameObject.activeSelf != visible) target.gameObject.SetActive(visible);
        }
    }
}
