import Link from 'next/link';
import {fieldGuide, guideLanguage, languages, type GuideLanguage} from '../domain/catalog';
import styles from './field-guide.module.css';

const text = {
  en: {
    title: 'Pet Arena field guide', language: 'Guide language', maps: 'Elemental maps',
    dragon: 'Dragon', bird: 'Bird', pets: 'Planned Pet collection',
    availability: 'Pet collection routes are in development.',
    jewels: 'Battle jewels',
    play: 'Swap adjacent jewels to match three or more. Every Pet draws from the same pool of nine jewels.',
  },
  vi: {
    title: 'Cẩm nang Đấu Trường Linh Thú', language: 'Ngôn ngữ cẩm nang', maps: 'Bản đồ nguyên tố',
    dragon: 'Rồng', bird: 'Chim', pets: 'Bộ sưu tập Linh Thú dự kiến',
    availability: 'Các tuyến thu phục Linh Thú đang được phát triển.',
    jewels: 'Ngọc chiến đấu',
    play: 'Đổi chỗ hai viên ngọc liền kề để ghép từ ba viên trở lên. Mọi Linh Thú dùng chung một nhóm chín loại ngọc.',
  },
  ja: {
    title: 'ペットアリーナ図鑑', language: '図鑑の言語', maps: '属性マップ',
    dragon: 'ドラゴン', bird: '鳥', pets: '登場予定のペット',
    availability: 'ペットの入手ルートは開発中です。',
    jewels: 'バトルジュエル',
    play: '隣り合うジュエルを入れ替えて、同じ種類を3つ以上そろえましょう。すべてのペットに同じ9種類のジュエルが出現します。',
  },
  ko: {
    title: '펫 아레나 도감', language: '도감 언어', maps: '속성 지도',
    dragon: '드래곤', bird: '새', pets: '등장 예정 펫',
    availability: '펫 획득 경로는 개발 중입니다.',
    jewels: '전투 보석',
    play: '인접한 보석을 바꿔 같은 종류를 3개 이상 맞추세요. 모든 펫은 같은 9종의 보석을 사용합니다.',
  },
  zh: {
    title: '灵兽竞技场图鉴', language: '图鉴语言', maps: '元素地图',
    dragon: '龙', bird: '鸟', pets: '计划登场的灵兽',
    availability: '灵兽获取路线仍在开发中。',
    jewels: '战斗宝石',
    play: '交换相邻宝石，连成三个或更多同类宝石。所有灵兽共用同一组九类宝石。',
  },
} satisfies Record<GuideLanguage, Record<string, string>>;

export default function ArenaFieldGuide({language}: {language: string | string[] | undefined}) {
  const locale = guideLanguage(language);
  const copy = text[locale];
  const {maps, jewels} = fieldGuide(locale);

  return <section className={styles.guide} id="arena-field-guide" aria-labelledby="arena-guide-title" lang={locale}>
    <div className={styles.heading}>
      <h2 id="arena-guide-title">{copy.title}</h2>
      <nav className={styles.languages} aria-label={copy.language}>
        {Object.entries(languages).map(([code, name]) =>
          <Link key={code} href={`/?arenaLanguage=${code}#arena-field-guide`} lang={code} hrefLang={code}
            aria-current={locale === code ? 'true' : undefined}>{name}</Link>)}
      </nav>
    </div>
    <h3>{copy.maps}</h3>
    <p className={styles.note}>{copy.availability}</p>
    <div className={styles.maps}>
      {maps.map(map => <article key={map.id} className={styles.map} data-element={map.element}>
        <h4>{map.name}</h4>
        <dl className={styles.families}>
          <dt>{copy.dragon}</dt><dd data-pet-id={map.dragon.id}>{map.dragon.name}</dd>
          <dt>{copy.bird}</dt><dd data-pet-id={map.bird.id}>{map.bird.name}</dd>
        </dl>
        <details>
          <summary>{copy.pets}</summary>
          <ul>{map.pets.map(pet => <li key={pet.id}>{pet.name}</li>)}</ul>
        </details>
      </article>)}
    </div>
    <h3 className={styles.jewelHeading}>{copy.jewels}</h3>
    <p className={styles.note}>{copy.play}</p>
    <dl className={styles.jewels}>
      {jewels.map(jewel => <div key={jewel.id}><dt>{jewel.name}</dt><dd>{jewel.effect}</dd></div>)}
    </dl>
  </section>;
}
