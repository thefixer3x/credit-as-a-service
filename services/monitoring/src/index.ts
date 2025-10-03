import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cron from 'node-cron';
import { createLogger, createMetricsCollector, createTracer, createPerformanceMiddleware, createTracingMiddleware } from '@caas/common';
import { MetricsAggregator } from './services/metrics-aggregator';
import { AlertManager } from './services/alert-manager';
import { HealthMonitor } from './services/health-monitor';
import { DashboardService } from './services/dashboard-service';
import { PrometheusExporter } from './services/prometheus-exporter';

const PORT = process.env.MONITORING_PORT || 3007;
const METRICS_PORT = process.env.METRICS_PORT || 9090;

async function startMonitoringService() {
  try {
    // Initialize logging, metrics, and tracing
    const logger = createLogger({
      serviceName: 'monitoring-service',
      environment: process.env.NODE_ENV || 'development',
    });

    const metricsCollector = createMetricsCollector(logger);
    const tracer = createTracer('monitoring-service', logger);

    // Initialize core services
    const metricsAggregator = new MetricsAggregator(metricsCollector, logger);
    const alertManager = new AlertManager(metricsCollector, logger);
    const healthMonitor = new HealthMonitor(logger);
    const dashboardService = new DashboardService(metricsAggregator, healthMonitor, logger);
    const prometheusExporter = new PrometheusExporter(metricsCollector);

    // Start Express app
    const app = express();

    // Middleware
    app.use(helmet());
    app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    }));
    app.use(compression());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Add monitoring middleware
    app.use(createPerformanceMiddleware(metricsCollector));
    app.use(createTracingMiddleware(tracer));

    // Health check endpoint
    app.get('/health', (req, res) => {
      const health = healthMonitor.getOverallHealth();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        service: 'monitoring',
        status: health.status,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        checks: health.checks,
      });
    });

    // Metrics endpoints
    app.get('/api/v1/metrics', (req, res) => {
      const { name, since, limit } = req.query;
      const metrics = metricsCollector.getMetrics(
        name as string,
        since ? parseInt(since as string) : undefined
      );
      
      if (limit) {
        metrics.splice(parseInt(limit as string));
      }
      
      res.json(metrics);
    });

    app.get('/api/v1/metrics/summary', (req, res) => {
      const summary = metricsCollector.getMetricsSummary();
      res.json(summary);
    });

    app.post('/api/v1/metrics', (req, res) => {
      try {
        const { name, value, type, labels } = req.body;
        
        switch (type) {
          case 'counter':
            metricsCollector.incrementCounter(name, value, labels);
            break;
          case 'gauge':
            metricsCollector.setGauge(name, value, labels);
            break;
          case 'histogram':
            metricsCollector.recordHistogram(name, value, labels);
            break;
          default:
            return res.status(400).json({ error: 'Invalid metric type' });
        }
        
        res.json({ message: 'Metric recorded successfully' });
      } catch (error) {
        logger.error('Error recording metric', error);
        res.status(500).json({ error: 'Failed to record metric' });
      }
    });

    // Tracing endpoints
    app.get('/api/v1/traces', (req, res) => {
      const { since, operation } = req.query;
      let traces = tracer.getCompletedTraces(
        since ? parseInt(since as string) : undefined
      );
      
      if (operation) {
        traces = traces.filter(t => t.operationName.includes(operation as string));
      }
      
      res.json(traces);
    });

    app.get('/api/v1/traces/stats', (req, res) => {
      const stats = tracer.getTraceStats();
      res.json(stats);
    });

    app.get('/api/v1/traces/:traceId', (req, res) => {
      const trace = tracer.getTrace(req.params.traceId);
      if (!trace) {
        return res.status(404).json({ error: 'Trace not found' });
      }
      res.json(trace);
    });

    // Health monitoring endpoints
    app.get('/api/v1/health/checks', (req, res) => {
      const checks = healthMonitor.getHealthChecks();
      res.json(checks);
    });

    app.get('/api/v1/health/status', (req, res) => {
      const health = healthMonitor.getOverallHealth();
      res.json(health);
    });

    // Alerts endpoints
    app.get('/api/v1/alerts', (req, res) => {
      const alerts = alertManager.getActiveAlerts();
      res.json(alerts);
    });

    app.get('/api/v1/alerts/history', (req, res) => {
      const { since, severity } = req.query;
      const alerts = alertManager.getAlertHistory(
        since ? parseInt(since as string) : undefined,
        severity as string
      );
      res.json(alerts);
    });

    app.post('/api/v1/alerts/rules', (req, res) => {
      try {
        alertManager.addRule(req.body);
        res.json({ message: 'Alert rule added successfully' });
      } catch (error) {
        logger.error('Error adding alert rule', error);
        res.status(500).json({ error: 'Failed to add alert rule' });
      }
    });

    // Dashboard endpoints
    app.get('/api/v1/dashboard/overview', (req, res) => {
      const overview = dashboardService.getOverview();
      res.json(overview);
    });

    app.get('/api/v1/dashboard/service/:serviceName', (req, res) => {
      const serviceMetrics = dashboardService.getServiceMetrics(req.params.serviceName);
      res.json(serviceMetrics);
    });

    // Prometheus metrics endpoint
    app.get('/metrics', async (req, res) => {
      try {
        const metrics = await prometheusExporter.getMetrics();
        res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(metrics);
      } catch (error) {
        logger.error('Error generating Prometheus metrics', error);
        res.status(500).send('Error generating metrics');
      }
    });

    // Service discovery endpoints
    app.get('/api/v1/services', (req, res) => {
      const services = healthMonitor.getRegisteredServices();
      res.json(services);
    });

    app.post('/api/v1/services/register', (req, res) => {
      try {
        const { name, url, healthEndpoint, checkInterval } = req.body;
        healthMonitor.registerService(name, url, healthEndpoint, checkInterval);
        res.json({ message: 'Service registered successfully' });
      } catch (error) {
        logger.error('Error registering service', error);
        res.status(500).json({ error: 'Failed to register service' });
      }
    });

    // WebSocket endpoint for real-time metrics
    const server = app.listen(PORT, () => {
      logger.info(`Monitoring service started on port ${PORT}`);
    });

    // Set up scheduled tasks
    setupScheduledTasks(metricsCollector, alertManager, healthMonitor, logger);

    // Initialize health checks for core platform services
    await initializePlatformHealthChecks(healthMonitor, logger);

    // Start system metrics collection
    metricsCollector.startSystemMetricsCollection(30000); // Every 30 seconds

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully');
      server.close(() => {
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      server.close(() => {
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start monitoring service:', error);
    process.exit(1);
  }
}

function setupScheduledTasks(
  metricsCollector: any,
  alertManager: any,
  healthMonitor: any,
  logger: any
) {
  // Collect system metrics every 30 seconds
  cron.schedule('*/30 * * * * *', () => {
    metricsCollector.collectSystemMetrics();
  });

  // Clean up old metrics every hour
  cron.schedule('0 * * * *', () => {
    logger.info('Running scheduled metrics cleanup');
    // Implement metrics cleanup logic
  });

  // Generate daily reports at midnight
  cron.schedule('0 0 * * *', () => {
    logger.info('Generating daily monitoring report');
    // Implement daily report generation
  });

  // Check alert rules every minute
  cron.schedule('* * * * *', () => {
    alertManager.evaluateRules();
  });
}

async function initializePlatformHealthChecks(healthMonitor: any, logger: any) {
  try {
    // Register health checks for core services
    const services = [
      { name: 'api-service', url: 'http://localhost:3002', healthEndpoint: '/health' },
      { name: 'notifications-service', url: 'http://localhost:3009', healthEndpoint: '/health' },
      { name: 'documents-service', url: 'http://localhost:3004', healthEndpoint: '/health' },
      { name: 'payments-service', url: 'http://localhost:3006', healthEndpoint: '/health' },
      { name: 'risk-assessment-service', url: 'http://localhost:3005', healthEndpoint: '/health' },
    ];

    for (const service of services) {
      healthMonitor.registerService(
        service.name,
        service.url,
        service.healthEndpoint,
        30000 // Check every 30 seconds
      );
    }

    logger.info('Initialized health checks for platform services');
  } catch (error) {
    logger.error('Error initializing platform health checks', error);
  }
}

// Start the service
startMonitoringService().catch((error) => {
  console.error('Unhandled error starting monitoring service:', error);
  process.exit(1);
});

export default startMonitoringService;