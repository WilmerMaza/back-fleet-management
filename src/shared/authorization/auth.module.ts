import { Global, Module } from '@nestjs/common';
import { AccessSessionCache } from './access-session.cache.js';
import { AccessSessionService } from './access-session.service.js';
import { AuthGuard } from './auth.guard.js';
import { JwtUserGuard } from './jwt-user.guard.js';
import { AuthRateLimiter } from './auth-rate-limiter.js';
import { PermissionResolverService } from './permission-resolver.service.js';

@Global()
@Module({
  providers: [
    AuthGuard,
    JwtUserGuard,
    AuthRateLimiter,
    AccessSessionCache,
    AccessSessionService,
    PermissionResolverService,
  ],
  exports: [
    AuthGuard,
    JwtUserGuard,
    AuthRateLimiter,
    AccessSessionCache,
    AccessSessionService,
    PermissionResolverService,
  ],
})
export class AuthModule {}
