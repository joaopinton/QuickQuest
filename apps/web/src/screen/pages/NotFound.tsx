import { Button, Pupo, t } from '@quickquest/ui';
import { Page } from '../components/SiteChrome';

export function NotFound() {
  return (
    <Page class="not-found">
      <section class="not-found__inner">
        <div class="not-found__pupo">
          <Pupo color="#FF9A3C" mood="lost" motion="breathe" size={200} />
          <span class="not-found__q" aria-hidden="true">?</span>
        </div>
        <h1 class="page-hero__title">{t('notFound.title')}</h1>
        <p class="page-hero__lead">{t('notFound.lead')}</p>
        <Button href="/" size="xl" class="not-found__cta">{t('notFound.cta')}</Button>
      </section>
    </Page>
  );
}
