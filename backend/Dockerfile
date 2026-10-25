FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# start.sh применяет миграции (alembic upgrade head), затем запускает CMD.
# command из docker-compose.yml заменяет только CMD, миграции выполняются всё равно.
ENTRYPOINT ["sh", "start.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
