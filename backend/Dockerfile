# =============================================================================
# Stage 1: Builder - Install dependencies
# =============================================================================
FROM python:3.12-slim AS builder

WORKDIR /app

# Install uv for faster dependency installation
RUN pip install --no-cache-dir uv

# Copy only dependency files for better layer caching
COPY pyproject.toml ./

# Install Python dependencies into isolated environment
RUN uv venv /app/.venv && \
    . /app/.venv/bin/activate && \
    uv pip install --no-cache .

# =============================================================================
# Stage 2: Production - Minimal runtime image
# =============================================================================
FROM python:3.12-slim AS production

# Security: Create non-root user
RUN groupadd --gid 1000 appgroup && \
    useradd --uid 1000 --gid appgroup --shell /bin/false --create-home appuser

WORKDIR /app

# Copy only virtual environment from builder (not pyproject.toml or source)
COPY --from=builder /app/.venv /app/.venv

# Copy application code
COPY --chown=appuser:appgroup . .

# Environment variables for production
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_SYSTEM_PYTHON=1

# Activate virtual environment
ENV PATH="/app/.venv/bin:$PATH"

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
# FIX: Swapped 'localhost' for '127.0.0.1' to force IPv4 connection
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')" || exit 1

# Run application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]