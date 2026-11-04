import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';

@Global()
@Module({
  providers: [AuthGuard],
  exports: [AuthGuard],
})
export class AuthModule {}
