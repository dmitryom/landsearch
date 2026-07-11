import time

from fastapi import Request
from redis.asyncio import from_url

from .config import settings
from .exceptions import RateLimitException


class RedisRateLimiter:
    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def check(self, key: str) -> None:
        redis = from_url(settings.redis_url)
        try:
            now = int(time.time())
            window_start = now - self.window_seconds

            await redis.zremrangebyscore(key, 0, window_start)

            count = await redis.zcard(key)

            if count >= self.max_requests:
                raise RateLimitException("Too many requests. Please try again later.")

            member = f"{now}:{time.monotonic_ns()}"
            await redis.zadd(key, {member: now})
            await redis.expire(key, self.window_seconds)
        finally:
            await redis.aclose()


rate_limiter = RedisRateLimiter()


async def check_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    key = f"ratelimit:{client_ip}"
    await rate_limiter.check(key)
