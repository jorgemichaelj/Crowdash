import { describe, it, expect } from 'vitest';
import { ERROR_MESSAGES, createUserFacingError } from '../src/errors';

describe('Shared Error Contracts', () => {
  it('should provide user friendly messages for all standard error codes', () => {
    expect(ERROR_MESSAGES.LOGIN_REQUIRED.title).toBe('Sessão necessária');
    expect(ERROR_MESSAGES.UNSUPPORTED_FORMAT.retryable).toBe(false);
    expect(ERROR_MESSAGES.NETWORK.retryable).toBe(true);
  });

  it('should create user facing error with technical details', () => {
    const err = createUserFacingError('LOGIN_REQUIRED', 'HTTP 401 Unauthorized');
    expect(err.code).toBe('LOGIN_REQUIRED');
    expect(err.title).toBe('Sessão necessária');
    expect(err.technicalDetails).toBe('HTTP 401 Unauthorized');
    expect(err.retryable).toBe(true);
  });
});
