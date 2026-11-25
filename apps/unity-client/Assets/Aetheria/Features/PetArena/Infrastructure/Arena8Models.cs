using System;

namespace Aetheria.PetArena.Infrastructure
{
    [Serializable] public sealed class Arena8AllocateRequest
    {
        public string requestId, petId, mapId, encounterId;
    }

    [Serializable] public sealed class Arena8AllocateResponse
    {
        public string matchId;
        public int version;
        public Arena8View view;
        public Arena8Allocation allocation;
    }

    [Serializable] public sealed class Arena8Allocation
    {
        public string petId, mapId, encounterId;
        public int level;
        public Arena8Artifact[] artifacts;
    }

    [Serializable] public sealed class Arena8View
    {
        public int schemaVersion, version, turn;
        public string matchId, phase;
        public int[] board;
        public int health, enemyHealth, enemyShield, mana, rage, cooldown, fireZoneTurns;
        public bool terminal;
        public Arena8Pet pet;
        public Arena8Stats stats;
        public Arena8Artifact[] artifacts;
        public Arena8Skill[] skills;
        public Arena8Encounter encounter;
        public Arena8Telegraph telegraph;
    }

    [Serializable] public sealed class Arena8Pet
    {
        public string id, ownedPetId, family, element;
        public int level;
    }

    [Serializable] public sealed class Arena8Stats
    {
        public Arena8CombatStats effective;
    }

    [Serializable] public sealed class Arena8CombatStats
    {
        public int health, attack, defense;
    }

    [Serializable] public sealed class Arena8Artifact
    {
        public string slot, definitionId, rank;
        public int upgradeLevel;
    }

    [Serializable] public sealed class Arena8Skill
    {
        public string id, reason;
        public bool unlocked, canCast;
        public int skillLevel, maxSkillLevel;
    }

    [Serializable] public sealed class Arena8Encounter
    {
        public string id, element;
        public int index, revision;
        public bool boss;
    }

    [Serializable] public sealed class Arena8Telegraph
    {
        public string kind, axis;
        public int target, announcedTurn, resolvesTurn;
    }

    [Serializable] public sealed class Arena8StartAction { public string kind = "start"; }
    [Serializable] public sealed class Arena8GuardAction { public string kind = "guard"; }
    [Serializable] public sealed class Arena8SkillAction { public string kind; }
    [Serializable] public sealed class Arena8SwapAction
    {
        public string kind = "swap";
        public int first, second;
    }

    [Serializable] public sealed class Arena8StartCommandRequest
    {
        public string requestId, matchId;
        public int expectedVersion;
        public Arena8StartAction action = new Arena8StartAction();
    }

    [Serializable] public sealed class Arena8GuardCommandRequest
    {
        public string requestId, matchId;
        public int expectedVersion;
        public Arena8GuardAction action = new Arena8GuardAction();
    }

    [Serializable] public sealed class Arena8SkillCommandRequest
    {
        public string requestId, matchId;
        public int expectedVersion;
        public Arena8SkillAction action;
    }

    [Serializable] public sealed class Arena8SwapCommandRequest
    {
        public string requestId, matchId;
        public int expectedVersion;
        public Arena8SwapAction action;
    }

    [Serializable] public sealed class Arena8CommandResponse
    {
        public string matchId, receiptId;
        public int version;
        public bool terminal;
        public Arena8View view;
        public Arena8Event[] events;
    }

    [Serializable] public sealed class Arena8Event
    {
        public int sequence, turn, damage, amount, health, enemyHealth;
        public string type;
    }

    [Serializable] public sealed class Arena8MatchResponse
    {
        public string matchId;
        public int version;
        public bool terminal;
        public Arena8View view;
    }

    [Serializable] public sealed class Arena8SettleRequest { public string requestId; }

    [Serializable] public sealed class Arena8Settlement
    {
        public string matchId, artifactId, recruitedPetId, requestId;
        public bool won, firstClear;
        public int materials, exp, coins, petLevel, petExp;
        public string[] clearedMaps;
    }
}
