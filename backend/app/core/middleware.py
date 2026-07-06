import time
import uuid
import logging

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from ..metrics import REQUEST_COUNT, REQUEST_LATENCY

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id
        start_time = time.time()

        path = request.url.path
        method = request.method

        logger.info(
            "Request %s: %s %s",
            request_id,
            method,
            path,
        )

        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time-MS"] = str(round(process_time * 1000, 2))

            status = response.status_code

            REQUEST_COUNT.labels(method=method, endpoint=path, status=status).inc()
            REQUEST_LATENCY.labels(method=method, endpoint=path).observe(process_time)

            if status >= 400:
                logger.warning(
                    "Request %s: %s %s -> %s (%.2fms)",
                    request_id,
                    method,
                    path,
                    status,
                    process_time * 1000,
                )
            else:
                logger.info(
                    "Request %s: %s %s -> %s (%.2fms)",
                    request_id,
                    method,
                    path,
                    status,
                    process_time * 1000,
                )

            return response
        except Exception as e:
            process_time = time.time() - start_time
            REQUEST_COUNT.labels(method=method, endpoint=path, status=500).inc()
            REQUEST_LATENCY.labels(method=method, endpoint=path).observe(process_time)
            logger.exception(
                "Request %s failed after %.2fms: %s",
                request_id,
                process_time * 1000,
                str(e),
            )
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Internal server error",
                    "request_id": request_id,
                },
            )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
