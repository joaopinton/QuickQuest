import { GAMES } from '@quickquest/games';
import { Button, Dialog, PLAYER_SLOTS, Bubu, t } from '@quickquest/ui';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { GameCard } from '../components/GameCard';
import { HeroScene } from '../components/HeroScene';
import { PhoneScanning, ScreenWithQr, ThumbButton } from '../components/Illustrations';
import { JoinWithCode } from '../components/JoinWithCode';
import { Confetti } from '../components/Decor';
import { Page } from '../components/SiteChrome';

const STEPS = [
  { n: 1, title: 'steps.s1Title', text: 'steps.s1Text', Illo: ScreenWithQr },
  { n: 2, title: 'steps.s2Title', text: 'steps.s2Text', Illo: PhoneScanning },
  { n: 3, title: 'steps.s3Title', text: 'steps.s3Text', Illo: ThumbButton },
] as const;

function Hero({ onCode }: { onCode: () => void }) {
  return (
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero__copy">
        <p class="eyebrow">{t('home.eyebrow')}</p>
        <h1 id="hero-title" class="hero__title">
          <span>{t('home.titleA')}</span>
          <span class="hero__title-hl">{t('home.titleB')}</span>
        </h1>
        <p class="hero__lead">{t('home.lead')}</p>
        <div class="hero__ctas hero__ctas--screen">
          <Button href="/stanza" size="lg">{t('home.ctaCreate')}</Button>
          <Button variant="secondary" size="lg" onClick={onCode}>{t('home.ctaCode')}</Button>
        </div>
        <div class="hero__phone-card">
          <h2 class="hero__phone-title">{t('home.phoneTitle')}</h2>
          <p>{t('home.phoneLead')}</p>
          <JoinWithCode />
        </div>
        <p class="hero__players">
          <span class="hero__symbols" aria-hidden="true">
            {PLAYER_SLOTS.map((s) => (
              <span key={s.id} style={{ '--slot': s.hex } as JSX.CSSProperties}>{s.symbol}</span>
            ))}
          </span>
          {t('home.players')}
        </p>
      </div>
      <div class="hero__art">
        <Confetti />
        <HeroScene />
      </div>
    </section>
  );
}

function Steps() {
  return (
    <section class="section steps" aria-labelledby="steps-title">
      <div class="section__head">
        <h2 id="steps-title" class="section__title">{t('home.stepsTitle')}</h2>
        <a class="link-arrow" href="/come-si-gioca">{t('home.stepsMore')}</a>
      </div>
      <ol class="steps__list">
        {STEPS.map(({ n, title, text, Illo }) => (
          <li key={n} class={`step step--${n}`}>
            <span class="step__num" aria-hidden="true">{n}</span>
            <div class="step__art"><Illo /></div>
            <h3 class="step__title">{t(title)}</h3>
            <p class="step__text">{t(text)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GamesShowcase() {
  return (
    <section class="section showcase" aria-labelledby="showcase-title">
      <div class="section__head">
        <div>
          <h2 id="showcase-title" class="section__title">{t('home.gamesTitle')}</h2>
          <p class="section__lead">{t('home.gamesLead')}</p>
        </div>
        <a class="link-arrow" href="/giochi">{t('home.gamesMore')}</a>
      </div>
      <div class="bento">
        {GAMES.map((g) => <GameCard key={g.id} game={g} />)}
      </div>
    </section>
  );
}

function Requirement() {
  return (
    <section class="section requirement" aria-labelledby="req-title">
      <div class="requirement__card">
        <div class="requirement__art" aria-hidden="true">
          <div class="gyro">
            <span class="gyro__ring gyro__ring--a" />
            <span class="gyro__ring gyro__ring--b" />
            <span class="gyro__ring gyro__ring--c" />
          </div>
          <Bubu color="#2EC4B6" look={{ pattern: 'spots', mouth: 'cat', hat: 'leaves' }} mood="happy" motion="breathe" size={150} />
        </div>
        <div>
          <h2 id="req-title" class="section__title">{t('home.requirementTitle')}</h2>
          <p class="section__lead">{t('home.requirementLead')}</p>
        </div>
      </div>
    </section>
  );
}

export function Home() {
  const [isCodeOpen, setCodeOpen] = useState(false);
  return (
    <Page class="home">
      <Hero onCode={() => setCodeOpen(true)} />
      <Steps />
      <GamesShowcase />
      <Requirement />
      <Dialog isOpen={isCodeOpen} onClose={() => setCodeOpen(false)} title={t('code.dialogTitle')}>
        <h2 class="dialog-title">{t('code.dialogTitle')}</h2>
        <p class="dialog-lead">{t('code.dialogLead')}</p>
        {isCodeOpen && <JoinWithCode autoFocus />}
      </Dialog>
    </Page>
  );
}
