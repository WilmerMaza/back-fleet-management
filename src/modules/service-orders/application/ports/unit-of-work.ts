/** Cliente de TX opaco hacia Application (Prisma solo en infrastructure). */
export type TransactionClient = unknown;

export interface UnitOfWork {
  run<T>(work: (tx: TransactionClient) => Promise<T>): Promise<T>;
}
