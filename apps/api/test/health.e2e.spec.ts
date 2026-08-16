import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { configureApplication } from '../src/bootstrap';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';

describe('Health endpoints', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            liveness: () => ({
              status: 'ok',
              service: 'shiftsync-api',
              timestamp: new Date().toISOString(),
            }),
            readiness: () => ({
              status: 'ok',
              service: 'shiftsync-api',
              timestamp: new Date().toISOString(),
              checks: { database: 'up' },
            }),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    configureApplication(app, { corsOrigins: [], enableSwagger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200)
      .expect(({ body }) => {
        if (body.status !== 'ok' || body.service !== 'shiftsync-api') {
          throw new Error('Unexpected liveness response');
        }
      });
  });

  it('GET /api/v1/health/ready', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200)
      .expect(({ body }) => {
        if (body.checks?.database !== 'up') {
          throw new Error('Unexpected readiness response');
        }
      });
  });
});
