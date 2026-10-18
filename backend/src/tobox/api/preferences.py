from fastapi import APIRouter

from tobox import prefs
from tobox.api.deps import SessionDep
from tobox.schemas import Preferences

router = APIRouter(prefix="/preferences", tags=["preferences"])


@router.get("", response_model=Preferences)
def get_preferences(session: SessionDep) -> Preferences:
    return prefs.load(session)


@router.put("", response_model=Preferences)
def put_preferences(body: Preferences, session: SessionDep) -> Preferences:
    return prefs.save(session, body)
