import {copy,type Locale} from './copy';
import styles from './site.module.css';
export function Site({locale,registration=false}:{locale:Locale;registration?:boolean}){
 const t=copy[locale],home='/?lang='+locale,path=registration?'/preregister':'/';
 return <div className={styles.site} lang={locale}>
  <a className={styles.skip} href="#main">{t.skip}</a>
  <header className={styles.header}>
   <a className={styles.wordmark} href={home} aria-label="Aetheria: SoulBound">AETHERIA<span>SOULBOUND</span></a>
   <nav className={styles.nav} aria-label={t.nav}>
    <a className={styles.exploreLink} href={home+'#world'}>{t.nav}</a>
    <a className={styles.exploreLink} href={'/pets?lang='+locale}>{locale==='vi'?'Pet & kỹ năng':'Pets & skills'}</a><a className={styles.exploreLink} href={'/gacha?lang='+locale}>{locale==='vi'?'Triệu hồi':'Summoning'}</a><a href={'/preregister?lang='+locale}>{t.join}</a>
    <span className={styles.languages} aria-label={t.language}><a href={path+'?lang=vi'} hrefLang="vi" lang="vi" aria-current={locale==='vi'?'page':undefined}>VI</a><a href={path+'?lang=en'} hrefLang="en" lang="en" aria-current={locale==='en'?'page':undefined}>EN</a></span>
   </nav>
  </header>
  {registration?<main id="main" tabIndex={-1} className={styles.closed}>
   <p className={styles.eyebrow}>Aetheria: SoulBound</p><h1>{t.closed}</h1><p>{t.closedText}</p><p>{t.capacity}</p><p>{t.entitlement}</p><p>{t.statusText}</p><a className={styles.primary} href={home}>{t.home} <span aria-hidden="true">↗</span></a>
  </main>:<main id="main" tabIndex={-1}>
   <section className={styles.hero} aria-labelledby="welcome">
    <div className={styles.heroCopy}><p className={styles.eyebrow}>✦ &nbsp; {t.eyebrow}</p><h1 id="welcome">{t.headline}<em>{t.accent}</em></h1><p className={styles.tagline}>{t.tagline}</p><p className={styles.intro}>{t.intro}</p><div className={styles.actions}><a className={styles.primary} href="#world">{t.explore} <span aria-hidden="true">↓</span></a><a className={styles.secondary} href={'/preregister?lang='+locale}>{t.join}</a></div></div>
    <figure className={styles.art}><img src="/preview-media/world" width={836} height={330} alt="" fetchPriority="high"/><figcaption>{t.concept}</figcaption></figure>
   </section>
   <section id="world" className={styles.chapter} aria-labelledby="world-title"><p className={styles.eyebrow}>{t.chapter}</p><h2 id="world-title">{t.world}</h2><p>{t.worldText}</p><p><a className={styles.secondary} href={'/world?lang='+locale}>{locale==='vi'?'Khám phá thế giới chi tiết':'Explore the world in detail'} →</a> <a className={styles.secondary} href={'/pets?lang='+locale}>{locale==='vi'?'Bách khoa Pet & xem 3D':'Pet atlas & 3D previews'} →</a> <a className={styles.secondary} href={'/pet-arena?lang='+locale}>Pet Arena →</a></p><div className={styles.cards}>{t.cards.map(([number,title,body])=><article className={styles.card} key={number}><span className={styles.number} aria-hidden="true">{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
   <section className={styles.status} aria-labelledby="status-title"><p className={styles.eyebrow}>Aetheria: SoulBound</p><h2 id="status-title">{t.status}</h2><p>{t.statusText}</p><a className={styles.secondary} href={'/preregister?lang='+locale}>{t.closed} <span aria-hidden="true">&nbsp;↗</span></a></section>
   {/* Native details may open before hydration; preserve that user-controlled state. */}
   <section className={styles.faq} id="faq" aria-labelledby="faq-title"><p className={styles.eyebrow}>Aetheria: SoulBound</p><h2 id="faq-title">{t.faq}</h2>{t.questions.map(([question,answer])=><details key={question} suppressHydrationWarning><summary>{question}</summary><p>{answer}</p></details>)}</section>
  </main>}
  <footer className={styles.footer}><span>Aetheria: SoulBound · {t.footer}</span><span>{t.release}</span></footer>
 </div>;
}
