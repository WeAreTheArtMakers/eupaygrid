from __future__ import annotations

from pathlib import Path

import asyncpg

from app.config import get_settings

_pool: asyncpg.Pool | None = None


def _schema_sql() -> str:
    schema_path = Path(__file__).with_name("schema.sql")
    return schema_path.read_text(encoding="utf-8")


async def init_pg_pool() -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool

    settings = get_settings()
    _pool = await asyncpg.create_pool(
        dsn=settings.postgres_dsn,
        min_size=settings.postgres_min_pool,
        max_size=settings.postgres_max_pool,
        command_timeout=30,
    )

    async with _pool.acquire() as conn:
        await conn.execute(_schema_sql())

    return _pool


def get_pg_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Postgres pool is not initialized")
    return _pool


async def close_pg_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
    _pool = None
