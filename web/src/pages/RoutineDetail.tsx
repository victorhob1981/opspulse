import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { dueLabel, formatDateTime, formatDuration, relativeTime } from "../lib/format";

type Routine = {
  id: string;
  name: string;
  endpoint_url: string;
  interval_minutes: number;
  next_run_at: string;
  last_run_at: string | null;
  is_active: boolean;
};

type Run = {
  id: string;
  triggered_by: string;
  status: string;
  http_status: number | null;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
};

function Pill({ text, tone }: { text: string; tone?: "good" | "bad" | "neutral" }) {
  const style: React.CSSProperties = {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #ddd",
    whiteSpace: "nowrap",
  };

  if (tone === "good") style.background = "#eaffea";
  if (tone === "bad") style.background = "#ffecec";
  if (tone === "neutral") style.background = "#f6f6f6";

  return <span style={style}>{text}</span>;
}

function runTone(status: string) {
  if (status === "SUCCESS") return "good";
  if (status === "FAIL") return "bad";
  return "neutral";
}

export default function RoutineDetail() {
  const { id } = useParams();
  const nav = useNavigate();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`/routines/${id}`);
      setRoutine(r?.routine ?? r);

      const rr = await apiFetch(`/routines/${id}/runs`);
      setRuns(rr?.runs ?? []);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setError(null);
    try {
      await apiFetch(`/routines/${id}/run`, { method: "POST" });
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  async function toggleActive() {
    if (!routine) return;

    const next = !routine.is_active;
    const label = next ? "ATIVAR" : "PAUSAR";

    const ok = window.confirm(`Confirmar ${label} a rotina "${routine.name}"?`);
    if (!ok) return;

    setToggling(true);
    setError(null);
    try {
      await apiFetch(`/routines/${routine.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      });
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setToggling(false);
    }
  }

  async function deleteRoutine() {
    if (!routine) return;

    const ok = window.confirm(
      `Excluir a rotina "${routine.name}"?\n\nIsso NÃO pode ser desfeito.`
    );
    if (!ok) return;

    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/routines/${routine.id}`, { method: "DELETE" });
      nav("/", { replace: true });
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/">← Voltar</Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Detalhe da rotina</h1>
        {loading ? <Pill text="carregando..." tone="neutral" /> : null}
      </div>

      {error && (
        <p style={{ marginTop: 12 }}>
          <b>Erro:</b> {error}
        </p>
      )}

      {!routine ? (
        <p>Carregando...</p>
      ) : (
        <>
          <div style={{ border: "1px solid #ddd", padding: 12, marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <b>{routine.name}</b>
              <Pill text={routine.is_active ? "Ativa" : "Pausada"} tone="neutral" />
            </div>

            <div style={{ fontSize: 14, marginTop: 10, display: "grid", gap: 4 }}>
              <div><b>URL:</b> {routine.endpoint_url}</div>
              <div><b>Intervalo:</b> {routine.interval_minutes} min</div>

              <div>
                <b>Última:</b> {formatDateTime(routine.last_run_at)}{" "}
                {routine.last_run_at ? <span>({relativeTime(routine.last_run_at)})</span> : null}
              </div>

              <div>
                <b>Próxima:</b> {formatDateTime(routine.next_run_at)}{" "}
                <span>({dueLabel(routine.next_run_at)})</span>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={load} disabled={loading}>
                {loading ? "Carregando..." : "Recarregar"}
              </button>

              <button onClick={runNow} disabled={running}>
                {running ? "Rodando..." : "Rodar agora"}
              </button>

              <button onClick={() => nav(`/routines/${routine.id}/edit`)}>
                Editar
              </button>

              <button onClick={toggleActive} disabled={toggling}>
                {toggling ? "Aplicando..." : routine.is_active ? "Pausar" : "Ativar"}
              </button>

              <button onClick={deleteRoutine} disabled={deleting}>
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>

          <h2 style={{ marginTop: 24 }}>Histórico (runs)</h2>

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {runs.map((run) => (
              <div key={run.id} style={{ border: "1px solid #eee", padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Pill text={`${run.status}`} tone={runTone(run.status) as any} />
                    <Pill text={`${run.triggered_by}`} tone="neutral" />
                    {run.http_status ? <Pill text={`HTTP ${run.http_status}`} tone="neutral" /> : null}
                  </div>

                  <span style={{ fontSize: 12, opacity: 0.75 }}>
                    {formatDateTime(run.created_at)} ({relativeTime(run.created_at)})
                  </span>
                </div>

                <div style={{ fontSize: 14, marginTop: 8, display: "grid", gap: 4 }}>
                  <div><b>Duração:</b> {formatDuration(run.duration_ms)}</div>
                  <div><b>Início:</b> {formatDateTime(run.started_at)}</div>
                  <div><b>Fim:</b> {formatDateTime(run.finished_at)}</div>
                  {run.error_message && (
                    <div><b>Erro:</b> {run.error_message}</div>
                  )}
                </div>
              </div>
            ))}

            {!loading && runs.length === 0 && <p>Nenhum run ainda.</p>}
          </div>
        </>
      )}
    </div>
  );
}
