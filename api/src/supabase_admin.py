import os
import httpx


class SupabaseAdmin:
    def __init__(self) -> None:
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

        if not self.url or not self.key:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

        self.base_headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }

    def _req(self, method: str, path: str, params: dict | None = None, json: dict | None = None, extra_headers: dict | None = None):
        headers = dict(self.base_headers)
        if extra_headers:
            headers.update(extra_headers)

        with httpx.Client(timeout=10.0) as client:
            r = client.request(method, f"{self.url}{path}", params=params, json=json, headers=headers)
            return r

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

    def insert_routine(self, payload: dict) -> dict:
        r = self._req(
            "POST",
            "/rest/v1/routines",
            params={"select": "*"},
            json=payload,
            extra_headers={"Prefer": "return=representation"},
        )
        # PostgREST: Prefer return=representation retorna a linha criada :contentReference[oaicite:1]{index=1}
        if r.status_code not in (200, 201):
            raise RuntimeError(f"Failed inserting routine: {r.status_code} {r.text[:200]}")
        return r.json()[0]

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

    def get_routine(self, workspace_id: str, routine_id: str) -> dict | None:
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
        return r.json()[0]

    def list_runs(self, workspace_id: str, routine_id: str, limit: int = 50) -> list[dict]:
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

    def touch_last_run(self, workspace_id: str, routine_id: str, iso_ts: str) -> None:
        r = self._req(
            "PATCH",
            "/rest/v1/routines",
            params={"id": f"eq.{routine_id}", "workspace_id": f"eq.{workspace_id}"},
            json={"last_run_at": iso_ts, "updated_at": iso_ts},
        )
        if r.status_code not in (200, 204):
            raise RuntimeError(f"Failed updating routine last_run_at: {r.status_code} {r.text[:200]}")

    def update_routine(self, workspace_id: str, routine_id: str, changes: dict) -> dict:
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
