/**
 * Máquina de estados de órdenes (contrato 06).
 * COMPLETED solo vía /complete; /status no lo admite.
 */
export const SERVICE_ORDER_STATUSES = [
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export type ServiceOrderStatus = (typeof SERVICE_ORDER_STATUSES)[number];

const TRANSITIONS: Record<ServiceOrderStatus, readonly ServiceOrderStatus[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  // Complete acepta OPEN|IN_PROGRESS (alineado al mock FE; el grafo /status no incluye COMPLETED).
  IN_PROGRESS: ['CANCELLED', 'COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertTransition(from: ServiceOrderStatus, to: ServiceOrderStatus): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Transición inválida: ${from} → ${to}`);
  }
}

export function canComplete(status: ServiceOrderStatus): boolean {
  return status === 'OPEN' || status === 'IN_PROGRESS';
}

export function assertEditable(status: ServiceOrderStatus): void {
  if (status === 'COMPLETED' || status === 'CANCELLED') {
    throw new Error('ORDER_NOT_EDITABLE');
  }
}

export function isTerminal(status: ServiceOrderStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}
