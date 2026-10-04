export type ErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'LOGIN_REQUIRED'
  | 'NETWORK'
  | 'DISK_FULL'
  | 'MEDIA_UNAVAILABLE'
  | 'ENCODER_FAILED'
  | 'UNKNOWN';

export interface UserFacingError {
  code: ErrorCode;
  title: string;
  message: string;
  technicalDetails?: string;
  retryable: boolean;
}
