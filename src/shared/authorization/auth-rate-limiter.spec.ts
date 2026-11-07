/**
 * Unitarios SEC-01: ventanas por IP y por (IP+email) tras fallos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../common/app-error.js';
import { AuthRateLimiter } from './auth-rate-limiter.js';

describe('AuthRateLimiter', () => {
  let limiter: AuthRateLimiter;

  beforeEach(() => {
    limiter = new AuthRateLimiter();
    limiter.configure({
      enabled: true,
      loginIpMax: 3,
      loginIpWindowMs: 60_000,
      loginAccountMax: 2,
      loginAccountWindowMs: 60_000,
      refreshIpMax: 2,
      refreshIpWindowMs: 60_000,
    });
    limiter.reset();
  });

  afterEach(() => {
    limiter.reset();
  });

  it('bloquea login por IP al exceder el techo', () => {
    limiter.enforceLoginIp('1.1.1.1');
    limiter.enforceLoginIp('1.1.1.1');
    limiter.enforceLoginIp('1.1.1.1');
    expect(() => limiter.enforceLoginIp('1.1.1.1')).toThrow(AppError);
    try {
      limiter.enforceLoginIp('1.1.1.1');
    } catch (error) {
      expect(error).toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 });
    }
  });

  it('bloquea cuenta solo tras fallos registrados (IP+email)', () => {
    limiter.enforceLoginAccount('1.1.1.1', 'a@fleet.local');
    limiter.recordLoginFailure('1.1.1.1', 'a@fleet.local');
    limiter.enforceLoginAccount('1.1.1.1', 'a@fleet.local');
    limiter.recordLoginFailure('1.1.1.1', 'a@fleet.local');
    expect(() => limiter.enforceLoginAccount('1.1.1.1', 'a@fleet.local')).toThrow(AppError);
    // Otra IP no hereda el bloqueo de cuenta.
    expect(() => limiter.enforceLoginAccount('2.2.2.2', 'a@fleet.local')).not.toThrow();
  });

  it('clearLoginAccount permite reintentar tras éxito', () => {
    limiter.recordLoginFailure('1.1.1.1', 'a@fleet.local');
    limiter.recordLoginFailure('1.1.1.1', 'a@fleet.local');
    limiter.clearLoginAccount('1.1.1.1', 'a@fleet.local');
    expect(() => limiter.enforceLoginAccount('1.1.1.1', 'a@fleet.local')).not.toThrow();
  });

  it('bloquea refresh por IP', () => {
    limiter.enforceRefreshIp('9.9.9.9');
    limiter.enforceRefreshIp('9.9.9.9');
    expect(() => limiter.enforceRefreshIp('9.9.9.9')).toThrow(AppError);
  });

  it('disabled no aplica techos', () => {
    limiter.configure({ enabled: false });
    for (let i = 0; i < 20; i++) {
      expect(() => limiter.enforceLoginIp('1.1.1.1')).not.toThrow();
      expect(() => limiter.enforceRefreshIp('1.1.1.1')).not.toThrow();
    }
  });
});
