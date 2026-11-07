import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/common/app-error.js';
import { assertSameCustomerAsFleet } from './ownership.js';

describe('assertSameCustomerAsFleet', () => {
  it('permite el mismo cliente', () => {
    expect(() => assertSameCustomerAsFleet('c1', 'c1')).not.toThrow();
  });

  it('rechaza cliente distinto con FLEET_VEHICLE_MISMATCH', () => {
    try {
      assertSameCustomerAsFleet('c1', 'c2');
      expect.fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: 'FLEET_VEHICLE_MISMATCH', statusCode: 409 });
    }
  });
});
