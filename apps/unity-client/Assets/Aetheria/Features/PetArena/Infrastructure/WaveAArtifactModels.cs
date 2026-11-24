using System;

namespace Aetheria.PetArena.Infrastructure
{
    [Serializable]
    public sealed class WaveAArtifactState
    {
        public int revision;
        public int materials;
        public WaveAArtifactInstance[] inventory;
        public WaveAArtifactPet[] pets;
        public WaveAArtifactPve pve;
        public WaveAArtifactSnapshot[] snapshots;

        public WaveAArtifactPet FindPet(string id) =>
            pets == null ? null : Array.Find(pets, pet => pet.petId == id);

        public WaveAArtifactInstance FindArtifact(string id) =>
            inventory == null ? null : Array.Find(inventory, item => item.artifactId == id);
    }

    [Serializable]
    public sealed class WaveAArtifactModifiers
    {
        public int hp, attack, defense, speed;
    }

    [Serializable]
    public sealed class WaveAArtifactEquipped
    {
        public string petId, slot;
    }

    [Serializable]
    public sealed class WaveAArtifactInstance
    {
        public string artifactId, definitionId, name, slot, rank;
        public int upgradeLevel, maxUpgradeLevel, nextUpgradeCost;
        public WaveAArtifactModifiers modifiers;
        public WaveAArtifactEquipped equipped;
        public string acquiredFrom, acquiredMapId, acquiredAt;
    }

    [Serializable]
    public sealed class WaveAArtifactSlots
    {
        public string core, aegis, rune;
    }

    [Serializable]
    public sealed class WaveAArtifactPet
    {
        public string petId, powerClass, digest, snapshotId;
        public int level;
        public WaveAArtifactSlots slots;
        public WaveAArtifactModifiers totals;
    }

    [Serializable]
    public sealed class WaveAArtifactPve
    {
        public WaveAArtifactClaim[] claims;
        public WaveAArtifactReward[] available;
    }

    [Serializable]
    public sealed class WaveAArtifactClaim
    {
        public string mapId, artifactId, definitionId, claimedAt;
        public int materials;
    }

    [Serializable]
    public sealed class WaveAArtifactReward
    {
        public string mapId, definitionId;
        public int materials;
    }

    [Serializable]
    public sealed class WaveAArtifactSnapshot
    {
        public string snapshotId, digest, createdAt;
        public WaveAArtifactSnapshotLoadout loadout;
    }

    [Serializable]
    public sealed class WaveAArtifactSnapshotLoadout
    {
        public string petId;
        public int petLevel;
        public WaveAArtifactSnapshotEntry[] entries;
        public WaveAArtifactModifiers totals;
    }

    [Serializable]
    public sealed class WaveAArtifactSnapshotEntry
    {
        public string slot, artifactId, definitionId;
        public int upgradeLevel;
        public WaveAArtifactModifiers modifiers;
    }

    [Serializable]
    public sealed class WaveAArtifactMutation
    {
        public int revision;
        public string petId, slot, artifactId, removedArtifactId;
        public int upgradeLevel, spent;
        public WaveAArtifactState state;
    }

    [Serializable]
    public sealed class WaveAArtifactEquipRequest
    {
        public string requestId, petId, artifactId;
    }

    [Serializable]
    public sealed class WaveAArtifactUnequipRequest
    {
        public string requestId, petId, slot;
    }

    [Serializable]
    public sealed class WaveAArtifactUpgradeRequest
    {
        public string requestId, artifactId;
    }

    [Serializable]
    public sealed class WaveAArtifactClaimRequest
    {
        public string requestId;
    }
}
