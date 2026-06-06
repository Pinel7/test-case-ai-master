#!/bin/bash
# backup.sh — 备份 TestForge 数据库，保留最近 7 天
# 用法: ./backup.sh              # 手动备份
# 用法: crontab 里加一行，每天凌晨3点自动跑:
#   0 3 * * * /opt/testcase-ai/deploy/backup.sh

BACKUP_DIR="/opt/testcase-ai/backups"
DATA_DIR="/home/appuser/.TestCaseAI"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# 从 Docker volume 拷贝出来（需要容器名称）
docker cp testforge:/home/appuser/.TestCaseAI/auth.db "$BACKUP_DIR/auth_$DATE.db" 2>/dev/null
docker cp testforge:/home/appuser/.TestCaseAI/library.db "$BACKUP_DIR/library_$DATE.db" 2>/dev/null
docker cp testforge:/home/appuser/.TestCaseAI/test_data.db "$BACKUP_DIR/test_data_$DATE.db" 2>/dev/null

# 压缩
cd "$BACKUP_DIR"
tar -czf "testforge_$DATE.tar.gz" auth_$DATE.db library_$DATE.db test_data_$DATE.db 2>/dev/null
rm -f auth_$DATE.db library_$DATE.db test_data_$DATE.db

# 删除 7 天前的备份
find "$BACKUP_DIR" -name "testforge_*.tar.gz" -mtime +7 -delete

echo "Backup done: $BACKUP_DIR/testforge_$DATE.tar.gz"
