from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder

from app.metrics import INFLIGHT_WS_CONNECTIONS


class ConnectionHub:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)
        INFLIGHT_WS_CONNECTIONS.set(len(self._connections))

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)
        INFLIGHT_WS_CONNECTIONS.set(len(self._connections))

    async def broadcast_json(self, payload: dict) -> None:
        if not self._connections:
            return

        stale: list[WebSocket] = []
        encoded = jsonable_encoder(payload)
        for conn in self._connections:
            try:
                await conn.send_json(encoded)
            except Exception:
                stale.append(conn)

        for conn in stale:
            self.disconnect(conn)


hub = ConnectionHub()


async def stream_with_polling(
    websocket: WebSocket,
    fetcher: Callable[[], Awaitable[dict]],
    interval_seconds: float = 1.5,
) -> None:
    await hub.connect(websocket)
    last_payload: dict | None = None
    try:
        while True:
            payload = await fetcher()
            if payload != last_payload:
                await websocket.send_json(jsonable_encoder(payload))
                last_payload = payload
            await asyncio.sleep(interval_seconds)
    except Exception:
        hub.disconnect(websocket)
