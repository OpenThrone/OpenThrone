class ApiError extends Error {
  statusCode?: number;

  details?: any;

  constructor(message: string, statusCode?: number, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Create API error. */
export const createApiError = (
  message: string,
  statusCode?: number,
  details?: any,
) => new ApiError(message, statusCode, details);
