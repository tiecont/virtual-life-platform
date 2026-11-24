using System;

namespace Aetheria.PetArena.Domain
{
    public enum PetElement
    {
        Normal,
        Fire,
        Water,
        Grass,
        Electric,
        Ice
    }

    public enum ElementEffectiveness
    {
        Resisted,
        Neutral,
        Strong
    }

    // The MVP presents six canonical elements. This is a bounded training
    // table, not the 19-element authoritative v3 reducer.
    public static class ElementalMatchup
    {
        public const int ElementCount = 6;

        public static ElementEffectiveness Compare(PetElement attacker, PetElement defender)
        {
            switch (attacker)
            {
                case PetElement.Fire:
                    if (defender == PetElement.Water) return ElementEffectiveness.Resisted;
                    if (defender == PetElement.Grass || defender == PetElement.Ice)
                        return ElementEffectiveness.Strong;
                    break;
                case PetElement.Water:
                    if (defender == PetElement.Grass || defender == PetElement.Electric)
                        return ElementEffectiveness.Resisted;
                    if (defender == PetElement.Fire) return ElementEffectiveness.Strong;
                    break;
                case PetElement.Grass:
                    if (defender == PetElement.Fire || defender == PetElement.Ice)
                        return ElementEffectiveness.Resisted;
                    if (defender == PetElement.Water) return ElementEffectiveness.Strong;
                    break;
                case PetElement.Electric:
                    if (defender == PetElement.Grass) return ElementEffectiveness.Resisted;
                    if (defender == PetElement.Water) return ElementEffectiveness.Strong;
                    break;
                case PetElement.Ice:
                    if (defender == PetElement.Fire) return ElementEffectiveness.Resisted;
                    if (defender == PetElement.Grass) return ElementEffectiveness.Strong;
                    break;
            }
            return ElementEffectiveness.Neutral;
        }

        public static int ScaleDamage(int baseDamage, ElementEffectiveness effectiveness)
        {
            if (baseDamage < 0) throw new ArgumentOutOfRangeException(nameof(baseDamage));
            if (effectiveness == ElementEffectiveness.Strong) return (baseDamage * 3) / 2;
            if (effectiveness == ElementEffectiveness.Resisted) return (baseDamage * 3) / 4;
            return baseDamage;
        }

        public static string Label(PetElement element)
        {
            switch (element)
            {
                case PetElement.Fire: return "Fire";
                case PetElement.Water: return "Water";
                case PetElement.Grass: return "Grass";
                case PetElement.Electric: return "Electric";
                case PetElement.Ice: return "Ice";
                default: return "Normal";
            }
        }
    }
}
