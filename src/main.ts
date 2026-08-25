import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from '@/app.module';
import { NestFactory } from '@nestjs/core';
import { HttpExceptionFilter } from '@/common/filters';
import { ResponseInterceptor } from '@/common/interceptors';
import { Logger, HttpException, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  // Trust one reverse-proxy hop (e.g. Render) so `request.ip` is the real client.
  // Required for IP rate limits — do not parse X-Forwarded-For in guards.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.setGlobalPrefix('api');

  app.use(
    helmet({
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
    }),
  );

  app.enableCors({
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        const formattedErrors = errors.flatMap((error) => {
          if (!error.constraints) return [];

          return Object.entries(error.constraints).map(([key, message]) => ({
            constraint: key,
            message: message,
            field: error.property,
          }));
        });

        const exception = new HttpException(
          {
            statusCode: 400,
            error: 'Bad Request',
            message: formattedErrors,
          },
          400,
        );

        return exception;
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.use(
    compression({
      level: 6,
      threshold: 1024,
    }),
  );

  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}/api`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', err);
  process.exit(1);
});
