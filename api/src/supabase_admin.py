import os
from datetime import datetime, timedelta
from typing import Any, Optional

import httpx


class SupabaseAdmin:
    """
    Cliente "admin" (backend only) para PostgREST do Supabase usando SERVICE_ROLE.
    IMPORTANTE: SERVICE_ROLE_KEY nunca vai para o front. Só no backend.
    """

    def __init__(self) -> None:
        self.supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

        if not self.supabase_url or not self.service_key:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

        self.base_headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
        }

        # timeout padrão (pode ajustar via env se quiser)
        self.timeout_s = float(os.environ.get("SUPABASE_TIMEOUT_SECONDS", "10"))
        self.client = httpx.Client(timeout=self.timeout_s)

    def _req(
        self,
        method: str,
        path: str,
        params: Optional[dict[str, Any]] = None,
        json: Optional[dict[str, Any]] = None,
        extra_headers: Optional[dict[str, str]] = None,
    ) -> httpx.Response:
        url = f"{self.supabase_url}{path}"

        headers = dict(self.base_headers)  # copia
        if extra_headers:
            headers.update(extra_headers)  # ✅ mescla (não sobrescreve)

        return self.client.request(
            method=method,
            url=url,
            headers=headers,
            params=params,
            json=json,
        )

    # -------------------------
    # Workspaces
    # -------------------------
    def get_or_create_workspace_id(self, owner_id: str) -> str:
        # 1) tenta pegar workspace existente
        r = self._req(
            "GET",
            "/rest/v1/workspaces",
            params={"owner_id": f"eq.{owner_id}", "select": "id", "limit": "1"},
        )
        if r.status_code == 200:
            rows = r.json()
            if rows:
                return rows[0]["id"]

        # 2) cria workspace
        r2 = self._req(
            "POST",
            "/rest/v1/workspaces",
            params={"select": "id"},
            json={"owner_id": owner_id, "name": "My Workspace"},
            extra_headers={"Prefer": "return=representation"},
        )
        if r2.status_code not in (200, 201):
            raise RuntimeError(f"Failed creating workspace: {r2.status_code} {r2.text[:200]}")

        created = r2.json()
        return created[0]["id"]

    # -------------------------
    # Routines (CRUD)
    # -------------------------
    def insert_routine(self, payload: dict) -> dict:
        r = self._req(
            "POST",
            "/rest/v1/routines",
            params={"select": "*"},
            json=payload,
            extra_headers={"Prefer": "return=representation"},
        )
        if r.status_code not in (200, 201):
            raise RuntimeError(f"Failed inserting routine: {r.status_code} {r.text[:200]}")
        rows = r.json()
        return rows[0] if rows else {}

    def list_routines(self, workspace_id: str, limit: int = 50) -> list[dict]:
        r = self._req(
            "GET",
            "/rest/v1/routines",
            params={
                "workspace_id": f"eq.{workspace_id}",
                "select": "*",
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )
        if r.status_code != 200:
            raise RuntimeError(f"Failed listing routines: {r.status_code} {r.text[:200]}")
        return r.json()

    def get_routine(self, workspace_id: str, routine_id: str) -> Optional[dict]:
        r = self._req(
            "GET",
            "/rest/v1/routines",
            params={
                "id": f"eq.{routine_id}",
                "workspace_id": f"eq.{workspace_id}",
                "select": "*",
                "limit": "1",
            },
        )
        if r.status_code != 200:
            raise RuntimeError(f"Failed getting routine: {r.status_code} {r.text[:200]}")
        rows = r.json()
        return rows[0] if rows else None

    def update_routine(self, workspace_id: str, routine_id: str, changes: dict) -> Optional[dict]:
        r = self._req(
            "PATCH",
            "/rest/v1/routines",
            params={"id": f"eq.{routine_id}", "workspace_id": f"eq.{workspace_id}", "select": "*"},
            json=changes,
            extra_headers={"Prefer": "return=representation"},
        )
        if r.status_code not in (200, 201):
            raise RuntimeError(f"Failed updating routine: {r.status_code} {r.text[:200]}")
        rows = r.json()
        return rows[0] if rows else None

    def delete_routine(self, workspace_id: str, routine_id: str) -> None:
        r = self._req(
            "DELETE",
            "/rest/v1/routines",
            params={"id": f"eq.{routine_id}", "workspace_id": f"eq.{workspace_id}"},
        )
        if r.status_code not in (200, 204):
            raise RuntimeError(f"Failed deleting routine: {r.status_code} {r.text[:200]}")

    def touch_last_run(self, workspace_id: str, routine_id: str, iso_ts: str) -> None:
        r = self._req(
            "PATCH",
            "/rest/v1/routines",
            params={"id": f"eq.{routine_id}", "workspace_id": f"eq.{workspace_id}"},
            json={"last_run_at": iso_ts, "updated_at": iso_ts},
        )
        if r.status_code not in (200, 204):
            raise RuntimeError(f"Failed updating routine last_run_at: {r.status_code} {r.text[:200]}")

    # -------------------------
    # Runs (history)
    # -------------------------
    def insert_run(self, payload: dict) -> dict:
        r = self._req(
            "POST",
            "/rest/v1/routine_runs",
            params={"select": "*"},
            json=payload,
            extra_headers={"Prefer": "return=representation"},
        )
        if r.status_code not in (200, 201):
            raise RuntimeError(f"Failed inserting run: {r.status_code} {r.text[:200]}")
        rows = r.json()
        return rows[0] if rows else {}

    def list_runs(self, workspace_id: str, routine_id: str, limit: int = 50) -> list[dict]:
        """
        workspace_id fica aqui por compatibilidade com seu código,
        mas routine_runs normalmente não tem workspace_id.
        A segurança real vem do fato de que você só consegue pegar routine_id
        se a rotina pertencer ao workspace do usuário (feito no function_app).
        """
        r = self._req(
            "GET",
            "/rest/v1/routine_runs",
            params={
                "routine_id": f"eq.{routine_id}",
                "select": "*",
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )
        if r.status_code != 200:
            raise RuntimeError(f"Failed listing runs: {r.status_code} {r.text[:200]}")
        return r.json()

    # -------------------------
    # Scheduler helpers
    # -------------------------
    def list_due_routines(self, now_iso: str, limit: int = 20) -> list[dict]:
        r = self._req(
            "GET",
            "/rest/v1/routines",
            params={
                "select": "*",
                "is_active": "eq.true",
                "next_run_at": f"lte.{now_iso}",
                # sem lock ou lock expirado
                "or": f"(lock_until.is.null,lock_until.lt.{now_iso})",
                "order": "next_run_at.asc",
                "limit": str(limit),
            },
        )
        if r.status_code != 200:
            raise RuntimeError(f"Failed listing due routines: {r.status_code} {r.text[:200]}")
        return r.json()

    def try_lock_routine(
        self,
        workspace_id: str,
        routine_id: str,
        now_iso: str,
        lease_seconds: int,
        locked_by: str,
    ) -> Optional[dict]:
        now_dt = datetime.fromisoformat(now_iso)
        lock_until = (now_dt + timedelta(seconds=lease_seconds)).isoformat()

        r = self._req(
            "PATCH",
            "/rest/v1/routines",
            params={
                "id": f"eq.{routine_id}",
                "workspace_id": f"eq.{workspace_id}",
                "or": f"(lock_until.is.null,lock_until.lt.{now_iso})",
                "select": "*",
            },
            json={"lock_until": lock_until, "locked_by": locked_by, "updated_at": now_iso},
            extra_headers={
                "Prefer": "return=representation",
                "Accept": "application/json",
            },
        )

        if r.status_code not in (200, 201, 204):
            raise RuntimeError(f"Failed locking routine: {r.status_code} {r.text[:200]}")

        # 1) caminho ideal: veio a linha no body
        try:
            rows = r.json() if r.text else []
        except Exception:
            rows = []

        if rows:
            return rows[0]

        # 2) fallback: confirma no banco se o lock foi aplicado
        check = self._req(
            "GET",
            "/rest/v1/routines",
            params={
                "id": f"eq.{routine_id}",
                "workspace_id": f"eq.{workspace_id}",
                "locked_by": f"eq.{locked_by}",
                "select": "*",
                "limit": "1",
            },
        )
        if check.status_code == 200:
            got = check.json()
            return got[0] if got else None

        return None


    def finish_scheduled_run(
        self,
        workspace_id: str,
        routine_id: str,
        locked_by: str,
        last_run_at: str,
        next_run_at: str,
    ) -> None:
        r = self._req(
            "PATCH",
            "/rest/v1/routines",
            params={
                "id": f"eq.{routine_id}",
                "workspace_id": f"eq.{workspace_id}",
                "locked_by": f"eq.{locked_by}",
            },
            json={
                "last_run_at": last_run_at,
                "next_run_at": next_run_at,
                "lock_until": None,
                "locked_by": None,
                "updated_at": last_run_at,
            },
        )
        if r.status_code not in (200, 204):
            raise RuntimeError(f"Failed finishing scheduled run: {r.status_code} {r.text[:200]}")

    def release_lock(self, workspace_id: str, routine_id: str, locked_by: str) -> None:
        r = self._req(
            "PATCH",
            "/rest/v1/routines",
            params={
                "id": f"eq.{routine_id}",
                "workspace_id": f"eq.{workspace_id}",
                "locked_by": f"eq.{locked_by}",
            },
            json={"lock_until": None, "locked_by": None},
        )
        if r.status_code not in (200, 204):
            raise RuntimeError(f"Failed releasing lock: {r.status_code} {r.text[:200]}")
