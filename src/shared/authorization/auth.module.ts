import { Global, Module } from '@nestjs/common';
import { AccessSessionCache } from './access-session.cache.js';
import { AccessSessionService } from './access-session.service.js';
import { AuthGuard } from './auth.guard.js';
import { AuthRateLimiter } from './auth-rate-limiter.js';

@Global()
@Module({
  providers: [AuthGuard, AuthRateLimiter, AccessSessionCache, AccessSessionService],
  exports: [AuthGuard, AuthRateLimiter, AccessSessionCache, AccessSessionService],
})
export class AuthModule {}
