import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api";
import { dueLabel, formatDateTime, relativeTime } from "../lib/format";

type Routine = {
  id: string;
  name: string;
  endpoint_url: string;
  interval_minutes: number;
  next_run_at: string;
  last_run_at: string | null;
  is_active: boolean;
};

function Pill({ text }: { text: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "4px 8px",
        borderRadius: 999,
        border: "1px solid #ddd",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");

      const payload = await apiFetch("/routines");
      setRoutines(payload?.routines ?? []);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function toggleFromCard(r: Routine) {
    const next = !r.is_active;
    const label = next ? "ATIVAR" : "PAUSAR";

    const ok = window.confirm(`Confirmar ${label} a rotina "${r.name}"?`);
    if (!ok) return;

    setBusyId(r.id);
    setError(null);
    try {
      await apiFetch(`/routines/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      });
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>OpsPulse</h1>
        <div>
          <span style={{ marginRight: 12 }}>{email}</span>
          <button onClick={logout}>Sair</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
        <button onClick={load} disabled={loading}>
          {loading ? "Carregando..." : "Recarregar"}
        </button>
        <button onClick={() => nav("/routines/new")}>+ Nova rotina</button>
        {loading && <Pill text="atualizando lista..." />}
      </div>

      <h2 style={{ marginTop: 18 }}>Rotinas</h2>

      {error && (
        <p style={{ marginTop: 12 }}>
          <b>Erro:</b> {error}
        </p>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {routines.map((r) => (
          <div
            key={r.id}
            onClick={() => nav(`/routines/${r.id}`)}
            style={{
              border: "1px solid #ddd",
              padding: 12,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <b>{r.name}</b>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Pill text={r.is_active ? "Ativa" : "Pausada"} />

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFromCard(r);
                  }}
                  disabled={busyId === r.id}
                >
                  {busyId === r.id ? "..." : r.is_active ? "Pausar" : "Ativar"}
                </button>
              </div>
            </div>

            <div style={{ fontSize: 14, marginTop: 6, display: "grid", gap: 4 }}>
              <div><b>URL:</b> {r.endpoint_url}</div>
              <div><b>Intervalo:</b> {r.interval_minutes} min</div>

              <div>
                <b>Última:</b> {formatDateTime(r.last_run_at)}{" "}
                {r.last_run_at ? <span>({relativeTime(r.last_run_at)})</span> : null}
              </div>

              <div>
                <b>Próxima:</b> {formatDateTime(r.next_run_at)}{" "}
                <span>({dueLabel(r.next_run_at)})</span>
              </div>
            </div>
          </div>
        ))}

        {!loading && routines.length === 0 && (
          <p>Nenhuma rotina ainda. Clique em <b>+ Nova rotina</b>.</p>
        )}
      </div>
    </div>
  );
}
