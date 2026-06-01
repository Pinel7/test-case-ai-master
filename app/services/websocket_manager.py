"""WebSocket connection manager for real-time notifications."""
import json
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self._connections.setdefault(user_id, []).append(websocket)
        logger.debug("WS connected: user_id=%d (%d active)", user_id, len(self._connections[user_id]))

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self._connections:
            self._connections[user_id] = [ws for ws in self._connections[user_id] if ws != websocket]
            if not self._connections[user_id]:
                del self._connections[user_id]

    async def send_to_user(self, user_id: int, message: dict):
        """Send a JSON message to all WebSocket connections for a user."""
        if user_id not in self._connections:
            return
        payload = json.dumps(message, ensure_ascii=False)
        for ws in self._connections[user_id]:
            try:
                await ws.send_text(payload)
            except Exception:
                pass

    @property
    def active_connections(self) -> int:
        return sum(len(ws_list) for ws_list in self._connections.values())


manager = ConnectionManager()
