import json
import os
import time

import azure.functions as func
import httpx

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


def _ping_supabase() -> dict:
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        return {"ok": False, "reason": "missing_env"}

    url = f"{supabase_url}/rest/v1/workspaces?select=id&limit=1"
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
    return func.HttpResponse(
        body=json.dumps(payload, ensure_ascii=False),
        status_code=200,
        mimetype="application/json",
        headers={"Cache-Control": "no-store"},
    )
