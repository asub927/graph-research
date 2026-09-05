'use client';

import { useEffect } from 'react';

/**
 * Pick one permalink and go there, one of the four places this site ships
 * JavaScript (R16).
 *
 * `location.replace` rather than an assignment, so the back button returns to
 * wherever the reader came from instead of to this page, which would
 * immediately redirect them somewhere else and trap them.
 *
 * The candidate list is passed in from the server rather than fetched, so the
 * jump costs no round trip. The list is also rendered visibly by the parent,
 * which is what makes the no-JavaScript path work.
 */

interface RandomRedirectProps {
  shortIds: readonly string[];
}

export function RandomRedirect({ shortIds }: RandomRedirectProps) {
  useEffect(() => {
    if (shortIds.length === 0) return;
    const pick = shortIds[Math.floor(Math.random() * shortIds.length)]!;
    window.location.replace(`/i/${pick}`);
  }, [shortIds]);

  return null;
}
