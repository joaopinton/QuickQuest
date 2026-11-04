// Bottone "giocattolo" con bordo 3D che affonda alla pressione (docs/08 § 4).
import type { ComponentChildren, JSX } from 'preact';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent';
export type ButtonSize = 'md' | 'lg' | 'xl';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isBlock?: boolean;
  icon?: ComponentChildren;
  children: ComponentChildren;
  class?: string;
}

type AsButton = CommonProps & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'icon' | 'class'> & { href?: undefined };
type AsLink = CommonProps & Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, 'size' | 'icon' | 'class'> & { href: string };

export type ButtonProps = AsButton | AsLink;

export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', isBlock = false, icon, children, class: className = '', ...rest } = props;
  const cls = `qq-btn qq-btn--${variant} qq-btn--${size} ${isBlock ? 'qq-btn--block' : ''} ${className}`;
  const inner = (
    <>
      {icon && <span class="qq-btn__icon" aria-hidden="true">{icon}</span>}
      <span class="qq-btn__label">{children}</span>
    </>
  );
  if (typeof rest.href === 'string') {
    return <a class={cls} {...(rest as JSX.AnchorHTMLAttributes<HTMLAnchorElement>)}>{inner}</a>;
  }
  const buttonProps = rest as JSX.ButtonHTMLAttributes<HTMLButtonElement>;
  return <button type="button" class={cls} {...buttonProps}>{inner}</button>;
}
