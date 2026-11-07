// Cornice del sito: header con navigazione, footer, contenitore di pagina.
import { Button, Logo, Piggy, t } from '@quickquest/ui';
import type { ComponentChildren } from 'preact';
import { useLocation } from 'preact-iso';

const NAV = [
  { href: '/giochi', key: 'nav.games' },
  { href: '/come-si-gioca', key: 'nav.howTo' },
] as const;

export function SiteHeader() {
  const { path } = useLocation();
  return (
    <header class="site-header">
      <a class="skip-link" href="#main">{t('nav.skip')}</a>
      <a href="/" class="site-header__logo" aria-label={t('nav.home')}>
        <Logo size="md" />
      </a>
      <nav class="site-nav" aria-label="Principale">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} class="site-nav__link" aria-current={path === n.href ? 'page' : undefined}>
            {t(n.key)}
          </a>
        ))}
        <Button href="/stanza" size="md" class="site-nav__cta">{t('nav.createRoom')}</Button>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer class="site-footer">
      <div class="site-footer__edge" aria-hidden="true">
        <div class="site-footer__piggy">
          <Piggy color="#FF7EB6" look={{ eyes: 'happy', neck: 'bowtie' }} motion="breathe" size={76} delay={0.3} />
          <Piggy color="#F7C531" look={{ hat: 'cap' }} mood="happy" motion="breathe" size={92} />
          <Piggy color="#2EC4B6" look={{ pattern: 'stars', color2: '#FFF6E8', hat: 'headphones' }} motion="breathe" size={70} delay={1.1} />
        </div>
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none">
          <path d="M0 60 C240 10 420 10 640 40 C860 70 1080 80 1260 40 C1340 22 1400 24 1440 30 V90 H0 Z" fill="#1E2A4A" />
        </svg>
      </div>
      <div class="site-footer__inner">
        <Logo size="sm" />
        <p>{t('footer.made')}</p>
        <p class="site-footer__privacy">{t('footer.privacy')}</p>
      </div>
    </footer>
  );
}

export function Page({ children, class: className = '' }: { children: ComponentChildren; class?: string }) {
  return (
    <>
      <SiteHeader />
      <main id="main" class={`page ${className}`}>{children}</main>
      <SiteFooter />
    </>
  );
}
