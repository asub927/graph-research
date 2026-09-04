import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateItem, validateTrail, validateTheme } from '../src/lib/gate';
import { scaffoldFromSuggestions } from '../scripts/weekly';
import { publicItemIds, themeErrors, trailErrors, verifyContent } from '../scripts/verify-content';

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

describe('draft exclusion in reference integrity', () => {
  it('publicItemIds excludes draft status', () => {
    const ids = publicItemIds();
    expect(ids.has('private-draft')).toBe(false);
    expect(ids.has('flaky-ci')).toBe(true);
  });

  it('rejects trail pointing at a draft item', () => {
    const ids = publicItemIds();
    const errors = trailErrors(ids);
    // Current corpus has no draft refs; inject via temp dir
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trails-'));
    fs.writeFileSync(
      path.join(root, 'bad.yml'),
      'from: flaky-ci\nto: private-draft\ntype: related_to\nreason: x\ndate: 2026-09-01\n',
    );
    const injected = trailErrors(ids, root);
    expect(injected.some((e) => e.includes('private-draft'))).toBe(true);
  });

  it('rejects theme pointing at a draft item', () => {
    const ids = publicItemIds();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'themes-'));
    fs.writeFileSync(
      path.join(root, 'bad.md'),
      '---\ntitle: Bad\ncurrentThinking: x\nitems:\n  - private-draft\n---\n',
    );
    const injected = themeErrors(ids, root);
    expect(injected.some((e) => e.includes('private-draft'))).toBe(true);
  });

  it('verifyContent passes on the seeded public corpus', () => {
    expect(verifyContent()).toEqual([]);
  });
});
