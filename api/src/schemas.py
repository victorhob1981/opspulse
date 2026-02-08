from typing import Literal, Optional, Dict
from pydantic import BaseModel, Field, AnyHttpUrl


class RoutineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: Literal["HTTP_CHECK", "WEBHOOK_CALL"]
    interval_minutes: int = Field(ge=5)

    endpoint_url: AnyHttpUrl
    http_method: Literal["GET", "POST"]

    headers_json: Dict[str, str] = Field(default_factory=dict)

    auth_mode: Literal["NONE", "SECRET_REF"] = "NONE"
    secret_ref: Optional[str] = None

from typing import Optional

class RoutineUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    interval_minutes: Optional[int] = Field(default=None, ge=5)
    endpoint_url: Optional[AnyHttpUrl] = None
    http_method: Optional[Literal["GET", "POST"]] = None
    headers_json: Optional[Dict[str, str]] = None
    auth_mode: Optional[Literal["NONE", "SECRET_REF"]] = None
    secret_ref: Optional[str] = None
    is_active: Optional[bool] = None
