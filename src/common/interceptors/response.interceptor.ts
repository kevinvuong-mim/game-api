import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Response } from 'express';
import { Injectable, CallHandler, NestInterceptor, ExecutionContext } from '@nestjs/common';

import { SuccessResponse } from '@/common/interfaces';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<SuccessResponse<T>> {
    const ctx = context.switchToHttp();

    const request = ctx.getRequest();
    const response = ctx.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        // If data is already formatted (has success field), return as is
        if (data && typeof data === 'object' && 'success' in data) return data;

        // Transform response to standard format
        return {
          success: true,
          path: request.url,
          data: data ?? null,
          statusCode: response.statusCode,
          timestamp: new Date().toISOString(),
          message: this.getDefaultMessage(request.method),
        };
      }),
    );
  }

  private getDefaultMessage(method: string): string {
    const messages: Record<string, string> = {
      GET: 'Data retrieved successfully',
      PUT: 'Resource updated successfully',
      POST: 'Resource created successfully',
      PATCH: 'Resource updated successfully',
      DELETE: 'Resource deleted successfully',
    };

    return messages[method] || 'Operation completed successfully';
  }
}
