import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { requestContext } from './request-context';

interface HttpRequest {
  method: string;
  originalUrl?: string;
  path?: string;
  get(name: string): string | undefined;
}

interface HttpResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  once(event: 'finish', listener: () => void): this;
}

type NextFunction = () => void;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function resolveRequestId(request: HttpRequest): string {
  const supplied = request.get('x-request-id')?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: HttpRequest, response: HttpResponse, next: NextFunction): void {
    const requestId = resolveRequestId(request);
    const startedAt = process.hrtime.bigint();
    const path = request.originalUrl?.split('?')[0] ?? request.path ?? '/';

    response.setHeader('x-request-id', requestId);
    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.log({
        event: 'http_request_completed',
        requestId,
        method: request.method,
        path,
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      });
    });

    requestContext.run({ requestId }, next);
  }
}
