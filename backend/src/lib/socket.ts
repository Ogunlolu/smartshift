import { Server } from 'socket.io';

// Lazy-initialized socket.io instance
let _io: Server | null = null;

export function setIo(io: Server) {
  _io = io;
}

export function getIo(): Server {
  if (!_io) {
    // Return a no-op proxy in test/non-server contexts
    return new Proxy({} as Server, {
      get: () => () => {},
    });
  }
  return _io;
}
