import json
import os
import time
from datetime import datetime, timezone, timedelta

import azure.functions as func
import httpx
from pydantic import ValidationError
from src.schemas import RoutineUpdate
from src.auth import get_user_id_from_request
from src.schemas import RoutineCreate
from src.security import validate_headers
from src.supabase_admin import SupabaseAdmin

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


def _json(status: int, payload: dict) -> func.HttpResponse:
    return func.HttpResponse(
        body=json.dumps(payload, ensure_ascii=False),
        status_code=status,
        mimetype="application/json",
        headers={"Cache-Control": "no-store"},
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _truncate(s: str | None, max_len: int = 180) -> str | None:
    if s is None:
        return None
    s = str(s)
    return s if len(s) <= max_len else s[:max_len]


def _ping_supabase() -> dict:
    """Ping simples via REST do Supabase usando service_role (backend only)."""
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_env"}

    url = f"{supabase_url.rstrip('/')}/rest/v1/workspaces?select=id&limit=1"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }

    try:
        t0 = time.time()
        r = httpx.get(url, headers=headers, timeout=3.0)
        elapsed_ms = int((time.time() - t0) * 1000)
        return {
            "ok": r.status_code == 200,
            "status_code": r.status_code,
            "latency_ms": elapsed_ms,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@app.route(route="health", methods=["GET"])
def health(req: func.HttpRequest) -> func.HttpResponse:
    payload = {
        "status": "ok",
        "service": "opspulse-api",
        "supabase": _ping_supabase(),
    }
    return _json(200, payload)


@app.route(route="routines", methods=["POST"])
def create_routine(req: func.HttpRequest) -> func.HttpResponse:
    """
    Cria uma rotina vinculada ao usuário autenticado (token do Supabase).
    O backend valida o token e cria/obtém um workspace do usuário.
    """
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(
            401,
            {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}},
        )

    try:
        body = req.get_json()
    except Exception:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": "Invalid JSON body"}})

    try:
        data = RoutineCreate.model_validate(body)
        validate_headers(data.headers_json)

        admin = SupabaseAdmin()
        workspace_id = admin.get_or_create_workspace_id(user_id)

        now = datetime.now(timezone.utc)
        next_run = now + timedelta(minutes=data.interval_minutes)

        payload = {
            "workspace_id": workspace_id,
            "name": data.name,
            "kind": data.kind,
            "interval_minutes": data.interval_minutes,
            "next_run_at": next_run.isoformat(),
            "endpoint_url": str(data.endpoint_url),
            "http_method": data.http_method,
            "headers_json": data.headers_json,
            "auth_mode": data.auth_mode,
            "secret_ref": data.secret_ref,
        }

        created = admin.insert_routine(payload)
        return _json(201, {"routine": created})

    except ValidationError as ve:
        return _json(400, {"error": {"code": "VALIDATION_ERROR", "details": ve.errors()}})
    except ValueError as ve:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": str(ve)}})
    except Exception as e:
        return _json(500, {"error": {"code": "INTERNAL", "message": str(e)[:200]}})


@app.route(route="routines", methods=["GET"])
def list_routines(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(
            401,
            {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}},
        )

    try:
        limit_raw = req.params.get("limit", "50")
        limit = int(limit_raw)
        if limit < 1 or limit > 200:
            return _json(400, {"error": {"code": "BAD_REQUEST", "message": "limit must be between 1 and 200"}})

        admin = SupabaseAdmin()
        workspace_id = admin.get_or_create_workspace_id(user_id)
        routines = admin.list_routines(workspace_id, limit=limit)

        return _json(200, {"routines": routines})

    except ValueError:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": "limit must be an integer"}})
    except Exception as e:
        return _json(500, {"error": {"code": "INTERNAL", "message": str(e)[:200]}})


@app.route(route="routines/{routine_id}", methods=["GET"])
def get_routine(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(
            401,
            {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}},
        )

    routine_id = req.route_params.get("routine_id")
    if not routine_id:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": "Missing routine_id"}})

    try:
        admin = SupabaseAdmin()
        workspace_id = admin.get_or_create_workspace_id(user_id)
        routine = admin.get_routine(workspace_id, routine_id)

        if not routine:
            return _json(404, {"error": {"code": "NOT_FOUND", "message": "Routine not found"}})

        return _json(200, {"routine": routine})

    except Exception as e:
        return _json(500, {"error": {"code": "INTERNAL", "message": str(e)[:200]}})


@app.route(route="routines/{routine_id}/run", methods=["POST"])
def run_routine(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(
            401,
            {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}},
        )

    routine_id = req.route_params.get("routine_id")
    if not routine_id:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": "Missing routine_id"}})

    admin = SupabaseAdmin()
    workspace_id = admin.get_or_create_workspace_id(user_id)

    routine = admin.get_routine(workspace_id, routine_id)
    if not routine:
        return _json(404, {"error": {"code": "NOT_FOUND", "message": "Routine not found"}})

    timeout_s = int(os.environ.get("HTTP_TIMEOUT_SECONDS", "10"))
    started_at = _now_iso()
    t0 = time.time()

    headers = dict(routine.get("headers_json") or {})
    auth_mode = routine.get("auth_mode") or "NONE"
    secret_ref = routine.get("secret_ref")

    if auth_mode == "SECRET_REF":
        if not secret_ref:
            return _json(
                400,
                {"error": {"code": "BAD_REQUEST", "message": "secret_ref is required for SECRET_REF"}},
            )
        secret_val = os.environ.get(f"SECRET_{secret_ref}")
        if not secret_val:
            return _json(
                500,
                {"error": {"code": "INTERNAL", "message": f"Missing app setting SECRET_{secret_ref}"}},
            )
        headers["Authorization"] = f"Bearer {secret_val}"

    method = (routine.get("http_method") or "GET").upper()
    url = routine.get("endpoint_url")

    http_status = None
    error_message = None
    status = "FAIL"

    def do_request():
        return httpx.request(method, url, headers=headers, timeout=timeout_s)

    try:
        r = do_request()
        http_status = r.status_code

        if http_status in (429, 502, 503, 504):
            time.sleep(0.5)
            r = do_request()
            http_status = r.status_code

        if 200 <= http_status < 400:
            status = "SUCCESS"
        else:
            status = "FAIL"
            error_message = _truncate(f"HTTP {http_status}")

    except Exception as e:
        status = "FAIL"
        error_message = _truncate(str(e))

    duration_ms = int((time.time() - t0) * 1000)
    finished_at = _now_iso()

    run_payload = {
        "routine_id": routine_id,
        "triggered_by": "MANUAL",
        "status": status,
        "http_status": http_status,
        "duration_ms": duration_ms,
        "error_message": error_message,
        "started_at": started_at,
        "finished_at": finished_at,
    }

    created_run = admin.insert_run(run_payload)

    try:
        admin.touch_last_run(workspace_id, routine_id, finished_at)
    except Exception:
        pass

    return _json(200, {"run": created_run, "routine": {"id": routine_id, "last_run_at": finished_at}})


@app.route(route="routines/{routine_id}/runs", methods=["GET"])
def list_runs(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(
            401,
            {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}},
        )

    routine_id = req.route_params.get("routine_id")
    if not routine_id:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": "Missing routine_id"}})

    try:
        limit = int(req.params.get("limit", "50"))
        if limit < 1 or limit > 200:
            return _json(400, {"error": {"code": "BAD_REQUEST", "message": "limit must be between 1 and 200"}})

        admin = SupabaseAdmin()
        workspace_id = admin.get_or_create_workspace_id(user_id)

        routine = admin.get_routine(workspace_id, routine_id)
        if not routine:
            return _json(404, {"error": {"code": "NOT_FOUND", "message": "Routine not found"}})

        runs = admin.list_runs(workspace_id, routine_id, limit=limit)
        return _json(200, {"runs": runs})

    except ValueError:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": "limit must be an integer"}})
    except Exception as e:
        return _json(500, {"error": {"code": "INTERNAL", "message": str(e)[:200]}})

@app.route(route="routines/{routine_id}", methods=["PATCH"])
def patch_routine(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(401, {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}})

    routine_id = req.route_params.get("routine_id")
    if not routine_id:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": "Missing routine_id"}})

    try:
        body = req.get_json()
    except Exception:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": "Invalid JSON body"}})

    try:
        data = RoutineUpdate.model_validate(body)

        changes = data.model_dump(exclude_unset=True, exclude_none=True)

        if "headers_json" in changes:
            validate_headers(changes["headers_json"])

        if changes.get("auth_mode") == "SECRET_REF" and not changes.get("secret_ref"):
            return _json(400, {"error": {"code": "BAD_REQUEST", "message": "secret_ref is required when auth_mode=SECRET_REF"}})

        if "interval_minutes" in changes:
            next_run = datetime.now(timezone.utc) + timedelta(minutes=int(changes["interval_minutes"]))
            changes["next_run_at"] = next_run.isoformat()

        changes["updated_at"] = _now_iso()

        admin = SupabaseAdmin()
        workspace_id = admin.get_or_create_workspace_id(user_id)

        existing = admin.get_routine(workspace_id, routine_id)
        if not existing:
            return _json(404, {"error": {"code": "NOT_FOUND", "message": "Routine not found"}})

        updated = admin.update_routine(workspace_id, routine_id, changes)
        return _json(200, {"routine": updated})

    except ValidationError as ve:
        return _json(400, {"error": {"code": "VALIDATION_ERROR", "details": ve.errors()}})
    except ValueError as ve:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": str(ve)}})
    except Exception as e:
        return _json(500, {"error": {"code": "INTERNAL", "message": str(e)[:200]}})

@app.route(route="routines/{routine_id}", methods=["DELETE"])
def delete_routine(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(
            401,
            {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}},
        )

    routine_id = req.route_params.get("routine_id")
    if not routine_id:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": "Missing routine_id"}})

    try:
        admin = SupabaseAdmin()
        workspace_id = admin.get_or_create_workspace_id(user_id)

        existing = admin.get_routine(workspace_id, routine_id)
        if not existing:
            return _json(404, {"error": {"code": "NOT_FOUND", "message": "Routine not found"}})

        admin.delete_routine(workspace_id, routine_id)
        return _json(200, {"deleted": True, "id": routine_id})

    except Exception as e:
        return _json(500, {"error": {"code": "INTERNAL", "message": str(e)[:200]}})
