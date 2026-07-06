import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task
def sync_cadastre_data(cadastral_number: str) -> dict:
    logger.info("Syncing cadastre data for %s", cadastral_number)
    return {"status": "pending", "cadastral_number": cadastral_number}


@shared_task
def batch_sync_settlement(settlement_id: str) -> dict:
    logger.info("Batch syncing settlement %s", settlement_id)
    return {"status": "pending", "settlement_id": settlement_id}


@shared_task
def auto_discover_plots(settlement_id: str) -> dict:
    logger.info("Auto-discovering plots in settlement %s", settlement_id)
    return {"status": "pending", "settlement_id": settlement_id}


@shared_task
def check_status_changes() -> dict:
    logger.info("Checking status changes")
    return {"status": "ok"}


@shared_task
def import_file_process(import_id: str) -> dict:
    logger.info("Processing import %s", import_id)
    return {"status": "pending", "import_id": import_id}
