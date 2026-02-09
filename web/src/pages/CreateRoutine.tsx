import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

function isValidUrl(url: string) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export default function CreateRoutine() {
  const nav = useNavigate();

  const [name, setName] = useState("Nova rotina");
  const [endpointUrl, setEndpointUrl] = useState("https://httpbin.org/status/200");
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [httpMethod, setHttpMethod] = useState<"GET" | "POST">("GET");
  const [isActive, setIsActive] = useState(true);
  const [headersText, setHeadersText] = useState('{"User-Agent":"OpsPulse"}');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const trimmedName = name.trim();
    const trimmedUrl = endpointUrl.trim();

    if (!trimmedName) {
      setMsg("Informe um nome.");
      return;
    }
    if (!trimmedUrl || !isValidUrl(trimmedUrl)) {
      setMsg("Informe uma URL válida.");
      return;
    }
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5) {
      setMsg("interval_minutes precisa ser >= 5 (regra do banco).");
      return;
    }

    let headersJson: Record<string, string> = {};
    const ht = headersText.trim();

    if (ht) {
      try {
        const parsed = JSON.parse(ht);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setMsg("headers_json precisa ser um JSON objeto. Ex: {\"User-Agent\":\"OpsPulse\"}");
          return;
        }

        // força valores string (mais seguro pro backend)
        headersJson = Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [k, String(v)])
        );
      } catch {
        setMsg("headers_json inválido. Use um JSON objeto. Ex: {\"User-Agent\":\"OpsPulse\"}");
        return;
      }
    }

    // Observação: o backend já bloqueia Authorization/Cookie/X-API-Key.
    // Aqui só montamos um payload limpo.
    const payload = {
      name: trimmedName,
      kind: "HTTP_CHECK",
      interval_minutes: intervalMinutes,
      endpoint_url: trimmedUrl,
      http_method: httpMethod,
      headers_json: headersJson,
      is_active: isActive,
      auth_mode: "NONE",
      secret_ref: null,
    };

    setSaving(true);
    try {
      const res = await apiFetch("/routines", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const created = res?.routine ?? res;
      const id = created?.id ?? res?.id;

      setMsg("Rotina criada! Redirecionando...");
      if (id) {
        nav(`/routines/${id}`, { replace: true });
      } else {
        nav("/", { replace: true });
      }
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/">← Voltar</Link>
      </div>

      <h1>Criar rotina</h1>
      <p style={{ marginTop: 6 }}>
        MVP: Rotina HTTP com interval_minutes (sem cron).
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <b>Nome</b>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <b>Endpoint URL</b>
          <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <b>Intervalo (min)</b>
            <input
              type="number"
              min={5}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            />
            <small>Regra do banco: mínimo 5.</small>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <b>Método</b>
            <select value={httpMethod} onChange={(e) => setHttpMethod(e.target.value as any)}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <b>Headers (JSON)</b>
          <textarea
            rows={5}
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
          />
          <small>
            Dica: mantenha simples. O backend bloqueia Authorization/Cookie/X-API-Key.
          </small>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <b>Ativa</b>
        </label>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Criar"}
          </button>
          <button type="button" onClick={() => nav("/", { replace: true })}>
            Cancelar
          </button>
        </div>

        {msg && (
          <p style={{ marginTop: 6 }}>
            <b>Info:</b> {msg}
          </p>
        )}
      </form>
    </div>
  );
}
