FORBIDDEN_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
}

def validate_headers(headers: dict) -> None:
    if headers is None:
        return

    if not isinstance(headers, dict):
        raise ValueError("headers_json must be an object (key/value).")

    for k, v in headers.items():
        if not isinstance(k, str):
            raise ValueError("headers_json keys must be strings.")
        if not isinstance(v, str):
            raise ValueError(f"header '{k}' value must be a string.")

        nk = k.strip().lower()
        if nk in FORBIDDEN_HEADERS:
            raise ValueError(f"header '{k}' is not allowed (sensitive).")

        # evita header injection básico
        if "\n" in v or "\r" in v:
            raise ValueError(f"header '{k}' has invalid characters.")
