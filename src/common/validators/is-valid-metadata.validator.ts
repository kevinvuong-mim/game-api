import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const METADATA_MAX_KEYS = 10;
const METADATA_MAX_BYTES = 2048;
const METADATA_MAX_KEY_LENGTH = 64;
const METADATA_MAX_STRING_LENGTH = 256;

function isAllowedMetadataValue(value: unknown): boolean {
  if (value === null) {
    return true;
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'string') {
    return value.length <= METADATA_MAX_STRING_LENGTH;
  }

  return false;
}

@ValidatorConstraint({ name: 'isValidMetadata', async: false })
class IsValidMetadataConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) {
      return true;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);

    if (keys.length > METADATA_MAX_KEYS) {
      return false;
    }

    for (const key of keys) {
      if (key.length === 0 || key.length > METADATA_MAX_KEY_LENGTH) {
        return false;
      }

      if (!isAllowedMetadataValue(record[key])) {
        return false;
      }
    }

    return JSON.stringify(value).length <= METADATA_MAX_BYTES;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a flat object with at most ${METADATA_MAX_KEYS} keys, string values up to ${METADATA_MAX_STRING_LENGTH} chars, and total size up to ${METADATA_MAX_BYTES} bytes`;
  }
}

export function IsValidMetadata(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      propertyName,
      name: 'isValidMetadata',
      target: object.constructor,
      options: validationOptions,
      validator: IsValidMetadataConstraint,
    });
  };
}
