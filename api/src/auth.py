import os
import httpx


def get_user_id_from_request(auth_header: str | None) -> str | None:
    """
    Espera: Authorization: Bearer <access_token do Supabase>
    Faz uma chamada ao /auth/v1/user para validar e obter o user.id.

    Obs: precisa enviar 'apikey' junto (igual o supabase-js faz).
    """
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None

    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "")

    if not supabase_url or not anon_key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_ANON_KEY")

    url = f"{supabase_url}/auth/v1/user"
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {token}",
    }

    with httpx.Client(timeout=10.0) as client:
        r = client.get(url, headers=headers)

    if r.status_code == 200:
        return r.json().get("id")
    return None
