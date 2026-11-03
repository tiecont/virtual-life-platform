import type { OrderPhase } from '@virtual-city/contracts';
import { DomainError } from '../common/errors';
export type OrderAction = 'claim' | 'prepare' | 'ready' | 'serve' | 'complete' | 'cancel' | 'requeue';
const edges: Partial<Record<OrderPhase, Partial<Record<OrderAction, OrderPhase>>>> = { PENDING: { claim: 'ASSIGNED', cancel: 'CANCELLED' }, ASSIGNED: { prepare: 'PREPARING', requeue: 'PENDING' }, PREPARING: { ready: 'READY', requeue: 'PENDING' }, READY: { serve: 'SERVED', requeue: 'PENDING' }, SERVED: { complete: 'COMPLETED' } };
export function nextOrderPhase(phase: OrderPhase, action: OrderAction): OrderPhase {
  const next = edges[phase]?.[action]; if (!next) throw new DomainError('NOT_AVAILABLE', 409, 'The order changed'); return next;
}
