import { itemSchema, trailSchema, themeSchema } from './schemas';

export function validateItem(data: unknown) {
  return itemSchema.safeParse(data);
}

export function validateTrail(data: unknown) {
  return trailSchema.safeParse(data);
}

export function validateTheme(data: unknown) {
  return themeSchema.safeParse(data);
}
