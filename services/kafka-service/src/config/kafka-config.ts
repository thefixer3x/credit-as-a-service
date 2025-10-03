import { KafkaConfig } from 'kafkajs';

export interface CaasKafkaConfig {
  clientId: string;
  brokers: string[];
  retry: {
    initialRetryTime: number;
    retries: number;
  };
  consumer: {
    groupId: string;
    sessionTimeout: number;
    heartbeatInterval: number;
  };
  producer: {
    maxInFlightRequests: number;
    idempotent: boolean;
    transactionTimeout: number;
  };
}

export const defaultKafkaConfig: CaasKafkaConfig = {
  clientId: 'caas-kafka-service',
  brokers: ['localhost:9092'],
  retry: {
    initialRetryTime: 100,
    retries: 8
  },
  consumer: {
    groupId: 'caas-event-consumer',
    sessionTimeout: 30000,
    heartbeatInterval: 3000
  },
  producer: {
    maxInFlightRequests: 1,
    idempotent: true,
    transactionTimeout: 30000
  }
};

export function createKafkaConfig(env: any): CaasKafkaConfig {
  return {
    clientId: env.KAFKA_CLIENT_ID || defaultKafkaConfig.clientId,
    brokers: env.KAFKA_BROKERS?.split(',') || defaultKafkaConfig.brokers,
    retry: {
      initialRetryTime: parseInt(env.KAFKA_RETRY_INITIAL_TIME || '100'),
      retries: parseInt(env.KAFKA_RETRY_COUNT || '8')
    },
    consumer: {
      groupId: env.KAFKA_CONSUMER_GROUP_ID || defaultKafkaConfig.consumer.groupId,
      sessionTimeout: parseInt(env.KAFKA_CONSUMER_SESSION_TIMEOUT || '30000'),
      heartbeatInterval: parseInt(env.KAFKA_CONSUMER_HEARTBEAT_INTERVAL || '3000')
    },
    producer: {
      maxInFlightRequests: parseInt(env.KAFKA_PRODUCER_MAX_IN_FLIGHT || '1'),
      idempotent: env.KAFKA_PRODUCER_IDEMPOTENT === 'true',
      transactionTimeout: parseInt(env.KAFKA_PRODUCER_TRANSACTION_TIMEOUT || '30000')
    }
  };
}
