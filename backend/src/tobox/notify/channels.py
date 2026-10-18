"""Delivery channels. Each one is self-contained: preference lookup, readiness, and sending."""

import base64
import json
import logging
from typing import ClassVar, Protocol

import httpx2 as httpx
from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid
from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.orm import Session

from tobox.config import get_settings
from tobox.models import AppState, PushSubscription
from tobox.notify.events import Notification
from tobox.schemas import Preferences

log = logging.getLogger(__name__)


class DeliveryError(Exception):
    """A channel could not deliver; the message is shown to the user."""


class Channel(Protocol):
    name: ClassVar[str]
    label: ClassVar[str]

    def enabled(self, prefs: Preferences) -> bool: ...

    def ready(self, session: Session, prefs: Preferences) -> tuple[bool, str]:
        """Whether the channel can deliver right now, plus a human-readable reason."""
        ...

    def send(self, session: Session, prefs: Preferences, note: Notification) -> str:
        """Deliver, returning a short success detail; raise DeliveryError on failure."""
        ...


def absolute(path: str) -> str:
    return get_settings().public_url.rstrip("/") + path


# --- Web Push ------------------------------------------------------------------------

VAPID_KEY = "vapid_private_pem"


def _vapid(session: Session) -> Vapid:
    """The server's VAPID key pair, generated once and kept in app_state."""
    row = session.get(AppState, VAPID_KEY)
    if row is None:
        vapid = Vapid()
        vapid.generate_keys()
        row = AppState(key=VAPID_KEY, value=vapid.private_pem().decode())
        session.add(row)
        session.commit()
    return Vapid.from_pem(row.value.encode())


def vapid_public_key(session: Session) -> str:
    """Base64url uncompressed P-256 point: the `applicationServerKey` browsers subscribe with."""
    raw = _vapid(session).public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class WebPushChannel:
    name: ClassVar[str] = "webpush"
    label: ClassVar[str] = "Browser notifications"

    def enabled(self, prefs: Preferences) -> bool:
        return prefs.notifications.channels.webpush.enabled

    def ready(self, session: Session, prefs: Preferences) -> tuple[bool, str]:  # noqa: ARG002
        count = len(session.scalars(select(PushSubscription.id)).all())
        if not count:
            return False, "No browser subscribed yet"
        return True, f"{count} browser{'s' if count != 1 else ''} subscribed"

    def send(self, session: Session, prefs: Preferences, note: Notification) -> str:  # noqa: ARG002
        subs = list(session.scalars(select(PushSubscription)))
        if not subs:
            raise DeliveryError("no subscribed browsers")
        vapid = _vapid(session)
        payload = json.dumps(
            {"title": note.title, "body": note.body, "url": note.path, "tag": note.kind}
        )
        delivered, errors = 0, []
        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=payload,
                    vapid_private_key=vapid,
                    vapid_claims={"sub": get_settings().vapid_subject},
                    timeout=10,
                    ttl=4 * 3600,
                )
                delivered += 1
            except WebPushException as exc:
                status = exc.response.status_code if exc.response is not None else None
                if status in (404, 410):  # subscription expired or revoked by the browser
                    session.delete(sub)
                    errors.append("removed an expired subscription")
                else:
                    log.warning("web push failed: %s", exc)
                    errors.append(f"push service error {status or ''}".strip())
        session.commit()
        if not delivered:
            raise DeliveryError("; ".join(errors) or "not delivered")
        detail = f"sent to {delivered} browser{'s' if delivered != 1 else ''}"
        return f"{detail} ({'; '.join(errors)})" if errors else detail


# --- Discord ---------------------------------------------------------------------------


class DiscordChannel:
    name: ClassVar[str] = "discord"
    label: ClassVar[str] = "Discord"

    def enabled(self, prefs: Preferences) -> bool:
        return prefs.notifications.channels.discord.enabled

    def ready(self, session: Session, prefs: Preferences) -> tuple[bool, str]:  # noqa: ARG002
        if not prefs.notifications.channels.discord.webhook_url:
            return False, "Add a webhook URL"
        return True, "Webhook configured"

    def send(self, session: Session, prefs: Preferences, note: Notification) -> str:  # noqa: ARG002
        url = prefs.notifications.channels.discord.webhook_url
        if not url:
            raise DeliveryError("no webhook URL configured")
        embed = {
            "title": note.title,
            "description": note.body,
            "url": absolute(note.path),
            "color": 0x0D9488,
        }
        try:
            res = httpx.post(url, json={"embeds": [embed]}, timeout=10)
        except httpx.HTTPError as exc:
            raise DeliveryError(f"could not reach Discord: {exc.__class__.__name__}") from exc
        if res.status_code >= 400:
            raise DeliveryError(f"Discord returned {res.status_code}")
        return "posted to webhook"


CHANNELS: dict[str, Channel] = {c.name: c for c in (WebPushChannel(), DiscordChannel())}
