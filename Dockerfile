FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY fitness fitness

EXPOSE 5000
CMD ["sh", "-c", "python -m fitness.init_db && exec gunicorn --bind 0.0.0.0:5000 --threads 4 --no-control-socket fitness.app:app"]
