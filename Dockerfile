FROM python:3.11-slim

WORKDIR /app

COPY ledger_server.py client_cli.py /app/

RUN pip install rsa

ENV PYTHONUNBUFFERED=1

CMD ["python", "/app/ledger_server.py"]
