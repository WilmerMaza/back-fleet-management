import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from '../common/app-error.js';
import { AppLogger } from '../logging/app-logger.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      res.status(exception.statusCode).json({
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details ?? {},
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string' ? body : (body as { message?: string | string[] }).message;
      res.status(status).json({
        statusCode: status,
        code: status === 400 ? 'VALIDATION_ERROR' : 'HTTP_ERROR',
        message: Array.isArray(message) ? message.join(', ') : (message ?? exception.message),
        details: typeof body === 'object' ? body : {},
      });
      return;
    }

    this.logger.error('Error no controlado', exception instanceof Error ? exception : undefined);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Error interno.',
      details: {},
    });
  }
}
