# Build from the REPO ROOT, not services/api: the image needs data/ as well.
#   docker build -f services/api/Dockerfile -t cropscan-api .
FROM python:3.12-slim

WORKDIR /app

# The API image must not ship PyTorch. onnxruntime only.
COPY services/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/api/app ./app
COPY services/api/alembic ./alembic
COPY services/api/alembic.ini .
COPY services/api/model ./model
COPY data /data

ENV DATA_DIR=/data

EXPOSE 8000
# Migrations are idempotent, so running them on every start keeps a fresh
# database in step with the code. $PORT is set by Render; 8000 locally.
CMD alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
