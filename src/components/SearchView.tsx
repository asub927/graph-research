'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Semantic search, one of the four places this site ships JavaScript (R16).
 *
 * It searches on submit rather than as you type: each query costs an embedding
 * call, and a debounce would spend several of them on the way to one intended
 * search. `?q=` runs on load, so a search result is a linkable, shareable URL
 * rather than a state only this tab knows about.
 *
 * The three outcomes — results, nothing found, request failed — are stated
 * separately. "No results" and "the search broke" are different facts and
 * collapsing them into one empty list is how a reader concludes the corpus is
 * empty when the server is merely down.
 */

interface ApiItem {
  short_id: string;
  title: string | null;
  excerpt: string;
  type: string;
  score: number;
  permalink: string;
  connections: number;
}

interface ApiResponse {
  query: string;
  count: number;
  items: ApiItem[];
  embeddings: 'model' | 'local-term-overlap';
}

type Status =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; response: ApiResponse }
  | { phase: 'error'; message: string };

const EXAMPLES = [
  'how agents should read a personal site',
  'why derived structure beats hand-made taxonomies',
  'arguments against measuring developer productivity',
  'when a knowledge graph stops being worth the effort',
  'writing that changed its own mind',
];

export function SearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const [input, setInput] = useState(initialQuery);
  const [status, setStatus] = useState<Status>({ phase: 'idle' });
  const [hasSearched, setHasSearched] = useState(false);
  // Lets a slow response from an abandoned query be discarded rather than
  // overwriting the results of the one the reader is actually waiting on.
  const requestRef = useRef(0);

  const run = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed === '') return;

    const requestId = ++requestRef.current;
    setHasSearched(true);
    setStatus({ phase: 'loading' });

    try {
      const response = await fetch(
        `/api/fyi/q/semantic/${encodeURIComponent(trimmed)}?limit=20`,
        { headers: { accept: 'application/json' } },
      );
      if (requestId !== requestRef.current) return;

      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          title?: string;
          detail?: string;
        } | null;
        setStatus({
          phase: 'error',
          message:
            problem?.detail ??
            problem?.title ??
            `The search request failed (${response.status}).`,
        });
        return;
      }

      setStatus({ phase: 'done', response: (await response.json()) as ApiResponse });
    } catch {
      if (requestId !== requestRef.current) return;
      setStatus({
        phase: 'error',
        message: 'Could not reach the search API. Check your connection and retry.',
      });
    }
  }, []);

  // Run whatever `?q=` says, including after a back/forward navigation.
  useEffect(() => {
    const query = searchParams.get('q') ?? '';
    setInput(query);
    if (query.trim() !== '') void run(query);
  }, [searchParams, run]);

  function submit(query: string) {
    const trimmed = query.trim();
    if (trimmed === '') return;
    // Pushing the query into the URL is what makes a result linkable; the
    // effect above is what actually runs it.
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <>
      <form
        className="search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <label className="visually-hidden" htmlFor="search-input">
          Search this site
        </label>
        <input
          id="search-input"
          className="search-input"
          type="search"
          name="q"
          value={input}
          autoFocus
          autoComplete="off"
          placeholder="Describe what you are looking for"
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" className="button">
          Search
        </button>
      </form>

      {!hasSearched ? (
        <div className="search-examples">
          <p>Or try one of these:</p>
          <ul>
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => submit(example)}
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div aria-live="polite" aria-busy={status.phase === 'loading'}>
        {status.phase === 'loading' ? (
          <p className="search-status">Searching&hellip;</p>
        ) : null}

        {status.phase === 'error' ? (
          <p className="search-status search-error">{status.message}</p>
        ) : null}

        {status.phase === 'done' ? <Results response={status.response} /> : null}
      </div>
    </>
  );
}

function Results({ response }: { response: ApiResponse }) {
  if (response.count === 0) {
    return (
      <p className="search-status">
        Nothing matched &ldquo;{response.query}&rdquo;. The corpus is one
        person&rsquo;s reading, so a plausible query can genuinely have no
        answer here. Try a broader phrasing, or browse{' '}
        <a href="/themes">the themes</a>.
      </p>
    );
  }

  return (
    <>
      <p className="search-status">
        {response.count} result{response.count === 1 ? '' : 's'} for &ldquo;
        {response.query}&rdquo;
        {response.embeddings === 'local-term-overlap' ? (
          <>
            {' '}
            &mdash; ranked by shared terms rather than meaning, because this
            deployment has no embedding model configured.
          </>
        ) : null}
      </p>
      <ol className="ranked-list">
        {response.items.map((item) => (
          <li key={item.short_id}>
            <span className="ranked-count">{item.score.toFixed(2)}</span>
            <span className="ranked-body">
              <a className="ranked-title" href={`/i/${item.short_id}`}>
                {item.title ?? `Untitled ${item.type}`}
              </a>
              <span className="ranked-detail">{item.excerpt}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
