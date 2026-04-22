/**
 * Structured API errors.
 * Shape matches the OpenAPI `Error` schema (docs/design/06_openapi_specs.md).
 */

export type ApiErrorBody = {
  code: string
  message: string
  details?: Record<string, unknown>
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  toJSON(): ApiErrorBody {
    return { code: this.code, message: this.message, details: this.details }
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message)
  }
}

export class ForbiddenError extends ApiError {
  constructor(code = 'FORBIDDEN', message = 'Insufficient permissions') {
    super(403, code, message)
  }
}

export class NotFoundError extends ApiError {
  constructor(what = 'Resource') {
    super(404, 'NOT_FOUND', `${what} not found`)
  }
}

export class ConflictError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(409, code, message, details)
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', details?: Record<string, unknown>) {
    super(400, 'BAD_REQUEST', message, details)
  }
}
