FROM python:3.12-slim

WORKDIR /app

# The API image must not ship PyTorch. onnxruntime only.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY model ./model
COPY alembic ./alembic
COPY alembic.ini .

# Content lives outside the service and is mounted or copied in at deploy time.
ENV DATA_DIR=/data

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
