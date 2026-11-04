import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Errors } from '../common/app-error.js';
import { REQUEST_CONTEXT, type RequestContext } from './request-context.js';

export const CurrentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest<{ [REQUEST_CONTEXT]?: RequestContext }>();
    const context = request[REQUEST_CONTEXT];
    if (!context) {
      throw Errors.unauthorized();
    }
    return context;
  },
);
