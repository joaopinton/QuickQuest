// Logo "quickquest": il puntino della i è una pallina che rimbalza, la seconda q ha una scia.
import { t } from '../i18n';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  class?: string;
}

export function Logo({ size = 'md', class: className = '' }: LogoProps) {
  return (
    <span class={`qq-logo qq-logo--${size} ${className}`} role="img" aria-label={t('brand.name')}>
      <span aria-hidden="true">
        qu<span class="qq-logo__i">ı<span class="qq-logo__dot" /></span>ck<span class="qq-logo__q">q</span>uest
      </span>
    </span>
  );
}
