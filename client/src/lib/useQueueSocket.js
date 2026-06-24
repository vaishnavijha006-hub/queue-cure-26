// src/lib/useQueueSocket.js
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

// Single shared hook for both screens. Each screen gets its own socket
// connection (simpler mental model than a global singleton, and matches
// real deployment: receptionist and patient screens are different devices).
export function useQueueSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [queueState, setQueueState] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 800,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('queue:request_state');
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('queue:update', (payload) => {
      setQueueState(payload);
      setLastEvent(payload.meta || null);
    });

    return () => socket.disconnect();
  }, []);

  const addPatient = useCallback(
    (data) =>
      new Promise((resolve) => {
        socketRef.current.emit('patient:add', data, (res) => resolve(res));
      }),
    []
  );

  const callNext = useCallback(
    () =>
      new Promise((resolve) => {
        socketRef.current.emit('queue:call_next', {}, (res) => resolve(res));
      }),
    []
  );

  const skipToken = useCallback(
    (tokenId) =>
      new Promise((resolve) => {
        socketRef.current.emit('token:skip', { tokenId }, (res) => resolve(res));
      }),
    []
  );

  const cancelToken = useCallback(
    (tokenId) =>
      new Promise((resolve) => {
        socketRef.current.emit('token:cancel', { tokenId }, (res) => resolve(res));
      }),
    []
  );

  const setAvgMinutes = useCallback(
    (minutes) =>
      new Promise((resolve) => {
        socketRef.current.emit('settings:set_avg', { minutes }, (res) => resolve(res));
      }),
    []
  );

  return { connected, queueState, lastEvent, addPatient, callNext, skipToken, cancelToken, setAvgMinutes };
}
