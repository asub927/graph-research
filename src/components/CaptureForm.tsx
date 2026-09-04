'use client';

import { useState } from 'react';

/**
 * The capture UI.
 *
 * Posts to `/api/ingest` with the ingest token as a bearer header. The token is
 * held in `sessionStorage` rather than a cookie, because the site sets no
 * cookies (R19) and a session-scoped secret should not outlive the tab.
 *
 * This is the one page that genuinely needs client JavaScript, and it is behind
 * the token, so it is not part of the public no-JS surface (R16).
 */

type Kind = 'link' | 'riff' | 'essay';

const TOKEN_KEY = 'fyi.ingest-token';

interface Published {
  short_id: string;
  permalink: string;
  title: string | null;
  edges_created: number;
  summary_generated: boolean;
  edges_generated: boolean;
}

export function CaptureForm() {
  const [token, setToken] = useState(
    () => globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? '',
  );
  const [kind, setKind] = useState<Kind>('link');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [commentary, setCommentary] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<'idle' | 'working'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<Published | null>(null);

  function persistToken(value: string) {
    setToken(value);
    globalThis.sessionStorage?.setItem(TOKEN_KEY, value);
  }

  function reset() {
    setUrl('');
    setTitle('');
    setCommentary('');
    setBody('');
    setTags('');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('working');
    setError(null);
    setPublished(null);

    const tagList = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const payload =
      kind === 'link'
        ? {
            kind,
            url,
            ...(title ? { title } : {}),
            ...(commentary ? { commentary } : {}),
            ...(tagList.length ? { tags: tagList } : {}),
          }
        : kind === 'riff'
          ? {
              kind,
              body,
              ...(title ? { title } : {}),
              ...(tagList.length ? { tags: tagList } : {}),
            }
          : {
              kind,
              url,
              title,
              commentary,
              ...(tagList.length ? { tags: tagList } : {}),
            };

    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : '';
        const problemTitle = typeof data.title === 'string' ? data.title : 'Failed';
        setError(detail ? `${problemTitle}: ${detail}` : problemTitle);
        return;
      }

      setPublished(data as unknown as Published);
      reset();
    } catch (fetchError) {
      setError(`Request failed: ${(fetchError as Error).message}`);
    } finally {
      setStatus('idle');
    }
  }

  const needsUrl = kind === 'link' || kind === 'essay';

  return (
    <form onSubmit={submit}>
      <p>
        <label htmlFor="token">Ingest token</label>
        <br />
        <input
          className="search-input"
          id="token"
          type="password"
          value={token}
          onChange={(event) => persistToken(event.target.value)}
          autoComplete="off"
          placeholder="INGEST_TOKEN"
          style={{ width: '100%' }}
        />
      </p>

      <p>
        <label htmlFor="kind">Kind</label>
        <br />
        <select
          className="search-input"
          id="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as Kind)}
        >
          <option value="link">link — fetch, summarise, and connect a URL</option>
          <option value="riff">riff — write something original</option>
          <option value="essay">essay — point at long-form hosted elsewhere</option>
        </select>
      </p>

      {needsUrl ? (
        <p>
          <label htmlFor="url">URL</label>
          <br />
          <input
            className="search-input"
            id="url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
            placeholder="https://"
            style={{ width: '100%' }}
          />
        </p>
      ) : null}

      <p>
        <label htmlFor="title">
          Title {kind === 'essay' ? '' : <em>(optional — generated if blank)</em>}
        </label>
        <br />
        <input
          className="search-input"
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required={kind === 'essay'}
          style={{ width: '100%' }}
        />
      </p>

      {kind === 'riff' ? (
        <p>
          <label htmlFor="body">Riff (Markdown)</label>
          <br />
          <textarea
            className="search-input"
            id="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            rows={10}
            style={{ width: '100%' }}
          />
        </p>
      ) : (
        <p>
          <label htmlFor="commentary">
            Commentary{' '}
            {kind === 'essay' ? '' : <em>(optional — appears after the summary)</em>}
          </label>
          <br />
          <textarea
            className="search-input"
            id="commentary"
            value={commentary}
            onChange={(event) => setCommentary(event.target.value)}
            required={kind === 'essay'}
            rows={5}
            style={{ width: '100%' }}
          />
        </p>
      )}

      <p>
        <label htmlFor="tags">
          Tags <em>(comma separated, optional)</em>
        </label>
        <br />
        <input
          className="search-input"
          id="tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          style={{ width: '100%' }}
        />
      </p>

      <p>
        <button className="button" type="submit" disabled={status === 'working' || !token}>
          {status === 'working' ? 'Publishing…' : 'Publish'}
        </button>
      </p>

      {error ? (
        <div className="callout" role="alert">
          {error}
        </div>
      ) : null}

      {published ? (
        <div className="callout" role="status">
          <p>
            Published <a href={published.permalink}>{published.title ?? published.short_id}</a>{' '}
            with {published.edges_created} connection
            {published.edges_created === 1 ? '' : 's'}.
          </p>
          <p>
            Summary {published.summary_generated ? 'was model-written' : 'was extracted'};
            connections {published.edges_generated ? 'were model-judged' : 'came from term overlap'}.
          </p>
        </div>
      ) : null}
    </form>
  );
}
