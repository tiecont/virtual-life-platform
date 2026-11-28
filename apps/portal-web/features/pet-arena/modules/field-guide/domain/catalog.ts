import roster from '../../../../../../../specs/pet-arena/wave-a-canonical-roster-v1.json';
import campaign from '../../../../../../../specs/pet-arena/campaign-v4-content.json';
import localization from '../../../../../../unity-client/Assets/Aetheria/Features/PetArena/Presentation/Resources/WaveD4/Localization/strings_waved4.json';

export const languages = {
  en: 'English',
  vi: 'Tiếng Việt',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
} as const;

export type GuideLanguage = keyof typeof languages;

export function guideLanguage(value: string | string[] | undefined): GuideLanguage {
  return typeof value === 'string' && Object.hasOwn(languages, value) ? value as GuideLanguage : 'en';
}

const jewelKinds = ['sword', 'mana', 'rage', 'heart', 'shield', 'special', 'nature', 'frost', 'astral'] as const;
const translations: Readonly<Record<string, Record<GuideLanguage, string>>> = localization.entries;

function required<T>(value: T | undefined, key: string): T {
  if (value === undefined) throw new Error('Missing Pet Arena field guide content for ' + key);
  return value;
}

export function fieldGuide(language: GuideLanguage) {
  const localize = (key: string) => required(translations[key], key)[language];
  const identities = new Map(roster.pets.map(pet => [pet.id, {id: pet.id, name: pet.name, family: pet.family}]));
  return {
    maps: campaign.maps.map(map => {
      const pets = map.routes.map(({opponentPetId, tier}) => ({
        ...required(identities.get(opponentPetId), opponentPetId), tier,
      }));
      return {
        id: map.id,
        element: map.element,
        name: localize('map.' + map.id.replaceAll('-', '_')),
        bird: required(pets.find(pet => pet.family === 'bird'), map.id),
        dragon: required(pets.find(pet => pet.family === 'dragon'), map.id),
        pets,
      };
    }),
    jewels: jewelKinds.map(id => ({
      id,
      name: localize('battle.jewel.' + id),
      effect: localize('battle.jewel.' + id + '.effect'),
    })),
  };
}
