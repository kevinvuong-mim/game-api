interface ErrorResponse {
  path: string;
  error: string;
  stack?: string; // Only in development
  success: false;
  message: string;
  timestamp: string;
  statusCode: number;
  errors?: ValidationError[];
  /** Health check degraded payload (503 only) */
  status?: string;
  uptime?: number;
  services?: { db: string; redis: string };
}

interface SuccessResponse<T = unknown> {
  data?: T;
  path: string;
  message: string;
  success: boolean;
  timestamp: string;
  statusCode: number;
}

interface ValidationError {
  field: string;
  value?: unknown;
  message: string;
}

export type { ErrorResponse, SuccessResponse, ValidationError };
