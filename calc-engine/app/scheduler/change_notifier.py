"""
Change Notifier — sends a webhook POST when a rate change is detected.

If WEBHOOK_URL is not configured, logs the change to the audit log only.
Never raises — a webhook failure must not break the scheduler job.
"""
import json
import logging

import httpx

from app.config import settings
from app.utils.audit_logger import audit_log

logger = logging.getLogger(__name__)


def notify_rate_change(change: dict) -> bool:
    """
    Send a webhook notification for a detected rate change.

    Args:
        change: dict with keys:
            rate_type, old_value, new_value, old_version, new_version,
            source_url, municipality_code, detected_at

    Returns:
        True if webhook was sent successfully, False otherwise.
    """
    payload = {
        "event": "rate_changed",
        **change,
    }

    audit_log("rate_change_detected", payload)

    if not settings.webhook_url:
        logger.info(f"Rate change detected (no webhook configured): {change['rate_type']} "
                    f"for {change.get('municipality_code', 'GLOBAL')}")
        return False

    try:
        response = httpx.post(
            settings.webhook_url,
            json=payload,
            timeout=10.0,
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()
        logger.info(f"Webhook sent for rate change: {change['rate_type']}")
        return True
    except Exception as e:
        logger.warning(f"Webhook failed for rate change {change['rate_type']}: {e}")
        audit_log("webhook_failed", {"error": str(e), **payload})
        return False


def notify_all_changes(changes: list[dict], municipality_code: str) -> None:
    """Send notifications for all changes in a batch."""
    for change in changes:
        change.setdefault("municipality_code", municipality_code)
        notify_rate_change(change)
