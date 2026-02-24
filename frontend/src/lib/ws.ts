'use client';

import { useEffect, useRef } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/events';

export function useEventStream(onMessage: (payload: any) => void): void {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let alive = true;
    let retryTimer: NodeJS.Timeout | null = null;

    const connect = () => {
      socket = new WebSocket(WS_URL);
      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          onMessageRef.current(parsed);
        } catch {
          // ignore malformed payloads
        }
      };
      socket.onclose = () => {
        if (!alive) {
          return;
        }
        retryTimer = setTimeout(connect, 1200);
      };
    };

    connect();

    return () => {
      alive = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      socket?.close();
    };
  }, []);
}
