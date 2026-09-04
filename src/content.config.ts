import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { itemSchema, trailSchema, themeSchema } from './lib/schemas';

const items = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/items' }),
  schema: itemSchema,
});

const trails = defineCollection({
  loader: glob({ pattern: '**/*.{yml,yaml}', base: './content/trails' }),
  schema: trailSchema,
});

const themes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/themes' }),
  schema: themeSchema,
});

export const collections = { items, trails, themes };
