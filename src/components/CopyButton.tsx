'use client';

import { useState } from 'react';

/**
 * Copy-to-clipboard, one of the four places this site ships JavaScript (R16).
 *
 * Renders nothing without JS beyond a button that does nothing — so the text it
 * copies is always also present on the page as selectable content, and the
 * button is an accelerator rather than the only way through.
 *
 * The result is announced in a live region: a button whose label changes is
 * invisible to a screen reader that has already moved on.
 */

interface CopyButtonProps {
  text: string;
  label?: string;
}

type State = 'idle' | 'copied' | 'failed';

export function CopyButton({ text, label = 'Copy to clipboard' }: CopyButtonProps) {
  const [state, setState] = useState<State>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      // Clipboard access is refused outside a secure context, and in some
      // browsers without a user-gesture heuristic we cannot detect. Say so
      // instead of falsely confirming.
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2500);
  }

  return (
    <p className="copy-row">
      <button type="button" className="button" onClick={copy}>
        {label}
      </button>
      <span role="status" aria-live="polite" className="copy-status">
        {state === 'copied' ? 'Copied.' : null}
        {state === 'failed' ? 'Could not copy — select the text below instead.' : null}
      </span>
    </p>
  );
}
