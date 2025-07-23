import pino from 'pino';

export interface LogContext {
  userId?: string;
  requestId?: string;
  sessionId?: string;
  traceId?: string;
  service?: string;
  operation?: string;
  [key: string]: any;
}

export interface LoggerConfig {
  serviceName: string;
  level?: string;
  environment?: string;
  enableFileOutput?: boolean;
  enableConsoleOutput?: boolean;
  logDir?: string;
}

export class Logger {
  private logger: pino.Logger;
  private serviceName: string;

  constructor(config: LoggerConfig) {
    this.serviceName = config.serviceName;
    
    const pinoConfig: pino.LoggerOptions = {
      name: config.serviceName,
      level: config.level || process.env.LOG_LEVEL || 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
      base: {
        service: config.serviceName,
        environment: config.environment || process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        pid: process.pid,
        hostname: process.env.HOSTNAME || 'localhost',
      },
    };

    // Development vs Production configuration
    if (config.environment === 'development' || process.env.NODE_ENV === 'development') {
      pinoConfig.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      };
    } else {
      // Production: structured JSON logs
      pinoConfig.formatters = {
        ...pinoConfig.formatters,
        log: (object) => object,
      };
    }

    this.logger = pino(pinoConfig);
  }

  private enrichContext(context?: LogContext): LogContext {
    return {
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      ...context,
    };
  }

  public debug(message: string, context?: LogContext): void {
    this.logger.debug(this.enrichContext(context), message);
  }

  public info(message: string, context?: LogContext): void {
    this.logger.info(this.enrichContext(context), message);
  }

  public warn(message: string, context?: LogContext): void {
    this.logger.warn(this.enrichContext(context), message);
  }

  public error(message: string, error?: Error | unknown, context?: LogContext): void {
    const enrichedContext = this.enrichContext(context);
    
    if (error instanceof Error) {
      enrichedContext.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      enrichedContext.error = error;
    }

    this.logger.error(enrichedContext, message);
  }

  public fatal(message: string, error?: Error | unknown, context?: LogContext): void {
    const enrichedContext = this.enrichContext(context);
    
    if (error instanceof Error) {
      enrichedContext.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      enrichedContext.error = error;
    }

    this.logger.fatal(enrichedContext, message);
  }

  // Business event logging
  public businessEvent(event: string, data: Record<string, any>, context?: LogContext): void {
    this.logger.info(this.enrichContext({
      ...context,
      eventType: 'business',
      event,
      data,
    }), `Business event: ${event}`);
  }

  // Security event logging
  public securityEvent(event: string, data: Record<string, any>, context?: LogContext): void {
    this.logger.warn(this.enrichContext({
      ...context,
      eventType: 'security',
      event,
      data,
    }), `Security event: ${event}`);
  }

  // Performance logging
  public performance(operation: string, duration: number, context?: LogContext): void {
    this.logger.info(this.enrichContext({
      ...context,
      eventType: 'performance',
      operation,
      duration,
      durationMs: duration,
    }), `Performance: ${operation} took ${duration}ms`);
  }

  // HTTP request logging
  public httpRequest(method: string, url: string, statusCode: number, duration: number, context?: LogContext): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    
    this.logger[level](this.enrichContext({
      ...context,
      eventType: 'http',
      method,
      url,
      statusCode,
      duration,
      durationMs: duration,
    }), `${method} ${url} ${statusCode} - ${duration}ms`);
  }

  // Database query logging
  public dbQuery(query: string, duration: number, context?: LogContext): void {
    this.logger.debug(this.enrichContext({
      ...context,
      eventType: 'database',
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      duration,
      durationMs: duration,
    }), `Database query executed in ${duration}ms`);
  }

  // Child logger with additional context
  public child(context: LogContext): Logger {
    const childLogger = new Logger({
      serviceName: this.serviceName,
      level: this.logger.level,
    });
    
    childLogger.logger = this.logger.child(context);
    return childLogger;
  }

  // Get the underlying pino logger
  public getPinoLogger(): pino.Logger {
    return this.logger;
  }
}

// Factory function for creating loggers
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}

// Default logger instance
export const defaultLogger = createLogger({
  serviceName: 'caas-platform',
  environment: process.env.NODE_ENV || 'development',
});

// Convenience functions using default logger
export const log = {
  debug: (message: string, context?: LogContext) => defaultLogger.debug(message, context),
  info: (message: string, context?: LogContext) => defaultLogger.info(message, context),
  warn: (message: string, context?: LogContext) => defaultLogger.warn(message, context),
  error: (message: string, error?: Error | unknown, context?: LogContext) => defaultLogger.error(message, error, context),
  fatal: (message: string, error?: Error | unknown, context?: LogContext) => defaultLogger.fatal(message, error, context),
  businessEvent: (event: string, data: Record<string, any>, context?: LogContext) => defaultLogger.businessEvent(event, data, context),
  securityEvent: (event: string, data: Record<string, any>, context?: LogContext) => defaultLogger.securityEvent(event, data, context),
  performance: (operation: string, duration: number, context?: LogContext) => defaultLogger.performance(operation, duration, context),
  httpRequest: (method: string, url: string, statusCode: number, duration: number, context?: LogContext) => defaultLogger.httpRequest(method, url, statusCode, duration, context),
  dbQuery: (query: string, duration: number, context?: LogContext) => defaultLogger.dbQuery(query, duration, context),
};