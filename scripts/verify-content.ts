import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

function frontmatter(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const data = yaml.load(match[1]);
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

/** Public item ids only — drafts must not be referenced from public trails/themes. */
export function publicItemIds(itemsDir = path.join(process.cwd(), 'content/items')): Set<string> {
  const ids = new Set<string>();
  for (const file of fs.readdirSync(itemsDir).filter((f) => f.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join(itemsDir, file), 'utf8');
    const data = frontmatter(raw);
    const status = (data.status as string | undefined) ?? 'public';
    if (status === 'public') ids.add(file.replace(/\.md$/, ''));
  }
  return ids;
}

export function themeErrors(
  ids: Set<string>,
  themesDir = path.join(process.cwd(), 'content/themes'),
): string[] {
  if (!fs.existsSync(themesDir)) return [];
  const errors: string[] = [];
  for (const file of fs.readdirSync(themesDir).filter((f) => f.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join(themesDir, file), 'utf8');
    const data = frontmatter(raw);
    const title = (data.title as string | undefined) ?? file;
    for (const id of (data.items as string[] | undefined) ?? []) {
      if (!ids.has(id)) {
        errors.push(`Theme "${title}" references missing or non-public item id "${id}"`);
      }
    }
  }
  return errors;
}

export function trailErrors(
  ids: Set<string>,
  trailsDir = path.join(process.cwd(), 'content/trails'),
): string[] {
  if (!fs.existsSync(trailsDir)) return [];
  const errors: string[] = [];
  for (const file of fs.readdirSync(trailsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
    const data = yaml.load(fs.readFileSync(path.join(trailsDir, file), 'utf8')) as {
      from?: string;
      to?: string;
    };
    if (data.from && !ids.has(data.from)) {
      errors.push(`Trail ${file} references missing or non-public from=${data.from}`);
    }
    if (data.to && !ids.has(data.to)) {
      errors.push(`Trail ${file} references missing or non-public to=${data.to}`);
    }
  }
  return errors;
}

export function verifyContent(cwd = process.cwd()): string[] {
  const ids = publicItemIds(path.join(cwd, 'content/items'));
  return [
    ...themeErrors(ids, path.join(cwd, 'content/themes')),
    ...trailErrors(ids, path.join(cwd, 'content/trails')),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = verifyContent();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('content references ok');
}
