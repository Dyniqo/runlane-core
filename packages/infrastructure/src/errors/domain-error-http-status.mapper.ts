import { HttpStatus } from '@nestjs/common';
import type { DomainError, DomainErrorCategory } from '@runlane/domain';

const DOMAIN_ERROR_HTTP_STATUS: Readonly<Record<DomainErrorCategory, HttpStatus>> = {
  validation: HttpStatus.BAD_REQUEST,
  authentication: HttpStatus.UNAUTHORIZED,
  authorization: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  business_rule: HttpStatus.UNPROCESSABLE_ENTITY,
  rate_limit: HttpStatus.TOO_MANY_REQUESTS,
};

export function getDomainErrorHttpStatus(error: DomainError): HttpStatus {
  return DOMAIN_ERROR_HTTP_STATUS[error.category];
}
