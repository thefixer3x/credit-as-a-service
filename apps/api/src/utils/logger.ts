import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, service, requestId, userId }) => {
  const meta = [];
  if (service) meta.push(`service=${service}`);
  if (requestId) meta.push(`requestId=${requestId}`);
  if (userId) meta.push(`userId=${userId}`);
  
  const metaString = meta.length > 0 ? ` [${meta.join(', ')}]` : '';
  return `${timestamp} ${level}:${metaString} ${stack || message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp(),
    logFormat
  ),
  defaultMeta: {
    service: 'caas-api'
  },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5
    })
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize(),
      logFormat
    )
  }));
}

export default logger;