"""Tests for app.services.websocket_manager — ConnectionManager."""

import pytest
from unittest.mock import AsyncMock


@pytest.fixture
def manager():
    from app.services.websocket_manager import ConnectionManager
    return ConnectionManager()


class TestWebSocketManager:
    def test_connect_and_active_count(self, manager):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        # Use event loop for async connect
        import asyncio
        asyncio.run(manager.connect(ws1, 1))
        asyncio.run(manager.connect(ws2, 1))
        assert manager.active_connections == 2

    def test_disconnect(self, manager):
        ws = AsyncMock()
        import asyncio
        asyncio.run(manager.connect(ws, 1))
        assert manager.active_connections == 1
        manager.disconnect(ws, 1)
        assert manager.active_connections == 0

    def test_disconnect_partial(self, manager):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        import asyncio
        asyncio.run(manager.connect(ws1, 1))
        asyncio.run(manager.connect(ws2, 1))
        manager.disconnect(ws1, 1)
        assert manager.active_connections == 1

    def test_disconnect_unknown_user(self, manager):
        ws = AsyncMock()
        manager.disconnect(ws, 999)  # should not raise
        assert manager.active_connections == 0

    def test_send_to_user(self, manager):
        ws = AsyncMock()
        import asyncio
        asyncio.run(manager.connect(ws, 42))
        asyncio.run(manager.send_to_user(42, {"type": "notification", "message": "hello"}))
        ws.send_text.assert_called_once()

    def test_send_to_unknown_user(self, manager):
        import asyncio
        # Should not raise
        asyncio.run(manager.send_to_user(999, {"type": "test"}))

    def test_send_to_user_multiple_connections(self, manager):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        import asyncio
        asyncio.run(manager.connect(ws1, 1))
        asyncio.run(manager.connect(ws2, 1))
        asyncio.run(manager.send_to_user(1, {"type": "test"}))
        ws1.send_text.assert_called_once()
        ws2.send_text.assert_called_once()

    def test_send_error_does_not_raise(self, manager):
        """If one connection fails to send, it should not raise."""
        ws_ok = AsyncMock()
        ws_bad = AsyncMock()
        ws_bad.send_text.side_effect = Exception("connection lost")
        import asyncio
        asyncio.run(manager.connect(ws_ok, 1))
        asyncio.run(manager.connect(ws_bad, 1))
        # Should not raise despite ws_bad failing
        asyncio.run(manager.send_to_user(1, {"type": "test"}))
        ws_ok.send_text.assert_called_once()

    def test_accept_called_on_connect(self, manager):
        ws = AsyncMock()
        import asyncio
        asyncio.run(manager.connect(ws, 1))
        ws.accept.assert_called_once()

    def test_multiple_users(self, manager):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        import asyncio
        asyncio.run(manager.connect(ws1, 1))
        asyncio.run(manager.connect(ws2, 2))
        assert manager.active_connections == 2
        manager.disconnect(ws1, 1)
        assert manager.active_connections == 1
