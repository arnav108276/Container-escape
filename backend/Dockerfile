FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy project files first
COPY . .

# Install Python dependencies directly with pip
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    pymongo==4.6.1 \
    pydantic==2.5.0 \
    python-dotenv==1.0.0 \
    structlog==24.1.0 \
    python-multipart==0.0.6 \
    httpx==0.25.2 \
    motor==3.3.2 \
    PyJWT==2.12.1 \
    pydantic-settings==2.1.0 \
    email-validator==2.1.0 \
    reportlab==4.0.7

# Expose port
EXPOSE 8000

# Run application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
