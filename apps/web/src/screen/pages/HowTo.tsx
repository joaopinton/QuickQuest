import { Button, Piggy, t } from '@quickquest/ui';
import { PhoneDuo } from '../components/Decor';
import { PhoneScanning, ScreenWithQr, ThumbButton } from '../components/Illustrations';
import { Page } from '../components/SiteChrome';

const STEPS = [
  { n: 1, title: 'steps.s1Title', text: 'steps.s1Text', Illo: ScreenWithQr },
  { n: 2, title: 'steps.s2Title', text: 'steps.s2Text', Illo: PhoneScanning },
  { n: 3, title: 'steps.s3Title', text: 'steps.s3Text', Illo: ThumbButton },
] as const;

const GESTURE = ['howTo.g1', 'howTo.g2', 'howTo.g3', 'howTo.g4'] as const;

// Icone disegnate (niente emoji: cambiano aspetto da un telefono all'altro).
const StrapIcon = () => (
  <svg viewBox="0 0 48 48"><rect x="17" y="6" width="16" height="28" rx="5" fill="#fff" /><path d="M21 34c-6 4-8 10-3 10s5-6 7-10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" /></svg>
);
const SpaceIcon = () => (
  <svg viewBox="0 0 48 48"><path d="M6 24h36M6 24l7-7M6 24l7 7M42 24l-7-7M42 24l-7 7" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
);
const SoundIcon = () => (
  <svg viewBox="0 0 48 48"><path d="M8 19h8l10-8v26l-10-8H8z" fill="#fff" /><path d="M32 17c4 4 4 10 0 14M37 12c7 7 7 17 0 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" /></svg>
);

const SAFETY = [
  { title: 'howTo.safety1Title', text: 'howTo.safety1', Icon: StrapIcon, tone: 'cherry' },
  { title: 'howTo.safety2Title', text: 'howTo.safety2', Icon: SpaceIcon, tone: 'ocean' },
  { title: 'howTo.safety3Title', text: 'howTo.safety3', Icon: SoundIcon, tone: 'mint' },
] as const;

export function HowTo() {
  return (
    <Page class="howto">
      <section class="page-hero page-hero--art">
        <div>
          <h1 class="page-hero__title">{t('howTo.title')}</h1>
          <p class="page-hero__lead">{t('howTo.lead')}</p>
        </div>
        <PhoneDuo />
      </section>

      <section class="section">
        <ol class="big-steps">
          {STEPS.map(({ n, title, text, Illo }) => (
            <li key={n} class="big-step">
              <div class="big-step__art"><Illo /></div>
              <div class="big-step__copy">
                <span class="big-step__num" aria-hidden="true">{n}</span>
                <h2 class="big-step__title">{t(title)}</h2>
                <p>{t(text)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section class="section gesture" aria-labelledby="gesture-title">
        <div class="gesture__card">
          <div class="gesture__stage" aria-hidden="true">
            <div class="gesture__lane" />
            <Piggy color="#9C6BFF" look={{ hat: 'band' }} ball motion="none" size={220} class="gesture__piggy" />
          </div>
          <div class="gesture__copy">
            <h2 id="gesture-title" class="section__title">{t('howTo.gestureTitle')}</h2>
            <p class="section__lead">{t('howTo.gestureLead')}</p>
            <ol class="gesture__list">
              {GESTURE.map((k, i) => (
                <li key={k}><span class="gesture__n" aria-hidden="true">{i + 1}</span>{t(k)}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="safety-title">
        <h2 id="safety-title" class="section__title">{t('howTo.safetyTitle')}</h2>
        <div class="tips">
          {SAFETY.map((s) => (
            <article key={s.title} class={`tip tip--${s.tone}`}>
              <span class="tip__icon" aria-hidden="true"><s.Icon /></span>
              <h3 class="tip__title">{t(s.title)}</h3>
              <p>{t(s.text)}</p>
            </article>
          ))}
        </div>
      </section>

      <section class="section reqs" aria-labelledby="reqs-title">
        <h2 id="reqs-title" class="section__title">{t('howTo.reqTitle')}</h2>
        <ul class="reqs__list">
          <li>{t('howTo.req1')}</li>
          <li>{t('howTo.req2')}</li>
          <li>{t('howTo.req3')}</li>
        </ul>
      </section>

      <section class="section cta-band">
        <div class="cta-band__inner">
          <div>
            <h2 class="section__title">{t('howTo.ctaTitle')}</h2>
            <p class="section__lead">{t('howTo.ctaLead')}</p>
          </div>
          <Button href="/stanza" size="xl" variant="accent">{t('nav.createRoom')}</Button>
        </div>
      </section>
    </Page>
  );
}
