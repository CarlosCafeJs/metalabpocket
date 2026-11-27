import { z } from 'zod';

export const instaflowRatingInputSchema = z.object({ stars: z.number().int().min(1).max(5) }).strict();
