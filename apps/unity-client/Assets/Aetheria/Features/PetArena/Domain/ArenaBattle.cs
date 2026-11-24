using System;

namespace Aetheria.PetArena.Domain
{
    public enum ArenaAction
    {
        Intro,
        Normal,
        Rage,
        Signature
    }

    public enum ArenaPhase
    {
        Intro,
        PlayerTurn,
        Victory,
        Defeat
    }

    public readonly struct ArenaActionResult
    {
        public bool Accepted { get; }
        public string Message { get; }
        public int Damage { get; }
        public int Retaliation { get; }
        public ElementEffectiveness Effectiveness { get; }

        internal ArenaActionResult(bool accepted, string message, int damage = 0, int retaliation = 0,
            ElementEffectiveness effectiveness = ElementEffectiveness.Neutral)
        {
            Accepted = accepted;
            Message = message;
            Damage = damage;
            Retaliation = retaliation;
            Effectiveness = effectiveness;
        }
    }

    // Offline presentation fixture only. Native Pet Arena remains the
    // authoritative reducer; this class never claims or mutates server state.
    public sealed class ArenaBattle
    {
        public const int BoardSize = 10;
        public const int FireZoneSide = 4;
        public const int MaxRage = 100;
        public const int RageCost = 50;
        public const int SignatureCost = 100;

        private readonly int playerMaximumHealth;
        private readonly int enemyMaximumHealth;
        private readonly int baseEnemyDamage;

        public ArenaPhase Phase { get; private set; }
        public int Turn { get; private set; }
        public int PlayerHealth { get; private set; }
        public int EnemyHealth { get; private set; }
        public int Rage { get; private set; }
        public PetElement PlayerElement { get; }
        public PetElement EnemyElement { get; private set; }
        public int FireZoneColumn { get; private set; }
        public int FireZoneRow { get; private set; }
        public int FireZoneTurnsRemaining { get; private set; }
        public bool HasFireZone => FireZoneTurnsRemaining > 0;
        public bool Terminal => Phase == ArenaPhase.Victory || Phase == ArenaPhase.Defeat;
        public int PlayerMaximumHealth => playerMaximumHealth;
        public int EnemyMaximumHealth => enemyMaximumHealth;

        public ArenaBattle(PetElement enemyElement = PetElement.Grass,
            PetElement playerElement = PetElement.Fire, int playerHealth = 120,
            int enemyHealth = 120, int enemyDamage = 7)
        {
            if (playerHealth <= 0) throw new ArgumentOutOfRangeException(nameof(playerHealth));
            if (enemyHealth <= 0) throw new ArgumentOutOfRangeException(nameof(enemyHealth));
            if (enemyDamage < 0) throw new ArgumentOutOfRangeException(nameof(enemyDamage));
            PlayerElement = playerElement;
            EnemyElement = enemyElement;
            playerMaximumHealth = playerHealth;
            enemyMaximumHealth = enemyHealth;
            baseEnemyDamage = enemyDamage;
            Reset(enemyElement);
        }

        public void Reset(PetElement? enemyElement = null)
        {
            if (enemyElement.HasValue) EnemyElement = enemyElement.Value;
            Phase = ArenaPhase.Intro;
            Turn = 0;
            PlayerHealth = playerMaximumHealth;
            EnemyHealth = enemyMaximumHealth;
            Rage = 0;
            ClearFireZone();
        }

        public bool SelectEnemyElement(PetElement element)
        {
            if (Phase != ArenaPhase.Intro) return false;
            EnemyElement = element;
            return true;
        }

        public ArenaActionResult Perform(ArenaAction action)
        {
            if (action == ArenaAction.Intro)
            {
                if (Phase != ArenaPhase.Intro) return Reject("Intro has already played.");
                Phase = ArenaPhase.PlayerTurn;
                return new ArenaActionResult(true, "Icarus enters the arena.");
            }
            if (Terminal) return Reject("The match is already complete.");
            if (Phase != ArenaPhase.PlayerTurn) return Reject("Start with Intro.");
            if (action == ArenaAction.Rage && Rage < RageCost)
                return Reject("Rage requires " + RageCost + ".");
            if (action == ArenaAction.Signature && Rage < SignatureCost)
                return Reject("FIRE_ZONE requires full Rage.");

            var baseDamage = action == ArenaAction.Normal ? 12 : action == ArenaAction.Rage ? 24 : 34;
            var effectiveness = ElementalMatchup.Compare(PlayerElement, EnemyElement);
            var damage = ElementalMatchup.ScaleDamage(baseDamage, effectiveness);
            if (action == ArenaAction.Normal) Rage = Math.Min(MaxRage, Rage + 34);
            else if (action == ArenaAction.Rage) Rage -= RageCost;
            else
            {
                Rage = 0;
                FireZoneColumn = 3;
                FireZoneRow = 3;
                FireZoneTurnsRemaining = 2;
            }

            EnemyHealth = Math.Max(0, EnemyHealth - damage);
            Turn++;
            if (EnemyHealth == 0)
            {
                Phase = ArenaPhase.Victory;
                return new ArenaActionResult(true, "Victory: the training opponent is defeated.", damage,
                    effectiveness: effectiveness);
            }

            var retaliationBase = action == ArenaAction.Rage ? baseEnemyDamage + 2 : baseEnemyDamage;
            var retaliation = ElementalMatchup.ScaleDamage(retaliationBase,
                ElementalMatchup.Compare(EnemyElement, PlayerElement));
            PlayerHealth = Math.Max(0, PlayerHealth - retaliation);
            if (action != ArenaAction.Signature) TickFireZone();
            if (PlayerHealth == 0)
            {
                Phase = ArenaPhase.Defeat;
                return new ArenaActionResult(true, "Defeat: the training opponent won.", damage, retaliation,
                    effectiveness);
            }
            return new ArenaActionResult(true, ActionLabel(action) + " resolved.", damage, retaliation, effectiveness);
        }

        public bool IsFireZoneCell(int column, int row)
        {
            if (!HasFireZone || column < 0 || column >= BoardSize || row < 0 || row >= BoardSize) return false;
            return column >= FireZoneColumn && column < FireZoneColumn + FireZoneSide &&
                   row >= FireZoneRow && row < FireZoneRow + FireZoneSide;
        }

        private void TickFireZone()
        {
            if (FireZoneTurnsRemaining > 0) FireZoneTurnsRemaining--;
            if (FireZoneTurnsRemaining == 0) ClearFireZone();
        }

        private void ClearFireZone()
        {
            FireZoneColumn = -1;
            FireZoneRow = -1;
            FireZoneTurnsRemaining = 0;
        }

        private static ArenaActionResult Reject(string message) => new ArenaActionResult(false, message);

        private static string ActionLabel(ArenaAction action)
        {
            switch (action)
            {
                case ArenaAction.Rage: return "Rage";
                case ArenaAction.Signature: return "Signature / FIRE_ZONE";
                default: return "Normal attack";
            }
        }
    }
}
