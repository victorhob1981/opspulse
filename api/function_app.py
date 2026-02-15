import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta

import azure.functions as func
import httpx
from pydantic import ValidationError

from src.auth import get_user_id_from_request
from src.schemas import RoutineCreate, RoutineUpdate
from src.security import validate_headers
from src.supabase_admin import SupabaseAdmin

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


# -------------------------
# Helpers básicos
# -------------------------
def _json(status: int, payload: dict) -> func.HttpResponse:
    return func.HttpResponse(
        body=json.dumps(payload, ensure_ascii=False),
        status_code=status,
        mimetype="application/json",
        headers={"Cache-Control": "no-store"},
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


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
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}

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
        return {"ok": False, "error": _truncate(str(e), 200)}


def _get_secret_value(secret_ref: str | None) -> str | None:
    """
    Estratégia simples e segura:
    - Se secret_ref="GITHUB_TOKEN", busca env var "SECRET_GITHUB_TOKEN"
    - Se secret_ref já vier "SECRET_GITHUB_TOKEN", usa direto.
    """
    if not secret_ref:
        return None

    env_name = secret_ref if secret_ref.startswith("SECRET_") else f"SECRET_{secret_ref}"
    return os.environ.get(env_name)


def _iso_to_dt(value: str | None) -> datetime | None:
    """
    Parse defensivo pra ISO.
    - Aceita strings com 'Z' (converte pra '+00:00')
    - Retorna datetime timezone-aware quando possível
    """
    if not value:
        return None
    v = value.strip()
    if v.endswith("Z"):
        v = v[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(v)
    except Exception:
        return None


def _to_minute(dt: datetime) -> datetime:
    """Trunca datetime pra minuto cheio (segundos/micros = 0)."""
    return dt.replace(second=0, microsecond=0)


def _compute_next_run_scheduled(routine: dict, now_dt: datetime) -> str:
    """
    Calcula o próximo next_run_at para execução SCHEDULE sem drift.

    Regras:
    - Âncora no slot devido (routine.next_run_at) em vez de finished_at.
      Isso evita perder o tick do Timer Trigger (0 */5 * * * *) por poucos segundos.
    - Se estiver atrasado (next_run ainda no passado), pula intervalos até cair no futuro.
    - Sempre salva truncado no minuto (segundos/micros = 0).
    """
    interval = int(routine.get("interval_minutes") or 5)

    anchor_dt = _iso_to_dt(routine.get("next_run_at"))
    if anchor_dt is None:
        anchor_dt = now_dt

    if anchor_dt.tzinfo is None:
        anchor_dt = anchor_dt.replace(tzinfo=timezone.utc)

    next_dt = anchor_dt + timedelta(minutes=interval)

    while next_dt <= now_dt:
        next_dt = next_dt + timedelta(minutes=interval)

    next_dt = _to_minute(next_dt)
    return next_dt.isoformat()


def _execute_http_routine(routine: dict) -> dict:
    """
    Executa uma rotina do tipo HTTP_CHECK.
    Retorna sempre um dict com status/tempo/erro (não lança exception por HTTP != 2xx).
    """
    timeout_s = float(os.getenv("HTTP_TIMEOUT_SECONDS") or os.getenv("ROUTINE_TIMEOUT_SECONDS") or "8")

    started = _now_iso()
    t0 = time.time()

    try:
        method = (routine.get("http_method") or "GET").upper()
        url = routine.get("endpoint_url") or ""
        headers = routine.get("headers_json") or {}

        auth_mode = routine.get("auth_mode") or "NONE"
        if auth_mode == "SECRET_REF":
            token = _get_secret_value(routine.get("secret_ref"))
            if not token:
                finished = _now_iso()
                return {
                    "status": "FAIL",
                    "http_status": None,
                    "duration_ms": int((time.time() - t0) * 1000),
                    "error_message": "missing_secret_ref_value",
                    "started_at": started,
                    "finished_at": finished,
                }
            headers = dict(headers)
            headers["Authorization"] = f"Bearer {token}"

        r = httpx.request(method, url, headers=headers, timeout=timeout_s)

        finished = _now_iso()
        duration_ms = int((time.time() - t0) * 1000)

        ok = 200 <= r.status_code < 300
        if ok:
            return {
                "status": "SUCCESS",
                "http_status": r.status_code,
                "duration_ms": duration_ms,
                "error_message": None,
                "started_at": started,
                "finished_at": finished,
            }

        return {
            "status": "FAIL",
            "http_status": r.status_code,
            "duration_ms": duration_ms,
            "error_message": _truncate(f"http_error:{r.status_code}", 180),
            "started_at": started,
            "finished_at": finished,
        }

    except httpx.TimeoutException:
        finished = _now_iso()
        return {
            "status": "FAIL",
            "http_status": None,
            "duration_ms": int((time.time() - t0) * 1000),
            "error_message": "timeout",
            "started_at": started,
            "finished_at": finished,
        }
    except Exception as e:
        finished = _now_iso()
        return {
            "status": "FAIL",
            "http_status": None,
            "duration_ms": int((time.time() - t0) * 1000),
            "error_message": _truncate(f"exception:{str(e)}", 180),
            "started_at": started,
            "finished_at": finished,
        }


# -------------------------
# HTTPS Helpers
# -------------------------
@app.route(route="health", methods=["GET"])
def health(req: func.HttpRequest) -> func.HttpResponse:
    return _json(
        200,
        {
            "status": "ok",
            "service": "opspulse-api",
            "supabase": _ping_supabase(),
        },
    )


@app.route(route="routines", methods=["POST"])
def create_routine(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(401, {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}})

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
        next_run = _to_minute(now + timedelta(minutes=data.interval_minutes))

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
        return _json(500, {"error": {"code": "INTERNAL", "message": _truncate(str(e), 200)}})


@app.route(route="routines", methods=["GET"])
def list_routines(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(401, {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}})

    try:
        limit = int(req.params.get("limit", "50"))
        if limit < 1 or limit > 200:
            return _json(400, {"error": {"code": "BAD_REQUEST", "message": "limit must be between 1 and 200"}})

        admin = SupabaseAdmin()
        workspace_id = admin.get_or_create_workspace_id(user_id)
        routines = admin.list_routines(workspace_id, limit=limit)
        return _json(200, {"routines": routines})

    except ValueError:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": "limit must be an integer"}})
    except Exception as e:
        return _json(500, {"error": {"code": "INTERNAL", "message": _truncate(str(e), 200)}})


@app.route(route="routines/{routine_id}", methods=["GET"])
def get_routine(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(401, {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}})

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
        return _json(500, {"error": {"code": "INTERNAL", "message": _truncate(str(e), 200)}})


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
        changes = data.model_dump(mode="json", exclude_unset=True, exclude_none=True)
        if "endpoint_url" in changes:
            changes["endpoint_url"] = str(changes["endpoint_url"])

        if "headers_json" in changes:
            validate_headers(changes["headers_json"])

        if changes.get("auth_mode") == "SECRET_REF" and not changes.get("secret_ref"):
            return _json(400, {"error": {"code": "BAD_REQUEST", "message": "secret_ref is required when auth_mode=SECRET_REF"}})

        if "interval_minutes" in changes:
            next_run = datetime.now(timezone.utc) + timedelta(minutes=int(changes["interval_minutes"]))
            changes["next_run_at"] = _to_minute(next_run).isoformat()

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
        return _json(500, {"error": {"code": "INTERNAL", "message": _truncate(str(e), 200)}})


@app.route(route="routines/{routine_id}", methods=["DELETE"])
def delete_routine(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(401, {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}})

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
        return _json(500, {"error": {"code": "INTERNAL", "message": _truncate(str(e), 200)}})


@app.route(route="routines/{routine_id}/run", methods=["POST"])
def run_routine(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(401, {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}})

    routine_id = req.route_params.get("routine_id")
    if not routine_id:
        return _json(400, {"error": {"code": "BAD_REQUEST", "message": "Missing routine_id"}})

    try:
        admin = SupabaseAdmin()
        workspace_id = admin.get_or_create_workspace_id(user_id)

        routine = admin.get_routine(workspace_id, routine_id)
        if not routine:
            return _json(404, {"error": {"code": "NOT_FOUND", "message": "Routine not found"}})

        result = _execute_http_routine(routine)

        run_payload = {
            "routine_id": routine_id,
            "triggered_by": "MANUAL",
            "status": result["status"],
            "http_status": result["http_status"],
            "duration_ms": result["duration_ms"],
            "error_message": result["error_message"],
            "started_at": result["started_at"],
            "finished_at": result["finished_at"],
        }

        created_run = admin.insert_run(run_payload)

        try:
            admin.touch_last_run(workspace_id, routine_id, result["finished_at"])
        except Exception:
            pass

        return _json(200, {"run": created_run, "routine": {"id": routine_id, "last_run_at": result["finished_at"]}})

    except Exception as e:
        return _json(500, {"error": {"code": "INTERNAL", "message": _truncate(str(e), 200)}})


@app.route(route="routines/{routine_id}/runs", methods=["GET"])
def list_runs(req: func.HttpRequest) -> func.HttpResponse:
    user_id = get_user_id_from_request(req.headers.get("Authorization"))
    if not user_id:
        return _json(401, {"error": {"code": "UNAUTHORIZED", "message": "Missing/invalid Authorization Bearer token"}})

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
        return _json(500, {"error": {"code": "INTERNAL", "message": _truncate(str(e), 200)}})


# -------------------------
# Scheduler (Timer Trigger)
# -------------------------
def _run_one_scheduled(routine: dict, locked_by: str) -> dict:
    """
    Executa uma rotina já LOCKADA.
    - Sempre tenta finalizar (soltar lock + next_run_at) quando tiver timestamps.
    - Nunca deixa lock pendurado: fallback release_lock no finally (se existir).
    """
    local_admin = SupabaseAdmin()
    result = None
    finished_at = None

    try:
        result = _execute_http_routine(routine)
        finished_at = result.get("finished_at") or _now_iso()

        now_dt = datetime.now(timezone.utc)
        next_run = _compute_next_run_scheduled(routine, now_dt)

        try:
            run_payload = {
                "routine_id": routine["id"],
                "triggered_by": "SCHEDULE",
                "status": result["status"],
                "http_status": result["http_status"],
                "duration_ms": result["duration_ms"],
                "error_message": result["error_message"],
                "started_at": result["started_at"],
                "finished_at": finished_at,
            }
            local_admin.insert_run(run_payload)
        except Exception as e:
            print(f"[scheduler] insert_run failed routine={routine['id']} err={_truncate(str(e), 200)}")

        local_admin.finish_scheduled_run(
            workspace_id=routine["workspace_id"],
            routine_id=routine["id"],
            locked_by=locked_by,
            last_run_at=finished_at,
            next_run_at=next_run,
        )

        return {"id": routine["id"], "status": result["status"], "http_status": result["http_status"]}

    except Exception as e:
        try:
            now_iso = _now_iso()
            local_admin.insert_run(
                {
                    "routine_id": routine["id"],
                    "triggered_by": "SCHEDULE",
                    "status": "FAIL",
                    "http_status": None,
                    "duration_ms": 0,
                    "error_message": _truncate(f"scheduler_error:{str(e)}"),
                    "started_at": now_iso,
                    "finished_at": now_iso,
                }
            )
        except Exception:
            pass

        raise

    finally:
        try:
            if hasattr(local_admin, "release_lock"):
                local_admin.release_lock(
                    workspace_id=routine["workspace_id"],
                    routine_id=routine["id"],
                    locked_by=locked_by,
                )
        except Exception:
            pass


@app.schedule(schedule="0 */5 * * * *", arg_name="mytimer", run_on_startup=True, use_monitor=True)
def scheduler(mytimer: func.TimerRequest) -> None:
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.replace(microsecond=0).isoformat()

    due_slack_seconds = int(os.environ.get("DUE_SLACK_SECONDS", "3"))
    due_iso = (now_dt + timedelta(seconds=due_slack_seconds)).replace(microsecond=0).isoformat()
    lease_seconds = int(os.environ.get("LOCK_LEASE_SECONDS", "45"))
    batch_limit = int(os.environ.get("SCHEDULER_BATCH_LIMIT", "20"))
    max_concurrency = int(os.environ.get("MAX_CONCURRENCY", "5"))

    locked_by = os.environ.get("WEBSITE_INSTANCE_ID") or f"local-{uuid.uuid4().hex[:8]}"

    admin = SupabaseAdmin()

    try:
        candidates = admin.list_due_routines(due_iso, limit=batch_limit)
        if not candidates:
            print(f"[scheduler] no due routines at now={now_iso} due_cutoff={due_iso}")
            return

        locked = []
        for r in candidates:
            got = admin.try_lock_routine(
                workspace_id=r["workspace_id"],
                routine_id=r["id"],
                now_iso=now_iso,
                lease_seconds=lease_seconds,
                locked_by=locked_by,
            )
            if got:
                locked.append(got)

        if not locked:
            print(f"[scheduler] candidates found but none locked (lock active / race) at now={now_iso} due_cutoff={due_iso}")
            return

        print(f"[scheduler] locked {len(locked)} routines (batch_limit={batch_limit}, max_concurrency={max_concurrency})")

        with ThreadPoolExecutor(max_workers=max_concurrency) as ex:
            futures = [ex.submit(_run_one_scheduled, r, locked_by) for r in locked]
            for f in as_completed(futures):
                try:
                    out = f.result()
                    print(f"[scheduler] done routine={out['id']} status={out['status']} http={out['http_status']}")
                except Exception as e:
                    print(f"[scheduler] worker error: {_truncate(str(e), 200)}")

    except Exception as e:
        print(f"[scheduler] fatal error: {_truncate(str(e), 200)}")
