"""SQL query runner against a separate test database file."""

import csv
import io
import re
import sqlite3
import time
import threading
from pathlib import Path

TEST_DB_DIR = Path.home() / ".TestCaseAI"
TEST_DB_PATH = TEST_DB_DIR / "test_data.db"

_lock = threading.Lock()


def _get_test_conn() -> sqlite3.Connection:
    TEST_DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(TEST_DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _sanitize_table_name(name: str) -> str:
    """Allow only alphanumeric and underscores for table names."""
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '', name.strip())
    if not sanitized:
        raise ValueError("表名只能包含字母、数字和下划线")
    if sanitized[0].isdigit():
        sanitized = "t_" + sanitized
    return sanitized


def _infer_type(values: list[str]) -> str:
    """Infer SQLite column type from a list of string values."""
    all_int = True
    all_real = True
    for v in values:
        if v is None or v == "":
            continue
        try:
            int(v)
            continue
        except ValueError:
            all_int = False
        try:
            float(v)
            continue
        except ValueError:
            all_real = False
    if all_int:
        return "INTEGER"
    if all_real:
        return "REAL"
    return "TEXT"


def init_test_db() -> None:
    """Initialize the test database with sample tables for demo purposes."""
    with _lock:
        conn = _get_test_conn()
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    email TEXT NOT NULL,
                    role TEXT DEFAULT 'user',
                    created_at TEXT DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER REFERENCES users(id),
                    product TEXT NOT NULL,
                    amount REAL NOT NULL,
                    status TEXT DEFAULT 'pending',
                    created_at TEXT DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    price REAL NOT NULL,
                    stock INTEGER DEFAULT 0
                );

                INSERT OR IGNORE INTO users (id, username, email, role) VALUES
                    (1, 'admin', 'admin@example.com', 'admin'),
                    (2, 'tester', 'tester@example.com', 'tester'),
                    (3, 'dev', 'dev@example.com', 'user');

                INSERT OR IGNORE INTO orders (id, user_id, product, amount, status) VALUES
                    (1, 1, 'MacBook Pro', 19999.00, 'completed'),
                    (2, 1, 'iPhone 15', 8999.00, 'completed'),
                    (3, 2, 'Keyboard', 599.00, 'pending'),
                    (4, 3, 'Monitor', 2999.00, 'shipped'),
                    (5, 2, 'Mouse', 299.00, 'cancelled');

                INSERT OR IGNORE INTO products (id, name, price, stock) VALUES
                    (1, 'Wireless Mouse', 299.00, 50),
                    (2, 'Mechanical Keyboard', 599.00, 30),
                    (3, '27-inch Monitor', 2999.00, 15),
                    (4, 'USB-C Hub', 199.00, 100);
            """)
            conn.commit()
        finally:
            conn.close()


def get_schema() -> list[dict]:
    """Return list of tables with their columns."""
    try:
        conn = _get_test_conn()
        try:
            tables = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
            schemas = []
            for tbl in tables:
                tbl_name = tbl["name"]
                cols = conn.execute(f"PRAGMA table_info('{tbl_name}')").fetchall()
                schemas.append({
                    "name": tbl_name,
                    "columns": [
                        {"name": c["name"], "type": c["type"]}
                        for c in cols
                    ],
                })
            return schemas
        finally:
            conn.close()
    except Exception:
        return []


def import_csv(table_name: str, csv_content: str) -> tuple[bool, str]:
    """Import CSV content into a new table. Returns (success, message)."""
    safe_name = _sanitize_table_name(table_name)
    if not safe_name:
        return False, "无效的表名"

    try:
        reader = csv.reader(io.StringIO(csv_content.strip()))
        rows = [row for row in reader]
    except Exception as e:
        return False, f"CSV 解析失败: {e}"

    if len(rows) < 2:
        return False, "CSV 必须包含表头行和至少一行数据"

    headers = [h.strip() for h in rows[0]]
    # Sanitize headers (replace spaces/special chars)
    col_names = []
    for h in headers:
        h_safe = re.sub(r'[^a-zA-Z0-9_一-鿿]', '_', h.strip())
        if not h_safe or h_safe[0].isdigit():
            h_safe = "col_" + h_safe
        col_names.append(h_safe)

    data_rows = rows[1:]
    # Infer types from first 100 rows
    sample = min(100, len(data_rows))
    col_types = []
    for ci in range(len(col_names)):
        vals = [(row[ci] if ci < len(row) else "") for row in data_rows[:sample]]
        col_types.append(_infer_type(vals))

    col_defs = ", ".join(
        f'"{cn}" {ct}' for cn, ct in zip(col_names, col_types)
    )
    placeholders = ", ".join(["?" for _ in col_names])
    col_list = ", ".join(f'"{cn}"' for cn in col_names)

    with _lock:
        conn = _get_test_conn()
        try:
            # Check if table already exists
            existing = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (safe_name,)
            ).fetchone()
            if existing:
                return False, f"表 '{safe_name}' 已存在"

            conn.execute(f'CREATE TABLE "{safe_name}" ({col_defs})')

            inserted = 0
            for row in data_rows:
                vals = [(row[ci].strip() if ci < len(row) and row[ci].strip() else None) for ci in range(len(col_names))]
                # Convert types
                for vi in range(len(vals)):
                    if vals[vi] is not None:
                        if col_types[vi] == "INTEGER":
                            try:
                                vals[vi] = int(vals[vi])
                            except ValueError:
                                pass
                        elif col_types[vi] == "REAL":
                            try:
                                vals[vi] = float(vals[vi])
                            except ValueError:
                                pass
                try:
                    conn.execute(f'INSERT INTO "{safe_name}" ({col_list}) VALUES ({placeholders})', vals)
                    inserted += 1
                except Exception:
                    pass  # Skip rows that don't fit

            conn.commit()
            return True, f"导入成功：表 '{safe_name}'，{len(col_names)} 列，{inserted}/{len(data_rows)} 行"
        except Exception as e:
            conn.rollback()
            return False, f"导入失败: {e}"
        finally:
            conn.close()


def drop_table(table_name: str) -> tuple[bool, str]:
    """Drop a user-imported table. Returns (success, message)."""
    safe_name = _sanitize_table_name(table_name)
    if not safe_name:
        return False, "无效的表名"

    # Prevent dropping demo tables
    demo_tables = {"users", "orders", "products"}
    if safe_name.lower() in demo_tables:
        return False, "不能删除系统预置的表"

    with _lock:
        conn = _get_test_conn()
        try:
            conn.execute(f'DROP TABLE IF EXISTS "{safe_name}"')
            conn.commit()
            return True, f"表 '{safe_name}' 已删除"
        except Exception as e:
            return False, f"删除失败: {e}"
        finally:
            conn.close()


def execute_query(sql: str) -> tuple[list[str], list[list], str | None]:
    """Execute a SQL query and return (columns, rows, error_message)."""
    sql_stripped = sql.strip()
    if not sql_stripped:
        return [], [], "SQL 语句不能为空"

    # Safety: only allow SELECT queries
    if not re.match(r'^\s*(SELECT|WITH)\b', sql_stripped, re.IGNORECASE):
        return [], [], "只允许执行 SELECT / WITH 查询语句"

    try:
        conn = _get_test_conn()
        try:
            cur = conn.execute(sql_stripped)
            columns = [desc[0] for desc in cur.description] if cur.description else []
            rows = [list(row) for row in cur.fetchall()]
            return columns, rows, None
        except Exception as e:
            return [], [], str(e)
        finally:
            conn.close()
    except Exception as e:
        return [], [], str(e)
