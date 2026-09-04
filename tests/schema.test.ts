import { describe, expect, it } from 'vitest';
import { validateItem, validateTrail, validateTheme } from '../src/lib/gate';
import { scaffoldFromSuggestions } from '../scripts/weekly';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('stance gate', () => {
  it('rejects link with empty stance', () => {
    const result = validateItem({
      title: 'x',
      type: 'link',
      date: '2026-09-01',
      stance: '',
      url: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects link without url', () => {
    const result = validateItem({
      title: 'x',
      type: 'link',
      date: '2026-09-01',
      stance: 'hello',
    });
    expect(result.success).toBe(false);
  });

  it('accepts riff without url', () => {
    const result = validateItem({
      title: 'x',
      type: 'riff',
      date: '2026-09-01',
      stance: 'hello',
    });
    expect(result.success).toBe(true);
  });
});

describe('trails and themes', () => {
  it('rejects trail without reason', () => {
    const result = validateTrail({
      from: 'a',
      to: 'b',
      type: 'supports',
      reason: '',
      date: '2026-09-01',
    });
    expect(result.success).toBe(false);
  });

  it('accepts theme with currentThinking and items', () => {
    const result = validateTheme({
      title: 'Habit',
      currentThinking: 'Protect cadence',
      items: ['one-command-publish'],
    });
    expect(result.success).toBe(true);
  });
});

describe('weekly scaffold', () => {
  it('creates trail scaffold with empty reason', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-'));
    const trails = path.join(root, 'trails');
    const themes = path.join(root, 'themes');
    const created = scaffoldFromSuggestions(
      [{ kind: 'trail', from: 'a', to: 'b', type: 'challenges' }],
      { trails, themes },
    );
    expect(created).toHaveLength(1);
    const body = fs.readFileSync(created[0], 'utf8');
    expect(body).toContain('reason: ""');
  });
});
