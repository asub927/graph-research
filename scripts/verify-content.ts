import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

function itemIds(): Set<string> {
  const dir = path.join(process.cwd(), 'content/items');
  return new Set(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, '')),
  );
}

function themeErrors(ids: Set<string>): string[] {
  const dir = path.join(process.cwd(), 'content/themes');
  if (!fs.existsSync(dir)) return [];
  const errors: string[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!match) continue;
    const data = yaml.load(match[1]) as { items?: string[]; title?: string };
    for (const id of data.items ?? []) {
      if (!ids.has(id)) {
        errors.push(`Theme "${data.title ?? file}" references missing item id "${id}"`);
      }
    }
  }
  return errors;
}

function trailErrors(ids: Set<string>): string[] {
  const dir = path.join(process.cwd(), 'content/trails');
  if (!fs.existsSync(dir)) return [];
  const errors: string[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
    const data = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8')) as {
      from?: string;
      to?: string;
    };
    if (data.from && !ids.has(data.from)) errors.push(`Trail ${file} missing from=${data.from}`);
    if (data.to && !ids.has(data.to)) errors.push(`Trail ${file} missing to=${data.to}`);
  }
  return errors;
}

const ids = itemIds();
const errors = [...themeErrors(ids), ...trailErrors(ids)];
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('content references ok');
