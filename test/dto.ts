import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

export async function validatePlain<T extends object>(
  Cls: new () => T,
  plain: Record<string, unknown>,
) {
  const instance = plainToInstance(Cls, plain, { enableImplicitConversion: true });
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { instance, errors };
}

export function constraintNames(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.keys(error.constraints ?? {}),
    ...constraintNames(error.children ?? []),
  ]);
}
