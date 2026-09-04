import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

type Suggestion = {
  kind: 'trail' | 'theme';
  from?: string;
  to?: string;
  type?: string;
  title?: string;
  items?: string[];
};

function loadSuggestions(filePath: string): Suggestion[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== 'object') return [];
  const suggestions = (parsed as { suggestions?: Suggestion[] }).suggestions;
  return Array.isArray(suggestions) ? suggestions : [];
}

export function scaffoldFromSuggestions(
  suggestions: Suggestion[],
  roots = {
    trails: path.join(process.cwd(), 'content/trails'),
    themes: path.join(process.cwd(), 'content/themes'),
  },
): string[] {
  const created: string[] = [];
  for (const [index, suggestion] of suggestions.entries()) {
    if (suggestion.kind === 'trail') {
      const name = `suggested-trail-${index + 1}.yml`;
      const file = path.join(roots.trails, name);
      const body = [
        `from: ${suggestion.from ?? ''}`,
        `to: ${suggestion.to ?? ''}`,
        `type: ${suggestion.type ?? 'related_to'}`,
        'reason: ""',
        `date: ${new Date().toISOString().slice(0, 10)}`,
        '',
      ].join('\n');
      fs.mkdirSync(roots.trails, { recursive: true });
      fs.writeFileSync(file, body);
      created.push(file);
    }
    if (suggestion.kind === 'theme') {
      const slug = (suggestion.title ?? `suggested-theme-${index + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const file = path.join(roots.themes, `${slug}.md`);
      const items = (suggestion.items ?? []).map((id) => `  - ${id}`).join('\n');
      const body = `---
title: ${suggestion.title ?? 'Suggested theme'}
currentThinking: ""
items:
${items || '  - '}
tensions: []
---

Fill in currentThinking before publishing this theme.
`;
      fs.mkdirSync(roots.themes, { recursive: true });
      fs.writeFileSync(file, body);
      created.push(file);
    }
  }
  return created;
}

function main() {
  const inbox = path.join(process.cwd(), 'inbox/suggestions.yml');
  const suggestions = loadSuggestions(inbox);
  if (suggestions.length === 0) {
    console.log('nothing to review');
    return;
  }
  const created = scaffoldFromSuggestions(suggestions);
  console.log(`scaffolded ${created.length} file(s):`);
  for (const file of created) console.log(`- ${file}`);
  console.log('Fill required reason/currentThinking fields before committing.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
