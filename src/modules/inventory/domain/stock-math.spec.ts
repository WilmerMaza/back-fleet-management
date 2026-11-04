import { describe, expect, it } from 'vitest';
import { qty } from '../../../shared/common/decimal.js';
import { AppError } from '../../../shared/common/app-error.js';
import { nextStock } from './stock-math.js';

describe('nextStock', () => {
  it('suma entradas y restas salidas', () => {
    expect(nextStock(qty('10'), 'ENTRY', qty('2.5'), 'p').toString()).toBe('12.5');
    expect(nextStock(qty('10'), 'EXIT', qty('7'), 'p').toString()).toBe('3');
  });

  it('rechaza salida sin saldo', () => {
    try {
      nextStock(qty('3'), 'EXIT', qty('7'), 'p1');
      throw new Error('expected');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INSUFFICIENT_STOCK');
    }
  });

  it('ajuste fija saldo absoluto e impide negativo', () => {
    expect(nextStock(qty('20'), 'ADJUSTMENT', qty('15'), 'p').toString()).toBe('15');
    expect(nextStock(qty('20'), 'ADJUSTMENT', qty('0'), 'p').toString()).toBe('0');
    expect(() => nextStock(qty('20'), 'ADJUSTMENT', qty('-1'), 'p')).toThrow();
  });
});
