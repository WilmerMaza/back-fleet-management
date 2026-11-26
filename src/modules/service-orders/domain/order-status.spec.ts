import { describe, expect, it } from 'vitest';
import { assertEditable, assertTransition, canComplete } from './order-status.js';

describe('order-status', () => {
  it('permite DRAFT→OPEN e IN_PROGRESS→COMPLETED', () => {
    expect(() => assertTransition('DRAFT', 'OPEN')).not.toThrow();
    expect(() => assertTransition('IN_PROGRESS', 'COMPLETED')).not.toThrow();
  });

  it('rechaza COMPLETED→OPEN', () => {
    expect(() => assertTransition('COMPLETED', 'OPEN')).toThrow(/inválida/);
  });

  it('canComplete solo OPEN/IN_PROGRESS', () => {
    expect(canComplete('OPEN')).toBe(true);
    expect(canComplete('IN_PROGRESS')).toBe(true);
    expect(canComplete('DRAFT')).toBe(false);
    expect(canComplete('COMPLETED')).toBe(false);
  });

  it('assertEditable rechaza terminales', () => {
    expect(() => assertEditable('COMPLETED')).toThrow();
    expect(() => assertEditable('OPEN')).not.toThrow();
  });
});
