FORBIDDEN_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
}

MAX_HEADER_NAME_LEN = 100
MAX_HEADER_VALUE_LEN = 4096


def _is_valid_header_name(name: str) -> bool:
    # RFC 7230 tchar simplificado
    allowed = set("!#$%&'*+-.^_`|~")
    return all(ch.isalnum() or ch in allowed for ch in name)


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
        if not nk:
            raise ValueError("header name cannot be empty.")
        if len(nk) > MAX_HEADER_NAME_LEN:
            raise ValueError(f"header '{k}' exceeds max length ({MAX_HEADER_NAME_LEN}).")
        if not _is_valid_header_name(nk):
            raise ValueError(f"header '{k}' has invalid name characters.")
        if nk in FORBIDDEN_HEADERS:
            raise ValueError(f"header '{k}' is not allowed (sensitive).")

        if len(v) > MAX_HEADER_VALUE_LEN:
            raise ValueError(f"header '{k}' exceeds max value length ({MAX_HEADER_VALUE_LEN}).")

        # evita header injection básico
        if "\n" in v or "\r" in v:
            raise ValueError(f"header '{k}' has invalid characters.")
