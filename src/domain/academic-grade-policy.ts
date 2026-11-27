import { z } from 'zod';

const scoreValue = z.number().finite().min(0).max(10).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, 'Use no máximo duas casas decimais.');
const maximumScoreValue = z.number().finite().min(0.01).max(10).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, 'Use no máximo duas casas decimais.');

export const academicEvaluationInputSchema = z.object({
  targetKind: z.enum(['delivery','classroom_submission']),
  targetId: z.string().uuid(),
  score: scoreValue,
  maximumScore: maximumScoreValue,
  comment: z.string().trim().max(2000).default(''),
  publicationState: z.enum(['draft','published'])
}).strict().refine(value => value.score <= value.maximumScore, {
  message: 'A nota não pode ultrapassar o valor máximo.',
  path: ['score']
});

export function canEditEvaluation(actorRole: 'teacher' | 'admin', actorId: string, evaluatorId: string) {
  return actorRole === 'admin' || actorId === evaluatorId;
}
