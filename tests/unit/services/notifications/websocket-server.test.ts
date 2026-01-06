import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebSocketManager } from '@services/notifications/src/realtime/websocket-server';

vi.mock('@fastify/websocket');

const createMockFastify = () => ({
  register: vi.fn(),
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
});

const createMockSocket = () => ({
  send: vi.fn(),
  on: vi.fn()
});

const getConnectionId = (manager: WebSocketManager) => {
  const connections = (manager as any).connections as Map<string, any>;
  return Array.from(connections.keys())[0];
};

describe('WebSocketManager', () => {
  let wsManager: WebSocketManager;
  let mockFastify: any;
  let mockSocket: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFastify = createMockFastify();
    mockSocket = createMockSocket();
    wsManager = new WebSocketManager(mockFastify);
  });

  it('registers websocket routes on initialize', async () => {
    await wsManager.initialize();

    expect(mockFastify.register).toHaveBeenCalledTimes(2);
    expect(mockFastify.register).toHaveBeenCalledWith(expect.any(Function));
  });

  it('handles new websocket connections and sends welcome message', async () => {
    await (wsManager as any).handleConnection(mockSocket, {});

    expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockSocket.send).toHaveBeenCalledWith(
      expect.stringContaining('Connected to CAAS notification service')
    );
  });

  it('subscribes connections to channels and reports stats', async () => {
    await (wsManager as any).handleConnection(mockSocket, {});
    const connectionId = getConnectionId(wsManager);

    mockSocket.send.mockClear();

    (wsManager as any).handleMessage(
      connectionId,
      Buffer.from(JSON.stringify({
        type: 'subscribe',
        payload: {
          userId: 'user-123',
          channels: ['loans', 'payments'],
          roles: ['user']
        }
      }))
    );

    expect(mockSocket.send).toHaveBeenCalledWith(
      expect.stringContaining('subscription_success')
    );

    const stats = wsManager.getStats();
    expect(stats.connectedUsers).toBe(1);
    expect(stats.activeChannels).toBe(2);
  });

  it('sends notifications to subscribed connections', async () => {
    await (wsManager as any).handleConnection(mockSocket, {});
    const connectionId = getConnectionId(wsManager);

    (wsManager as any).handleMessage(
      connectionId,
      Buffer.from(JSON.stringify({
        type: 'subscribe',
        payload: { userId: 'user-1', channels: ['loans'] }
      }))
    );

    mockSocket.send.mockClear();

    wsManager.sendNotification({
      id: 'notification-1',
      type: 'loan_approved',
      title: 'Loan Approved',
      message: 'Approved',
      channel: 'loans',
      userId: 'user-1',
      priority: 'high',
      timestamp: new Date()
    });

    expect(mockSocket.send).toHaveBeenCalledWith(
      expect.stringContaining('loan_approved')
    );
  });

  it('routes direct messages to user/channel/role helpers', async () => {
    await (wsManager as any).handleConnection(mockSocket, {});
    const connectionId = getConnectionId(wsManager);

    (wsManager as any).handleMessage(
      connectionId,
      Buffer.from(JSON.stringify({
        type: 'subscribe',
        payload: { userId: 'user-1', channels: ['system'], roles: ['admin'] }
      }))
    );

    mockSocket.send.mockClear();

    wsManager.sendToUser('user-1', { type: 'direct', message: 'hello' });
    wsManager.sendToChannel('system', { type: 'channel', message: 'update' });
    wsManager.sendToRole('admin', { type: 'role', message: 'alert' });

    expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'direct', message: 'hello' }));
    expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'channel', message: 'update' }));
    expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'role', message: 'alert' }));
  });

  it('cleans up connections on disconnect', async () => {
    await (wsManager as any).handleConnection(mockSocket, {});
    const connectionId = getConnectionId(wsManager);

    (wsManager as any).handleMessage(
      connectionId,
      Buffer.from(JSON.stringify({
        type: 'subscribe',
        payload: { userId: 'user-1', channels: ['loans'] }
      }))
    );

    let stats = wsManager.getStats();
    expect(stats.totalConnections).toBe(1);

    (wsManager as any).handleDisconnection(connectionId);

    stats = wsManager.getStats();
    expect(stats.totalConnections).toBe(0);
  });

  it('logs errors when socket send fails', async () => {
    mockSocket.send.mockImplementation(() => {
      throw new Error('Socket closed');
    });

    await (wsManager as any).handleConnection(mockSocket, {});
    const connectionId = getConnectionId(wsManager);

    (wsManager as any).sendToConnection(connectionId, { type: 'test' });

    expect(mockFastify.log.error).toHaveBeenCalledWith(
      expect.stringContaining('Error sending message to'),
      expect.any(Error)
    );
  });
});
