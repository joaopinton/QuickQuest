// Schermate semplici del controller (testo + un'azione).
import type { ProbeResult } from '@quickquest/motion';
import { normalizeCodeChar, isValidRoomCode } from '@quickquest/protocol';
import { Button, CodeInput, Logo, Piggy, t } from '@quickquest/ui';
import { useState } from 'preact/hooks';

export function EnterCode({ onSubmit, hasError }: { onSubmit: (code: string) => void; hasError: boolean }) {
  const [code, setCode] = useState('');
  const [isInvalid, setInvalid] = useState(hasError);
  const submit = (value: string) => {
    if (isValidRoomCode(value)) onSubmit(value);
    else setInvalid(true);
  };
  return (
    <section class="ctl-screen">
      <Logo size="sm" class="ctl-logo" />
      <div class="ctl-hero">
        <Piggy color="#FFD23F" look={{ hat: 'cap' }} motion="breathe" size={140} />
        <h1 class="ctl-title">{t('code.title')}</h1>
        <p class="ctl-lead">{t('code.lead')}</p>
      </div>
      <form class="ctl-form" onSubmit={(e) => { e.preventDefault(); submit(code); }}>
        <CodeInput
          value={code}
          normalize={normalizeCodeChar}
          onChange={(v) => { setCode(v); setInvalid(false); }}
          onComplete={submit}
          hasError={isInvalid}
          autoFocus
        />
        {isInvalid && <p class="ctl-error" role="alert">{t('code.invalid')}</p>}
        <Button type="submit" size="xl" isBlock disabled={code.length < 4}>{t('code.submit')}</Button>
      </form>
    </section>
  );
}

export function Welcome({ code, error, onConnect }: { code: string; error: string | null; onConnect: () => void }) {
  return (
    <section class="ctl-screen">
      <Logo size="sm" class="ctl-logo" />
      <div class="ctl-hero">
        <Piggy color="#3C8CF0" mood="happy" wave motion="breathe" size={170} />
        <h1 class="ctl-title">{t('controller.welcomeTitle')}</h1>
        <p class="ctl-lead">{t('controller.welcomeLead')}</p>
        <p class="ctl-room">
          <span class="visually-hidden">{`${t('lobby.codeLabel')} ${code.split('').join(' ')}`}</span>
          {code.split('').map((ch, i) => <span key={i} class="ctl-room__tile" aria-hidden="true">{ch}</span>)}
        </p>
      </div>
      <div class="ctl-actions">
        {error && <p class="ctl-banner ctl-banner--danger" role="alert">{error}</p>}
        <Button size="xl" isBlock onClick={onConnect}>{t('controller.connect')}</Button>
        <p class="ctl-hint">{t('controller.connectHint')}</p>
      </div>
    </section>
  );
}

export function Probing({ progress }: { progress: number }) {
  return (
    <section class="ctl-screen ctl-screen--center">
      <div class="ctl-probe" aria-hidden="true">
        <div class="ctl-probe__phone"><span /></div>
        <div class="ctl-probe__waves"><i /><i /><i /></div>
      </div>
      <h1 class="ctl-title">{t('controller.probeTitle')}</h1>
      <p class="ctl-lead">{t('controller.probeLead')}</p>
      <div class="ctl-progress" role="progressbar" aria-label={t('controller.probeTitle')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
    </section>
  );
}

const CHECK_LABEL = { events: 'checks.events', frequency: 'checks.frequency', gyro: 'checks.gyro', accel: 'checks.accel' } as const;

export function Incompatible({ result, onRetry }: { result: ProbeResult; onRetry: () => void }) {
  return (
    <section class="ctl-screen">
      <div class="ctl-hero">
        <Piggy color="#A9B4CC" mood="lost" motion="none" size={130} />
        <h1 class="ctl-title">{t('controller.failTitle')}</h1>
        <p class="ctl-lead">{t('controller.failLead')}</p>
      </div>
      <ul class="ctl-checks">
        {result.checks.map((c) => (
          <li key={c.id} class={`ctl-check ctl-check--${c.status}`}>
            <span class="ctl-check__badge" aria-hidden="true">{c.status === 'fail' ? '✕' : c.status === 'warn' ? '!' : '✓'}</span>
            <span class="ctl-check__label">{t(CHECK_LABEL[c.id])} · {c.value}</span>
            {c.problem && <span class="ctl-check__detail">{t(`problems.${c.problem}`)}</span>}
          </li>
        ))}
      </ul>
      <div class="ctl-actions">
        <Button size="xl" variant="secondary" isBlock onClick={onRetry}>{t('controller.failRetry')}</Button>
        <p class="ctl-hint">{t('controller.failHelp')}</p>
      </div>
    </section>
  );
}

export function Safety({ onOk }: { onOk: () => void }) {
  return (
    <section class="ctl-screen ctl-screen--center">
      <div class="ctl-safety" aria-hidden="true">
        <Piggy color="#34C27A" look={{ hat: 'band' }} mood="idle" motion="breathe" size={150} />
        <svg class="ctl-safety__strap" viewBox="0 0 80 120"><rect x="20" y="4" width="40" height="70" rx="10" fill="#1E2A4A" /><rect x="25" y="11" width="30" height="56" rx="6" fill="#fff" /><path d="M30 74c-10 10-14 26-2 30s14-16 18-30" fill="none" stroke="#FFD23F" stroke-width="6" stroke-linecap="round" /></svg>
      </div>
      <h1 class="ctl-title">{t('controller.safetyTitle')}</h1>
      <p class="ctl-lead">{t('controller.safetyLead')}</p>
      <div class="ctl-actions"><Button size="xl" isBlock onClick={onOk}>{t('controller.safetyOk')}</Button></div>
    </section>
  );
}

export function Blocked({ message }: { message: string }) {
  return (
    <section class="ctl-screen ctl-screen--center">
      <Piggy color="#FF9A3C" mood="lost" motion="breathe" size={150} />
      <h1 class="ctl-title">{message}</h1>
      <div class="ctl-actions"><Button href="/c" size="xl" variant="secondary" isBlock>{t('code.title')}</Button></div>
    </section>
  );
}
