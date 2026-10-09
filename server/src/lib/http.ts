export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'Forbidden') => new HttpError(403, 'FORBIDDEN', msg);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, 'BAD_REQUEST', msg, details);
export const conflict = (code: string, msg: string, details?: unknown) => new HttpError(409, code, msg, details);
