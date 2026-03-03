import { AppError } from './appError';

describe('AppError', () => {
  it('should initialize correctly with a 4xx status code', () => {
    const error = new AppError('Not Found', 404);

    expect(error.message).toBe('Not Found');
    expect(error.statusCode).toBe(404);
    expect(error.status).toBe('fail'); // 4xx indicates a fail
    expect(error.isOperational).toBe(true);
  });

  it('should initialize correctly with a 5xx status code', () => {
    const error = new AppError('Internal Server Error', 500);

    expect(error.message).toBe('Internal Server Error');
    expect(error.statusCode).toBe(500);
    expect(error.status).toBe('error'); // 5xx indicates an error
    expect(error.isOperational).toBe(true);
  });

  it('should format status code strings as fail or error based on the 4xx or 5xx number correctly', () => {
    const error400 = new AppError('Bad Request', 400);
    expect(error400.statusCode).toBe(400);
    expect(error400.status).toBe('fail'); // Ensure "fail" executes safely for 4XX

    const error0 = new AppError('Strange Default Error', 0)
    expect(error0.statusCode).toBe(0);
    expect(error0.status).toBe('error');  // Ensure fallback is "error"
  });
});
