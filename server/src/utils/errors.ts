export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const Errors = {
  unauthorized: (message = 'Authentication required') => new ApiError(401, 'unauthorized', message),
  forbidden: (message = 'You do not have permission to perform this action') => new ApiError(403, 'forbidden', message),
  notFound: (message = 'Resource not found') => new ApiError(404, 'not_found', message),
  badRequest: (message = 'Invalid request') => new ApiError(400, 'bad_request', message),
  conflict: (message = 'Conflicting state') => new ApiError(409, 'conflict', message),
  tooManyRequests: (message = 'Too many requests') => new ApiError(429, 'rate_limited', message),
}
