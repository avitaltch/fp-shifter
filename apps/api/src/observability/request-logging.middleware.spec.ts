import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentRequestId } from './request-context';
import { RequestLoggingMiddleware } from './request-logging.middleware';

class ResponseStub extends EventEmitter {
  statusCode = 204;
  headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }
}

describe('RequestLoggingMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('propagates a valid request ID and logs request completion', () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const response = new ResponseStub();
    const middleware = new RequestLoggingMiddleware();

    middleware.use(
      {
        method: 'GET',
        path: '/api/v1/health/live',
        get: () => 'client-request-42',
      },
      response,
      () => expect(currentRequestId()).toBe('client-request-42'),
    );
    response.emit('finish');

    expect(response.headers.get('x-request-id')).toBe('client-request-42');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http_request_completed',
        requestId: 'client-request-42',
        method: 'GET',
        path: '/api/v1/health/live',
        statusCode: 204,
      }),
    );
  });

  it('replaces unsafe request IDs', () => {
    const response = new ResponseStub();
    const middleware = new RequestLoggingMiddleware();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    middleware.use(
      {
        method: 'GET',
        originalUrl: '/health?token=secret',
        get: () => 'invalid request id with spaces',
      },
      response,
      () => {},
    );
    response.emit('finish');

    expect(response.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/health' }),
    );
  });
});
