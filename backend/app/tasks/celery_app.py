from celery import Celery

from ..core.config import settings

celery_app = Celery(
    "landsearch",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.cadastre_tasks", "app.tasks.import_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Moscow",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)
