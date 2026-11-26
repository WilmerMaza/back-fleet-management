/**
 * Entrypoint Nest CLI / `node dist/main` local.
 *
 * En Vercel (preset Express) el entrypoint canónico es `src/app.ts`.
 * Este archivo reexporta la misma app para no duplicar bootstrap.
 */
export { default } from './app.js';
