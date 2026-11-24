using System;

namespace Aetheria.PetArena.Infrastructure
{
    [Serializable] public sealed class Wave1Manifest
    {
        public Wave1Map[] maps;
    }

    [Serializable] public sealed class Wave1Map
    {
        public string id, name, element;
        public Wave1Opponent regular, boss;
    }

    [Serializable] public sealed class Wave1Opponent
    {
        public int hp;
    }

    [Serializable] public sealed class Wave1State
    {
        public int revision;
        public Wave1Wallet wallet;
        public string[] party;
        public Wave1Pet[] pets;
        public Wave1Campaign campaign;
        public Wave1Gacha gacha;

        public Wave1Pet FindPet(string id) => Array.Find(pets, pet => pet.petId == id);
    }

    [Serializable] public sealed class Wave1Wallet
    {
        public int coins;
    }

    [Serializable] public sealed class Wave1Pet
    {
        public string petId, name, element, rank;
        public int level, exp, expToNext, stage;
        public string[] unlocks;
        public Wave1Stats stats;
    }

    [Serializable] public sealed class Wave1Stats
    {
        public int hp;
    }

    [Serializable] public sealed class Wave1Campaign
    {
        public string[] clearedMaps;
        public string nextMapId;
    }

    [Serializable] public sealed class Wave1Gacha
    {
        public int misses;
        public bool guaranteed;
        public Wave1Pull[] history;
    }

    [Serializable] public sealed class Wave1Pull
    {
        public int seq;
        public string petId;
        public bool featured, duplicate;
    }

    [Serializable] public sealed class Wave1Encounter
    {
        public bool won, complete, skillReady;
        public int turns, remainingHp, enemyHp, rage, effectiveness, fireZoneTurns;
    }

    [Serializable] public sealed class Wave1PlayResponse
    {
        public Wave1State state;
        public Wave1Result result;
        public string acquiredPetId;
    }

    [Serializable] public sealed class Wave1Result
    {
        public bool won, firstClear;
        public Wave1Rewards rewards;
    }

    [Serializable] public sealed class Wave1Rewards
    {
        public int exp, coins, levelsGained, stage;
    }

    [Serializable] public sealed class Wave1PullResponse
    {
        public Wave1State state;
        public Wave1Pull[] pulls;
    }

    [Serializable] public sealed class Wave1PartyResponse
    {
        public int revision;
        public string[] party;
    }

    [Serializable] public sealed class Wave1PartyRequest
    {
        public string requestId;
        public string[] petIds;
    }

    [Serializable] public sealed class Wave1PullRequest
    {
        public string requestId;
        public int count;
    }

    [Serializable] public class Wave1PreviewRequest
    {
        public string mapId, petId;
        public string[] actions;
    }

    [Serializable] public sealed class Wave1BossPreviewRequest : Wave1PreviewRequest
    {
        public string[] bossActions;
    }

    [Serializable] public sealed class Wave1PlayRequest : Wave1PreviewRequest
    {
        public string requestId;
    }

    [Serializable] public sealed class Wave1BossPlayRequest : Wave1PreviewRequest
    {
        public string requestId;
        public string[] bossActions;
    }
}
