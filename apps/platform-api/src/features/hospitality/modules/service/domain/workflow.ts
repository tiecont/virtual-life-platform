import type { OrderPhase, OrderWorkflowStrategy } from '@virtual-city/contracts';
import { DomainError } from '../../../../../shared/common/errors';
import { nextOrderPhase } from './lifecycle';
export type ServiceAction = 'prepare' | 'ready' | 'serve';
export function advanceService(workflow: OrderWorkflowStrategy, phase: OrderPhase, course: number, readyAt: number | null, action: ServiceAction, at: number) {
  const next = nextOrderPhase(phase, action), step = workflow.courses[course];
  if (!step || !Number.isFinite(at)) throw new DomainError('NOT_AVAILABLE', 409, 'Refresh this order');
  if (action === 'ready' && (readyAt === null || at < readyAt)) throw new DomainError('NOT_AVAILABLE', 409, 'Preparation has not finished');
  return { phase: action === 'serve' && course + 1 < workflow.courses.length ? 'ASSIGNED' as const : next, course: action === 'serve' && course + 1 < workflow.courses.length ? course + 1 : course, readyAt: action === 'prepare' ? at + step.prepareSeconds * 1000 : action === 'ready' ? readyAt : null };
}
