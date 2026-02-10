import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { logInfo, logError } from './logger';

const clients = new Set<WebSocket>();

/**
 * Initialize WebSocket server on the same HTTP server.
 * Clients connect to ws://host:port/ws
 */
export const initWebSocket = (server: Server) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    logInfo('ws_client_connected', { totalClients: clients.size });

    ws.on('close', () => {
      clients.delete(ws);
      logInfo('ws_client_disconnected', { totalClients: clients.size });
    });

    ws.on('error', (err) => {
      logError('ws_client_error', err);
      clients.delete(ws);
    });
  });

  logInfo('websocket_server_initialized', { path: '/ws' });
};

/**
 * Broadcast a message to all connected WebSocket clients.
 */
export const broadcastMessage = (type: string, data: unknown) => {
  const message = JSON.stringify({ type, data });
  let sent = 0;
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        sent++;
      } catch (err) {
        logError('ws_send_error', err as Error);
      }
    }
  }
  logInfo('ws_broadcast', { type, sentTo: sent, totalClients: clients.size });
  return sent;
};

/**
 * Get the number of currently connected clients.
 */
export const getConnectedCount = () => clients.size;
