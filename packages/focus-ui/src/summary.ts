import { FocusSessionSchema } from '@aetheria/contracts';
export function completionSummary(raw: unknown) {
  const session = FocusSessionSchema.parse(raw);
  if (session.phase !== 'completed') return null;
  return `I completed a ${session.durationSeconds / 60}-minute focus timer.`;
}
