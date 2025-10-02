import { Kafka, Producer } from 'kafkajs';
import pino from 'pino';
import { EventRegistry, DomainEvent } from '../events/event-registry.js';

export class EventProducer {
  private producer: Producer;
  private connected: boolean = false;

  constructor(private kafka: Kafka, private logger: pino.Logger) {
    this.producer = this.kafka.producer();
  }

  async connect(): Promise<void> {
    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.info('Kafka producer connected');
    } catch (error) {
      this.logger.error(error, 'Failed to connect Kafka producer');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.producer.disconnect();
      this.connected = false;
      this.logger.info('Kafka producer disconnected');
    } catch (error) {
      this.logger.error(error, 'Failed to disconnect Kafka producer');
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async publishEvent(event: DomainEvent, eventRegistry: EventRegistry): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const topic = eventRegistry.getTopicForEventType(event.metadata.eventType);
      
      const message = {
        key: event.metadata.eventId,
        value: JSON.stringify(event),
        headers: {
          eventType: event.metadata.eventType,
          version: event.metadata.version,
          source: event.metadata.source,
          correlationId: event.metadata.correlationId || '',
          causationId: event.metadata.causationId || ''
        }
      };

      await this.producer.send({
        topic,
        messages: [message]
      });

      this.logger.info({
        eventId: event.metadata.eventId,
        eventType: event.metadata.eventType,
        topic
      }, 'Event published successfully');

    } catch (error) {
      this.logger.error({
        error,
        eventId: event.metadata.eventId,
        eventType: event.metadata.eventType
      }, 'Failed to publish event');
      throw error;
    }
  }

  async publishBatch(events: DomainEvent[], eventRegistry: EventRegistry): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const messagesByTopic = new Map<string, any[]>();

      // Group events by topic
      for (const event of events) {
        const topic = eventRegistry.getTopicForEventType(event.metadata.eventType);
        
        if (!messagesByTopic.has(topic)) {
          messagesByTopic.set(topic, []);
        }

        messagesByTopic.get(topic)!.push({
          key: event.metadata.eventId,
          value: JSON.stringify(event),
          headers: {
            eventType: event.metadata.eventType,
            version: event.metadata.version,
            source: event.metadata.source,
            correlationId: event.metadata.correlationId || '',
            causationId: event.metadata.causationId || ''
          }
        });
      }

      // Send messages for each topic
      const sendPromises = Array.from(messagesByTopic.entries()).map(([topic, messages]) =>
        this.producer.send({ topic, messages })
      );

      await Promise.all(sendPromises);

      this.logger.info({
        totalEvents: events.length,
        topics: Array.from(messagesByTopic.keys())
      }, 'Batch events published successfully');

    } catch (error) {
      this.logger.error({
        error,
        totalEvents: events.length
      }, 'Failed to publish batch events');
      throw error;
    }
  }
}
