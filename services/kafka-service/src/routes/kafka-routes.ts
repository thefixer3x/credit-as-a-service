import { Router } from 'express';
import { EventProducer } from '../producers/event-producer.js';
import { EventRegistry } from '../events/event-registry.js';
import { z } from 'zod';

const publishEventSchema = z.object({
  eventType: z.string().min(1),
  data: z.any(),
  source: z.string().min(1),
  correlationId: z.string().optional(),
  causationId: z.string().optional()
});

const publishBatchSchema = z.object({
  events: z.array(publishEventSchema)
});

export function createKafkaRoutes(producer: EventProducer, eventRegistry: EventRegistry) {
  const router = Router();

  // Publish single event
  router.post('/publish', async (req, res) => {
    try {
      const { eventType, data, source, correlationId, causationId } = publishEventSchema.parse(req.body);
      
      const event = eventRegistry.createEvent(eventType, data, source, correlationId, causationId);
      await producer.publishEvent(event, eventRegistry);
      
      res.json({
        success: true,
        eventId: event.metadata.eventId,
        topic: eventRegistry.getTopicForEventType(eventType)
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // Publish batch events
  router.post('/publish/batch', async (req, res) => {
    try {
      const { events } = publishBatchSchema.parse(req.body);
      
      const domainEvents = events.map(({ eventType, data, source, correlationId, causationId }) =>
        eventRegistry.createEvent(eventType, data, source, correlationId, causationId)
      );
      
      await producer.publishBatch(domainEvents, eventRegistry);
      
      res.json({
        success: true,
        eventsPublished: domainEvents.length,
        eventIds: domainEvents.map(e => e.metadata.eventId)
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get available event types
  router.get('/event-types', (req, res) => {
    res.json({
      success: true,
      eventTypes: eventRegistry.getEventTypes()
    });
  });

  // Get available topics
  router.get('/topics', (req, res) => {
    res.json({
      success: true,
      topics: eventRegistry.getTopics()
    });
  });

  // Get producer status
  router.get('/status', (req, res) => {
    res.json({
      success: true,
      producer: {
        connected: producer.isConnected()
      },
      topics: eventRegistry.getTopics(),
      eventTypes: eventRegistry.getEventTypes()
    });
  });

  return router;
}
