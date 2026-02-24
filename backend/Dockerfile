# syntax=docker/dockerfile:1.7

FROM python:3.11-slim AS deps

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

COPY backend/pyproject.toml /build/backend/pyproject.toml

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    python -c "import pathlib,tomllib; data=tomllib.loads(pathlib.Path('/build/backend/pyproject.toml').read_text()); pathlib.Path('/build/requirements.txt').write_text('\\n'.join(data['project']['dependencies']) + '\\n')"

RUN --mount=type=cache,target=/root/.cache/pip \
    pip wheel --wheel-dir /build/wheels -r /build/requirements.txt

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY --from=deps /build/wheels /wheels
COPY --from=deps /build/requirements.txt /tmp/requirements.txt

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install --no-index --find-links=/wheels -r /tmp/requirements.txt

COPY backend /app/backend

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-deps /app/backend

WORKDIR /app/backend

CMD ["/bin/sh", "-lc", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
