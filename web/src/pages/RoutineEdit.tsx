import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";

type Routine = {
  id: string;
  name: string;
  endpoint_url: string;
  interval_minutes: number;
  http_method: "GET" | "POST";
  headers_json: Record<string, any>;
  is_active: boolean;
};

export default function RoutineEdit() {
  const { id } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState("5");
  const [httpMethod, setHttpMethod] = useState<"GET" | "POST">("GET");
  const [headersText, setHeadersText] = useState('{"User-Agent":"OpsPulse"}');
  const [isActive, setIsActive] = useState(true);

  const parsedHeaders = useMemo(() => {
    try {
      return JSON.parse(headersText || "{}");
    } catch {
      return null;
    }
  }, [headersText]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`/routines/${id}`);
      const routine: Routine = r?.routine ?? r;

      setName(routine.name ?? "");
      setEndpointUrl(routine.endpoint_url ?? "");
      setIntervalMinutes(String(routine.interval_minutes ?? 5));
      setHttpMethod((routine.http_method ?? "GET") as "GET" | "POST");
      setHeadersText(JSON.stringify(routine.headers_json ?? {}, null, 2));
      setIsActive(!!routine.is_active);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setError(null);

    // validações simples antes de chamar o backend
    if (!name.trim()) return setError("Nome é obrigatório.");
    if (!endpointUrl.trim()) return setError("Endpoint URL é obrigatório.");

    const n = Number(intervalMinutes);
    if (!Number.isFinite(n) || n < 5) return setError("Intervalo deve ser um número (mínimo 5).");

    if (parsedHeaders === null) return setError("Headers JSON inválido (verifique vírgulas/aspas).");

    setSaving(true);
    try {
      await apiFetch(`/routines/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          endpoint_url: endpointUrl.trim(),
          interval_minutes: n,
          http_method: httpMethod,
          headers_json: parsedHeaders,
          is_active: isActive,
        }),
      });

      // volta pro detalhe (pra você ver o resultado)
      nav(`/routines/${id}`, { replace: true });
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <Link to={`/routines/${id}`}>← Voltar</Link>
      </div>

      <h1>Editar rotina</h1>
      <p style={{ marginTop: 6 }}>MVP: rotina HTTP com interval_minutes (sem cron).</p>

      {error && (
        <p style={{ marginTop: 12 }}>
          <b>Erro:</b> {error}
        </p>
      )}

      {loading ? (
        <p>Carregando...</p>
      ) : (
        <div style={{ border: "1px solid #ddd", padding: 12, marginTop: 12 }}>
          <div style={{ marginBottom: 10 }}>
            <label><b>Nome</b></label>
            <input
              style={{ width: "100%" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label><b>Endpoint URL</b></label>
            <input
              style={{ width: "100%" }}
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label><b>Intervalo (min)</b></label>
              <input
                style={{ width: "100%" }}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(e.target.value)}
              />
              <small>Regra do banco: mínimo 5.</small>
            </div>

            <div style={{ flex: 1, minWidth: 240 }}>
              <label><b>Método</b></label>
              <select
                style={{ width: "100%" }}
                value={httpMethod}
                onChange={(e) => setHttpMethod(e.target.value as "GET" | "POST")}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <label><b>Headers (JSON)</b></label>
            <textarea
              style={{ width: "100%", minHeight: 140, fontFamily: "monospace" }}
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
            />
            <small>Dica: mantenha simples. O backend bloqueia Authorization/Cookie/X-API-Key.</small>
          </div>

          <div style={{ marginTop: 10 }}>
            <label>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />{" "}
              <b>Ativa</b>
            </label>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={() => nav(`/routines/${id}`)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
