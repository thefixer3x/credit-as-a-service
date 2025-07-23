import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { testConfig } from '../setup/test-env';

export interface TestWebSocketMessage {
  type: string;
  payload?: any;
  timestamp?: number;
}

export class TestWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected = false;
  private messageQueue: any[] = [];

  constructor(private url: string = 'ws://localhost:8001/ws') {
    super();
  }

  async connect(authToken?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      this.ws = new WebSocket(this.url, { headers });

      this.ws.on('open', () => {
        this.connected = true;
        this.emit('connected');
        
        // Send queued messages
        this.messageQueue.forEach(message => this.send(message));
        this.messageQueue = [];
        
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.emit('message', message);
        } catch (error) {
          this.emit('error', error);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.emit('disconnected');
      });

      this.ws.on('error', (error) => {
        this.emit('error', error);
        reject(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);
    });
  }

  send(message: TestWebSocketMessage): void {
    if (!this.connected || !this.ws) {
      this.messageQueue.push(message);
      return;
    }

    const data = JSON.stringify({
      ...message,
      timestamp: message.timestamp || Date.now(),
    });

    this.ws.send(data);
  }

  subscribe(channels: string[], userId?: string, roles?: string[]): void {
    this.send({
      type: 'subscribe',
      payload: {
        userId,
        channels,
        roles,
      },
    });
  }

  unsubscribe(channels?: string[]): void {
    this.send({
      type: 'unsubscribe',
      payload: { channels },
    });
  }

  heartbeat(): void {
    this.send({ type: 'heartbeat' });
  }

  async waitForMessage(type?: string, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for WebSocket message${type ? ` of type ${type}` : ''}`));
      }, timeout);

      const messageHandler = (message: any) => {
        if (!type || message.type === type) {
          clearTimeout(timer);
          this.removeListener('message', messageHandler);
          resolve(message);
        }
      };

      this.on('message', messageHandler);
    });
  }

  async waitForConnection(timeout = 5000): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for WebSocket connection'));
      }, timeout);

      const connectionHandler = () => {
        clearTimeout(timer);
        this.removeListener('connected', connectionHandler);
        resolve();
      };

      this.on('connected', connectionHandler);
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export async function createTestWebSocketClient(authToken?: string): Promise<TestWebSocketClient> {
  const client = new TestWebSocketClient();
  await client.connect(authToken);
  return client;
}

export function mockWebSocketServer() {
  const connections = new Map<string, WebSocket>();
  const subscriptions = new Map<string, Set<string>>();

  return {
    broadcast: (channel: string, message: any) => {
      const channelConnections = subscriptions.get(channel);
      if (channelConnections) {
        channelConnections.forEach(connectionId => {
          const ws = connections.get(connectionId);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
          }
        });
      }
    },
    
    sendToUser: (userId: string, message: any) => {
      const ws = connections.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
    
    addConnection: (id: string, ws: WebSocket) => {
      connections.set(id, ws);
    },
    
    removeConnection: (id: string) => {
      connections.delete(id);
      subscriptions.forEach(channelConnections => {
        channelConnections.delete(id);
      });
    },
    
    subscribe: (connectionId: string, channel: string) => {
      if (!subscriptions.has(channel)) {
        subscriptions.set(channel, new Set());
      }
      subscriptions.get(channel)!.add(connectionId);
    },
    
    getStats: () => ({
      connections: connections.size,
      subscriptions: subscriptions.size,
    }),
  };
}