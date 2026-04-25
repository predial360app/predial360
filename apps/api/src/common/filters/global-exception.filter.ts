import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import type { ApiError } from '@predial360/shared';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, error } = this.resolveException(exception);

    const body: ApiError = {
      success: false,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${request.method}] ${request.url} → ${status}: ${error.message}`);
    }

    response.status(status).json(body);
  }

  private resolveException(exception: unknown): {
    status: number;
    error: ApiError['error'];
  } {
    // HttpException do NestJS
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        return {
          status,
          error: {
            code: this.statusToCode(status),
            message: typeof resp['message'] === 'string'
              ? resp['message']
              : Array.isArray(resp['message'])
                ? 'Erro de validação'
                : exception.message,
            details: Array.isArray(resp['message'])
              ? { validation: resp['message'] as string[] }
              : undefined,
          },
        };
      }

      return {
        status,
        error: { code: this.statusToCode(status), message: exception.message },
      };
    }

    // Erros Prisma
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos para o banco de dados.' },
      };
    }

    // Erro genérico
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Erro interno do servidor.' },
    };
  }

  private handlePrismaError(e: Prisma.PrismaClientKnownRequestError): {
    status: number;
    error: ApiError['error'];
  } {
    switch (e.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          error: { code: 'DUPLICATE_ENTRY', message: 'Registro já existe.' },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          error: { code: 'NOT_FOUND', message: 'Registro não encontrado.' },
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: { code: 'FOREIGN_KEY_VIOLATION', message: 'Referência inválida.' },
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: { code: 'DATABASE_ERROR', message: 'Erro de banco de dados.' },
        };
    }
  }

  private statusToCode(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codes[status] ?? 'ERROR';
  }
}
