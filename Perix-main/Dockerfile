FROM python:3.11-slim

WORKDIR /app

# Copy backend files
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ -r requirements.txt

COPY backend/ ./

# Expose port
EXPOSE 8000

# Start command
CMD uvicorn server:app --host 0.0.0.0 --port $PORT
