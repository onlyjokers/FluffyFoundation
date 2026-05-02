/**
 * Purpose: Socket.IO event names shared by manager, server, and clients.
 */
export const SOCKET_EVENTS = {
  MSG: 'msg',
  TIME_PING: 'time:ping',
  TIME_PONG: 'time:pong',
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  RECONNECT: 'reconnect',
} as const;
