using System;
using UnityEngine;

namespace Aetheria.Pets.Presentation
{
    public enum PetEvolutionStage
    {
        Base,
        Awakened,
        Ascendant,
        Celestial
    }

    [Serializable]
    public sealed class PetEvolutionVisual
    {
        public int minimumLevel = 1;
        public string label = "Base";
        public Color emission = Color.black;
        public Color aura = Color.clear;
    }

    [CreateAssetMenu(menuName = "Aetheria/Pets/Pet Evolution Profile", fileName = "PetEvolutionProfile")]
    public sealed class PetEvolutionProfile : ScriptableObject
    {
        [SerializeField] private string petId = "pet-v3-fire-icarus";
        [SerializeField] private string address = "pets/pet-v3-fire-icarus";
        [SerializeField] private string displayName = "Icarus";
        [SerializeField] private string weaponPath = "Socket_Bow";
        [SerializeField] private string haloPath = "Socket_Halo";
        [SerializeField] private string wingsPath = "Socket_Wings";
        [SerializeField] private string auraPath = "Aura";
        [SerializeField] private string maxVfxPath = "MaxVFX";
        [SerializeField] private Material stageTwoMaterial;
        [SerializeField] private PetEvolutionVisual[] stages = {
            new PetEvolutionVisual {minimumLevel = 1, label = "Base"},
            new PetEvolutionVisual {
                minimumLevel = 20,
                label = "Awakened: bow + emission",
                emission = new Color(1f, .28f, .05f),
            },
            new PetEvolutionVisual {
                minimumLevel = 40,
                label = "Ascendant: halo + material + aura",
                emission = new Color(1f, .52f, .06f),
                aura = new Color(1f, .55f, .08f, .42f),
            },
            new PetEvolutionVisual {
                minimumLevel = 60,
                label = "Celestial: wings + maximum VFX",
                emission = new Color(1f, .82f, .2f),
                aura = new Color(1f, .82f, .2f, .65f),
            },
        };

        public string PetId => petId;
        public string Address => address;
        public string DisplayName => displayName;
        public string WeaponPath => weaponPath;
        public string HaloPath => haloPath;
        public string WingsPath => wingsPath;
        public string AuraPath => auraPath;
        public string MaxVfxPath => maxVfxPath;
        public Material StageTwoMaterial => stageTwoMaterial;
        public int Threshold(PetEvolutionStage stage) =>
            stages != null && (int)stage < stages.Length ? stages[(int)stage].minimumLevel : int.MaxValue;
        public PetEvolutionVisual Visual(PetEvolutionStage stage) =>
            stages != null && (int)stage < stages.Length ? stages[(int)stage] : null;

        public PetEvolutionStage StageForLevel(int level)
        {
            if (level >= Threshold(PetEvolutionStage.Celestial)) return PetEvolutionStage.Celestial;
            if (level >= Threshold(PetEvolutionStage.Ascendant)) return PetEvolutionStage.Ascendant;
            if (level >= Threshold(PetEvolutionStage.Awakened)) return PetEvolutionStage.Awakened;
            return PetEvolutionStage.Base;
        }

        public void Configure(PetEvolutionProfileValues values)
        {
            petId = values.PetId;
            address = values.Address;
            displayName = values.DisplayName;
            weaponPath = values.WeaponPath;
            haloPath = values.HaloPath;
            wingsPath = values.WingsPath;
            auraPath = values.AuraPath;
            maxVfxPath = values.MaxVfxPath;
            stageTwoMaterial = values.StageTwoMaterial;
        }
    }

    public readonly struct PetEvolutionProfileValues
    {
        public string PetId { get; }
        public string Address { get; }
        public string DisplayName { get; }
        public string WeaponPath { get; }
        public string HaloPath { get; }
        public string WingsPath { get; }
        public string AuraPath { get; }
        public string MaxVfxPath { get; }
        public Material StageTwoMaterial { get; }

        public PetEvolutionProfileValues(string petId, string address, string displayName,
            string weaponPath, string haloPath, string wingsPath, string auraPath, string maxVfxPath,
            Material stageTwoMaterial)
        {
            PetId = petId;
            Address = address;
            DisplayName = displayName;
            WeaponPath = weaponPath;
            HaloPath = haloPath;
            WingsPath = wingsPath;
            AuraPath = auraPath;
            MaxVfxPath = maxVfxPath;
            StageTwoMaterial = stageTwoMaterial;
        }
    }
}
