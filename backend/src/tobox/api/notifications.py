from fastapi import APIRouter, Header, Response
from sqlalchemy import select

from tobox import prefs
from tobox.api.deps import SessionDep
from tobox.models import NotificationLog, PushSubscription
from tobox.notify.channels import CHANNELS, vapid_public_key
from tobox.notify.dispatch import dispatch
from tobox.notify.events import sample_notification
from tobox.schemas import (
    ChannelInfo,
    NotificationLogOut,
    NotificationTestOut,
    WebPushConfig,
    WebPushSubscriptionIn,
    WebPushUnsubscribe,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/channels", response_model=list[ChannelInfo])
def list_channels(session: SessionDep) -> list[ChannelInfo]:
    p = prefs.load(session)
    out = []
    for channel in CHANNELS.values():
        ready, detail = channel.ready(session, p)
        out.append(
            ChannelInfo(
                name=channel.name,
                label=channel.label,
                enabled=channel.enabled(p),
                ready=ready,
                detail=detail,
            )
        )
    return out


@router.post("/test", response_model=NotificationTestOut)
def send_test(session: SessionDep) -> NotificationTestOut:
    """Send a sample notification through every enabled channel (not recorded in the log)."""
    p = prefs.load(session)
    today = prefs.local_now(p).date()
    return NotificationTestOut(
        deliveries=dispatch(session, p, sample_notification(), today, record=False)
    )


@router.get("/log", response_model=list[NotificationLogOut])
def notification_log(session: SessionDep, limit: int = 20) -> list[NotificationLog]:
    stmt = select(NotificationLog).order_by(NotificationLog.id.desc()).limit(min(limit, 200))
    return list(session.scalars(stmt))


@router.get("/webpush", response_model=WebPushConfig)
def webpush_config(session: SessionDep) -> WebPushConfig:
    count = len(session.scalars(select(PushSubscription.id)).all())
    return WebPushConfig(public_key=vapid_public_key(session), subscriptions=count)


@router.post("/webpush/subscriptions", status_code=204)
def subscribe(
    body: WebPushSubscriptionIn,
    session: SessionDep,
    user_agent: str = Header(default=""),
) -> Response:
    sub = session.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    if sub is None:
        sub = PushSubscription(endpoint=body.endpoint)
        session.add(sub)
    sub.p256dh, sub.auth, sub.user_agent = body.keys.p256dh, body.keys.auth, user_agent[:300]
    session.commit()
    return Response(status_code=204)


@router.post("/webpush/unsubscribe", status_code=204)
def unsubscribe(body: WebPushUnsubscribe, session: SessionDep) -> Response:
    sub = session.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    if sub is not None:
        session.delete(sub)
        session.commit()
    return Response(status_code=204)
