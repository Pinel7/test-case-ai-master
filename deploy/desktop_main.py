"""Desktop application entry point for 智能测试用例生成器.

Uses pywebview to embed the FastAPI web app in a native window.
"""
import asyncio
import sys
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path

# Explicit imports so PyInstaller discovers them during static analysis
import uvicorn
import app.main  # noqa: F401 — forces PyInstaller to bundle the app package
from app.main import app  # noqa: F401 — ensures the FastAPI app object is resolvable

_LOG_DIR = Path.home() / ".TestCaseAI"
_LOG_DIR.mkdir(exist_ok=True)
_LOG_FILE = _LOG_DIR / "debug.log"


def _log(msg: str) -> None:
    """Write a timestamped message to the debug log file."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    try:
        with open(_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def _find_free_port(start: int = 8000, max_attempts: int = 10) -> int:
    import socket

    for port in range(start, start + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start


class ServerThread(threading.Thread):
    """Run uvicorn in a daemon thread."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8000):
        super().__init__(daemon=True)
        self.host = host
        self.port = port

    def run(self) -> None:
        try:
            asyncio.set_event_loop(asyncio.new_event_loop())
            config = uvicorn.Config(
                "app.main:app",
                host=self.host,
                port=self.port,
                log_level="warning",
                log_config=None,  # disable uvicorn's default logging (requires isatty)
            )
            server = uvicorn.Server(config=config)
            server.run()
        except Exception:
            _log(f"uvicorn server crashed:\n{traceback.format_exc()}")


def _wait_for_server(url: str, timeout: float = 15.0) -> bool:
    import urllib.request

    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.5)
    return False


def main() -> None:
    _log("TestCaseAI desktop starting...")

    try:
        port = _find_free_port(8000)
        url = f"http://127.0.0.1:{port}"

        _log(f"Starting server on {url}")
        server = ServerThread(port=port)
        server.start()

        if not _wait_for_server(url):
            _log("ERROR: server failed to start within timeout")
            sys.exit(1)

        _log("Server ready, launching window...")

        import webview

        window = webview.create_window(
            title="智能测试用例生成器",
            url=url,
            width=1280,
            height=800,
            resizable=True,
            text_select=True,
            min_size=(900, 600),
        )
        webview.start(debug=False, http_server=False)
        _log("Window closed, exiting.")
    except Exception:
        _log(f"Fatal error:\n{traceback.format_exc()}")
        sys.exit(1)


if __name__ == "__main__":
    main()
