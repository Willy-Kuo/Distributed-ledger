FROM python:3.11-slim

WORKDIR /app

COPY ledger_server.py client_cli.py /app/

ENV PYTHONUNBUFFERED=1

CMD ["python", "/app/ledger_server.py"]
