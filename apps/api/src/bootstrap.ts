import {
  type INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

export interface ApplicationBootstrapOptions {
  corsOrigins: string[];
  enableSwagger?: boolean;
}

export function configureApplication(
  app: INestApplication,
  options: ApplicationBootstrapOptions,
): void {
  app.use(
    (
      _request: unknown,
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('X-Frame-Options', 'DENY');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=()',
      );
      next();
    },
  );
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableCors({
    origin: options.corsOrigins,
    credentials: true,
  });

  if (options.enableSwagger !== false) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('ShiftSync API')
        .setDescription('Compound scheduling API for ShiftSync')
        .setVersion('1.0')
        .addBearerAuth(
          { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          'access-token',
        )
        .addCookieAuth(
          'shiftsync_refresh',
          { type: 'apiKey', in: 'cookie', name: 'shiftsync_refresh' },
          'refresh-cookie',
        )
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }
}
