// Central typed errors → consistent API error envelope.
export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const Err = {
  bad: (msg = 'Bad request', details?: unknown) => new ApiError('BAD_REQUEST', msg, 400, details),
  unauthorized: (msg = 'Authentication required') => new ApiError('UNAUTHORIZED', msg, 401),
  forbidden: (msg = 'Forbidden') => new ApiError('FORBIDDEN', msg, 403),
  notFound: (msg = 'Not found') => new ApiError('NOT_FOUND', msg, 404),
  conflict: (msg = 'Conflict') => new ApiError('CONFLICT', msg, 409),
  validation: (msg = 'Validation failed', details?: unknown) => new ApiError('VALIDATION_ERROR', msg, 422, details),
  insufficientBalance: () => new ApiError('INSUFFICIENT_BALANCE', 'Insufficient available balance', 422),
  maxPositionSize: () => new ApiError('MAX_POSITION_SIZE', 'Position size exceeds maximum', 422),
  maxOrderSize: () => new ApiError('MAX_ORDER_SIZE', 'Order amount exceeds maximum', 422),
  maxDailyLoss: () => new ApiError('MAX_DAILY_LOSS', 'Maximum daily loss limit reached', 422),
  maxTotalLoss: () => new ApiError('MAX_TOTAL_LOSS', 'Maximum total loss limit reached', 422),
  tradingDisabled: () => new ApiError('TRADING_DISABLED', 'Trading is currently disabled', 423),
  assetDisabled: () => new ApiError('ASSET_DISABLED', 'This asset is disabled for trading', 422),
  accountSuspended: () => new ApiError('ACCOUNT_SUSPENDED', 'Trading account is suspended', 423),
  userSuspended: () => new ApiError('USER_SUSPENDED', 'User account is suspended', 423),
  invalidAmount: () => new ApiError('INVALID_AMOUNT', 'Invalid order amount', 422),
  maxOpenPositions: () => new ApiError('MAX_OPEN_POSITIONS', 'Maximum open positions reached', 422),
  liveDisabled: () => new ApiError('LIVE_TRADING_DISABLED', 'Live execution is disabled until a licensed execution provider is configured', 422),
  tooMany: () => new ApiError('RATE_LIMITED', 'Too many requests', 429),
  internal: (msg = 'Internal server error') => new ApiError('INTERNAL_ERROR', msg, 500),
};

export function toEnvelopeError(e: unknown): { code: string; message: string; status: number; details?: unknown } {
  if (e instanceof ApiError) return { code: e.code, message: e.message, status: e.status, details: e.details };
  return { code: 'INTERNAL_ERROR', message: 'Internal server error', status: 500 };
}
