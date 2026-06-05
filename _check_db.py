import sqlite3, json, urllib.request

conn = sqlite3.connect("/home/appuser/.TestCaseAI/auth.db")
conn.row_factory = sqlite3.Row
row = conn.execute("""
    SELECT s.token, u.username FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE u.username = 'lmzPP'
    ORDER BY s.id DESC LIMIT 1
""").fetchone()
conn.close()

token = dict(row)["token"] if row else None
if not token:
    print("No token found")
    exit(1)

# Test modules endpoint
req = urllib.request.Request("http://localhost:8000/api/regression/modules")
req.add_header("Authorization", f"Bearer {token}")
resp = urllib.request.urlopen(req)
data = json.loads(resp.read())
print("Modules:", data["modules"])

# Test analyze endpoint
req2 = urllib.request.Request("http://localhost:8000/api/regression/analyze",
    data=json.dumps({"modules": ["待办事项管理", "习惯养成管理"]}).encode(),
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
resp2 = urllib.request.urlopen(req2)
data2 = json.loads(resp2.read())
print(f"\nAnalysis result: {data2['summary']['total']} cases, {data2['summary']['estimated_hours']}h")
print(f"Groups: {data2['summary']['groups']}")
print(f"Sets: {len(data2['sets'])}")
for s in data2['sets']:
    print(f"  Set: {s['set_name']} ({s['count']} cases)")
