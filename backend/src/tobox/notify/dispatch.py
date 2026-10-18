"""Fan a notification out to the enabled channels; one channel failing never blocks another."""

import logging
from datetime import date

from sqlalchemy.orm import Session

from tobox.models import NotificationLog
from tobox.notify.channels import CHANNELS, DeliveryError
from tobox.notify.events import Notification
from tobox.schemas import Delivery, Preferences

log = logging.getLogger(__name__)


def dispatch(
    session: Session, prefs: Preferences, note: Notification, day: date, *, record: bool = True
) -> list[Delivery]:
    deliveries: list[Delivery] = []
    for channel in CHANNELS.values():
        if not channel.enabled(prefs):
            continue
        try:
            deliveries.append(
                Delivery(channel=channel.name, ok=True, detail=channel.send(session, prefs, note))
            )
        except DeliveryError as exc:
            deliveries.append(Delivery(channel=channel.name, ok=False, detail=str(exc)))
        except Exception:
            log.exception("channel %s crashed", channel.name)
            deliveries.append(Delivery(channel=channel.name, ok=False, detail="internal error"))
    if record:
        for d in deliveries or [Delivery(channel="-", ok=False, detail="no channels enabled")]:
            session.add(
                NotificationLog(
                    kind=note.kind, date=day, channel=d.channel, ok=d.ok, detail=d.detail
                )
            )
        session.commit()
    return deliveries
