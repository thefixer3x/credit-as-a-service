import { v4 as uuidv4 } from 'uuid';
import { Logger } from './logging';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, any>;
  logs: TraceLog[];
  status: 'ok' | 'error' | 'timeout';
  error?: Error;
}

export interface TraceLog {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, any>;
}

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, any>;
  logs: TraceLog[];
  status: 'ok' | 'error' | 'timeout';
  error?: Error;
}

export class Tracer {
  private serviceName: string;
  private logger: Logger;
  private activeSpans: Map<string, TraceContext> = new Map();
  private completedTraces: TraceContext[] = [];
  private maxTraceHistory = 100;

  constructor(serviceName: string, logger: Logger) {
    this.serviceName = serviceName;
    this.logger = logger;
  }

  // Start a new trace
  public startTrace(operationName: string, parentTraceId?: string, parentSpanId?: string): TraceContext {
    const traceId = parentTraceId || uuidv4();
    const spanId = uuidv4();
    
    const trace: TraceContext = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      serviceName: this.serviceName,
      startTime: Date.now(),
      tags: {},
      logs: [],
      status: 'ok',
    };

    this.activeSpans.set(spanId, trace);
    
    this.logger.debug(`Started trace: ${operationName}`, {
      traceId,
      spanId,
      parentSpanId,
      operationName,
    });

    return trace;
  }

  // Start a child span
  public startSpan(operationName: string, parentTrace: TraceContext): TraceContext {
    return this.startTrace(operationName, parentTrace.traceId, parentTrace.spanId);
  }

  // Finish a trace/span
  public finishTrace(spanId: string, status: 'ok' | 'error' | 'timeout' = 'ok', error?: Error): void {
    const trace = this.activeSpans.get(spanId);
    if (!trace) {
      this.logger.warn(`Attempted to finish unknown trace: ${spanId}`);
      return;
    }

    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = status;
    trace.error = error;

    this.activeSpans.delete(spanId);
    this.completedTraces.push(trace);

    // Keep only recent traces
    if (this.completedTraces.length > this.maxTraceHistory) {
      this.completedTraces.splice(0, this.completedTraces.length - this.maxTraceHistory);
    }

    this.logger.debug(`Finished trace: ${trace.operationName}`, {
      traceId: trace.traceId,
      spanId: trace.spanId,
      duration: trace.duration,
      status,
    });

    // Log errors
    if (error) {
      this.logger.error(`Trace error in ${trace.operationName}`, error, {
        traceId: trace.traceId,
        spanId: trace.spanId,
        duration: trace.duration,
      });
    }
  }

  // Add tags to a trace
  public setTag(spanId: string, key: string, value: any): void {
    const trace = this.activeSpans.get(spanId);
    if (trace) {
      trace.tags[key] = value;
    }
  }

  public setTags(spanId: string, tags: Record<string, any>): void {
    const trace = this.activeSpans.get(spanId);
    if (trace) {
      Object.assign(trace.tags, tags);
    }
  }

  // Add logs to a trace
  public log(spanId: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, fields?: Record<string, any>): void {
    const trace = this.activeSpans.get(spanId);
    if (trace) {
      trace.logs.push({
        timestamp: Date.now(),
        level,
        message,
        fields,
      });
    }
  }

  // Convenience methods for different log levels
  public logInfo(spanId: string, message: string, fields?: Record<string, any>): void {
    this.log(spanId, 'info', message, fields);
  }

  public logError(spanId: string, message: string, error?: Error, fields?: Record<string, any>): void {
    const errorFields = error ? {
      ...fields,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    } : fields;
    
    this.log(spanId, 'error', message, errorFields);
  }

  // Get active traces
  public getActiveTraces(): TraceContext[] {
    return Array.from(this.activeSpans.values());
  }

  // Get completed traces
  public getCompletedTraces(since?: number): TraceContext[] {
    const traces = this.completedTraces;
    return since ? traces.filter(t => t.startTime >= since) : traces;
  }

  // Get trace by ID
  public getTrace(traceId: string): TraceContext | undefined {
    // Check active traces first
    for (const trace of this.activeSpans.values()) {
      if (trace.traceId === traceId) {
        return trace;
      }
    }

    // Check completed traces
    return this.completedTraces.find(t => t.traceId === traceId);
  }

  // Performance monitoring with tracing
  public async traceAsync<T>(
    operationName: string,
    fn: (trace: TraceContext) => Promise<T>,
    parentTrace?: TraceContext
  ): Promise<T> {
    const trace = parentTrace 
      ? this.startSpan(operationName, parentTrace)
      : this.startTrace(operationName);

    try {
      const result = await fn(trace);
      this.finishTrace(trace.spanId, 'ok');
      return result;
    } catch (error) {
      this.finishTrace(trace.spanId, 'error', error as Error);
      throw error;
    }
  }

  // Synchronous tracing
  public traceSync<T>(
    operationName: string,
    fn: (trace: TraceContext) => T,
    parentTrace?: TraceContext
  ): T {
    const trace = parentTrace 
      ? this.startSpan(operationName, parentTrace)
      : this.startTrace(operationName);

    try {
      const result = fn(trace);
      this.finishTrace(trace.spanId, 'ok');
      return result;
    } catch (error) {
      this.finishTrace(trace.spanId, 'error', error as Error);
      throw error;
    }
  }

  // Get trace statistics
  public getTraceStats(): {
    activeCount: number;
    completedCount: number;
    averageDuration: number;
    errorRate: number;
    slowestTraces: Array<{ operationName: string; duration: number; traceId: string }>;
  } {
    const completed = this.completedTraces;
    const totalDuration = completed.reduce((sum, trace) => sum + (trace.duration || 0), 0);
    const errorCount = completed.filter(trace => trace.status === 'error').length;
    
    const slowest = completed
      .filter(trace => trace.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 5)
      .map(trace => ({
        operationName: trace.operationName,
        duration: trace.duration!,
        traceId: trace.traceId,
      }));

    return {
      activeCount: this.activeSpans.size,
      completedCount: completed.length,
      averageDuration: completed.length > 0 ? totalDuration / completed.length : 0,
      errorRate: completed.length > 0 ? errorCount / completed.length : 0,
      slowestTraces: slowest,
    };
  }

  // Export trace data (for external systems like Jaeger)
  public exportTraces(format: 'jaeger' | 'zipkin' = 'jaeger'): any[] {
    const traces = this.completedTraces;
    
    if (format === 'jaeger') {
      return traces.map(trace => ({
        traceID: trace.traceId,
        spanID: trace.spanId,
        parentSpanID: trace.parentSpanId,
        operationName: trace.operationName,
        startTime: trace.startTime * 1000, // Jaeger expects microseconds
        duration: (trace.duration || 0) * 1000,
        tags: Object.entries(trace.tags).map(([key, value]) => ({
          key,
          value: String(value),
          type: typeof value === 'string' ? 'string' : 'number',
        })),
        logs: trace.logs.map(log => ({
          timestamp: log.timestamp * 1000,
          fields: [
            { key: 'level', value: log.level },
            { key: 'message', value: log.message },
            ...(log.fields ? Object.entries(log.fields).map(([k, v]) => ({ key: k, value: String(v) })) : []),
          ],
        })),
        process: {
          serviceName: trace.serviceName,
          tags: [
            { key: 'service.name', value: trace.serviceName },
            { key: 'service.version', value: process.env.npm_package_version || '1.0.0' },
          ],
        },
      }));
    }

    // Add other formats as needed
    return traces;
  }
}

// Trace context propagation for HTTP
export interface TraceHeaders {
  'x-trace-id'?: string;
  'x-span-id'?: string;
  'x-parent-span-id'?: string;
}

export function injectTraceHeaders(trace: TraceContext): TraceHeaders {
  return {
    'x-trace-id': trace.traceId,
    'x-span-id': trace.spanId,
    'x-parent-span-id': trace.parentSpanId,
  };
}

export function extractTraceHeaders(headers: Record<string, string | undefined>): {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
} {
  return {
    traceId: headers['x-trace-id'],
    spanId: headers['x-span-id'],
    parentSpanId: headers['x-parent-span-id'],
  };
}

// Express middleware for automatic tracing
export function createTracingMiddleware(tracer: Tracer) {
  return (req: any, res: any, next: any) => {
    const traceHeaders = extractTraceHeaders(req.headers);
    const operationName = `${req.method} ${req.route?.path || req.path}`;
    
    const trace = tracer.startTrace(operationName, traceHeaders.traceId, traceHeaders.parentSpanId);
    
    // Add request tags
    tracer.setTags(trace.spanId, {
      'http.method': req.method,
      'http.url': req.url,
      'http.user_agent': req.get('User-Agent'),
      'http.remote_addr': req.ip,
    });

    // Attach trace to request
    req.trace = trace;

    // Inject trace headers into response
    const injectedHeaders = injectTraceHeaders(trace);
    Object.entries(injectedHeaders).forEach(([key, value]) => {
      if (value) res.set(key, value);
    });

    const originalSend = res.send;
    res.send = function(data: any) {
      const statusCode = res.statusCode;
      tracer.setTag(trace.spanId, 'http.status_code', statusCode);
      
      const status = statusCode >= 400 ? 'error' : 'ok';
      tracer.finishTrace(trace.spanId, status);
      
      return originalSend.call(this, data);
    };

    next();
  };
}

// Factory function
export function createTracer(serviceName: string, logger: Logger): Tracer {
  return new Tracer(serviceName, logger);
}