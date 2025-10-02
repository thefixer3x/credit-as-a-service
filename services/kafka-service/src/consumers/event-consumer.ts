import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import pino from 'pino';
import { EventRegistry, DomainEvent } from '../events/event-registry.js';

export interface EventHandler {
  (event: DomainEvent): Promise<void>;
}

export class EventConsumer {
  private consumer: Consumer;
  private handlers: Map<string, EventHandler[]> = new Map();
  private running: boolean = false;

  constructor(
    private kafka: Kafka,
    private eventRegistry: EventRegistry,
    private logger: pino.Logger
  ) {
    this.consumer = this.kafka.consumer({ groupId: 'caas-event-consumer' });
  }

  async start(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topics: this.eventRegistry.getTopics() });
      
      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        }
      });

      this.running = true;
      this.logger.info('Kafka consumer started');

    } catch (error) {
      this.logger.error(error, 'Failed to start Kafka consumer');
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.consumer.disconnect();
      this.running = false;
      this.logger.info('Kafka consumer stopped');
    } catch (error) {
      this.logger.error(error, 'Failed to stop Kafka consumer');
      throw error;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  registerHandler(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
    this.logger.info({ eventType }, 'Event handler registered');
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    try {
      const { topic, partition, message } = payload;
      
      if (!message.value) {
        this.logger.warn({ topic, partition }, 'Received message with no value');
        return;
      }

      const event: DomainEvent = JSON.parse(message.value.toString());
      
      if (!this.eventRegistry.validateEvent(event)) {
        this.logger.warn({ topic, partition, eventId: event.metadata?.eventId }, 'Invalid event received');
        return;
      }

      const eventType = event.metadata.eventType;
      const handlers = this.handlers.get(eventType) || [];

      if (handlers.length === 0) {
        this.logger.warn({ eventType, topic }, 'No handlers registered for event type');
        return;
      }

      // Execute all handlers for this event type
      const handlerPromises = handlers.map(handler => 
        handler(event).catch(error => 
          this.logger.error({ error, eventId: event.metadata.eventId, eventType }, 'Handler execution failed')
        )
      );

      await Promise.all(handlerPromises);

      this.logger.info({
        eventId: event.metadata.eventId,
        eventType,
        topic,
        partition,
        handlersExecuted: handlers.length
      }, 'Event processed successfully');

    } catch (error) {
      this.logger.error({
        error,
        topic: payload.topic,
        partition: payload.partition
      }, 'Failed to handle message');
    }
  }

  getRegisteredEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  getHandlerCount(eventType: string): number {
    return this.handlers.get(eventType)?.length || 0;
  }
}
