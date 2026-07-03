import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from '@/app.module';
import { NestFactory } from '@nestjs/core';
import { HttpExceptionFilter } from '@/common/filters';
import { ResponseInterceptor } from '@/common/interceptors';
import { validateGameSecrets } from '@/common/utils';
import { Logger, HttpException, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  validateGameSecrets();

  const app = await NestFactory.create(AppModule);

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
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:5173',
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
            value: error.value,
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
