/**
 * In-memory registry of the sockets this gateway process currently holds.
 *
 * It is deliberately not a source of truth for charger state: last-seen times
 * and online/offline status live in the database, written by the API. This
 * registry only answers "which sockets does THIS process own right now", which
 * is what command delivery and /healthz need.
 */
import type { WebSocket } from "ws";

export interface Connection {
  identity: string;
  socket: WebSocket;
  connectedAt: number;
  lastFrameAt: number;
  framesIn: number;
  framesOut: number;
  alive: boolean;
  remoteAddress: string;
}

const connections = new Map<string, Connection>();

export function add(connection: Connection): void {
  // One socket per charge point: a reconnect supersedes the stale socket.
  const existing = connections.get(connection.identity);
  if (existing && existing.socket !== connection.socket) {
    try {
      existing.socket.close(1012, "Superseded by a newer connection");
    } catch {
      /* already gone */
    }
  }
  connections.set(connection.identity, connection);
}

export function remove(identity: string, socket: WebSocket): void {
  const existing = connections.get(identity);
  if (existing && existing.socket === socket) connections.delete(identity);
}

export function get(identity: string): Connection | undefined {
  return connections.get(identity);
}

export function all(): Connection[] {
  return [...connections.values()];
}

export function size(): number {
  return connections.size;
}
