interface ErrorResponse {
  path: string;
  error: string;
  stack?: string; // Only in development
  success: false;
  message: string;
  status?: string;
  uptime?: number;
  timestamp: string;
  statusCode: number;
  errors?: ValidationError[];
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
  constraint?: string;
}

export type { ErrorResponse, SuccessResponse };
