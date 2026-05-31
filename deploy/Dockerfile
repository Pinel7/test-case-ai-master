FROM python:3.12-slim

WORKDIR /app

# No system dependencies needed — keep image minimal

# Copy dependency file first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Railway provides PORT env var automatically; default to 8000
EXPOSE 8000

CMD gunicorn app.main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:${PORT:-8000} \
    --timeout 120 \
    --max-requests 1000 \
    --max-requests-jitter 50
