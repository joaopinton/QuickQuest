// Inserimento del codice stanza: nella home (telefono) e nel dialog "Ho un codice".
import { isValidRoomCode, normalizeCodeChar } from '@quickquest/protocol';
import { Button, CodeInput, t } from '@quickquest/ui';
import { useLocation } from 'preact-iso';
import { useState } from 'preact/hooks';

export function JoinWithCode({ autoFocus = false }: { autoFocus?: boolean }) {
  const { route } = useLocation();
  const [code, setCode] = useState('');
  const [hasError, setHasError] = useState(false);

  const go = (value: string) => {
    if (!isValidRoomCode(value)) {
      setHasError(true);
      return;
    }
    route(`/c/${value}`);
  };

  return (
    <form
      class="join-code"
      onSubmit={(e) => {
        e.preventDefault();
        go(code);
      }}
    >
      <CodeInput
        value={code}
        normalize={normalizeCodeChar}
        onChange={(v) => {
          setCode(v);
          setHasError(false);
        }}
        onComplete={go}
        hasError={hasError}
        autoFocus={autoFocus}
      />
      {hasError && <p class="join-code__error" role="alert">{t('code.invalid')}</p>}
      <Button type="submit" size="lg" isBlock disabled={code.length < 4}>{t('code.submit')}</Button>
    </form>
  );
}
