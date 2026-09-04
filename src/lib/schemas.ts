import { z } from 'astro/zod';

export const itemSchema = z
  .object({
    title: z.string().min(1),
    type: z.enum(['link', 'riff', 'essay']),
    date: z.coerce.date(),
    stance: z.string().min(1),
    url: z.string().url().optional(),
    tags: z.array(z.string()).default([]),
    status: z.enum(['public', 'draft']).default('public'),
    context: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'link' && !data.url) {
      ctx.addIssue({
        code: 'custom',
        message: 'url is required when type is link',
        path: ['url'],
      });
    }
  });

export const trailSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(['supports', 'challenges', 'develops_into', 'related_to', 'superseded_by']),
  reason: z.string().min(1),
  date: z.coerce.date(),
});

export const themeSchema = z.object({
  title: z.string().min(1),
  currentThinking: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
  tensions: z.array(z.string()).default([]),
});
