import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api";
import { dueLabel, formatDateTime, relativeTime } from "../lib/format";
import { useAutoRefresh } from "../lib/autoRefresh";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Routine = {
  id: string;
  name: string;
  endpoint_url: string;
  interval_minutes: number;
  next_run_at: string;
  last_run_at: string | null;
  is_active: boolean;
};

export default function DashboardHome() {
  const nav = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
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
  }, []);

  useAutoRefresh(load, {
    enabled: true,
    intervalMs: 15000,
    refreshOnFocus: true,
    refreshOnVisible: true,
    runOnMount: true,
  });

  const stats = useMemo(() => {
    const total = routines.length;
    const active = routines.filter((r) => r.is_active).length;
    const paused = total - active;
    return { total, active, paused };
  }, [routines]);

  const nextUp = useMemo(() => {
    return [...routines]
      .sort((a, b) => (a.next_run_at || "").localeCompare(b.next_run_at || ""))
      .slice(0, 5);
  }, [routines]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Você está logado como <span className="font-medium">{email || "—"}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Atualizando..." : "Recarregar"}
          </Button>
          <Button onClick={() => nav("/routines/new")}>+ Nova rotina</Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Erro</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <span className="font-medium">Detalhe:</span> {error}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total de rotinas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.total}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ativas</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <div className="text-2xl font-semibold">{stats.active}</div>
            <Badge>rodando</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pausadas</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <div className="text-2xl font-semibold">{stats.paused}</div>
            <Badge variant="secondary">paradas</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Próximas rotinas</CardTitle>
          <Button variant="outline" onClick={() => nav("/routines")}>
            Ver todas
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {nextUp.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-4 rounded-md border p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate font-medium">{r.name}</div>
                  <Badge variant={r.is_active ? "default" : "secondary"}>
                    {r.is_active ? "Ativa" : "Pausada"}
                  </Badge>
                </div>

                <div className="mt-2 text-sm text-muted-foreground">
                  <div className="truncate">
                    <span className="font-medium text-foreground">URL:</span> {r.endpoint_url}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Próxima:</span>{" "}
                    {formatDateTime(r.next_run_at)} <span>({dueLabel(r.next_run_at)})</span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Última:</span>{" "}
                    {formatDateTime(r.last_run_at)}{" "}
                    {r.last_run_at ? <span>({relativeTime(r.last_run_at)})</span> : null}
                  </div>
                </div>
              </div>

              <Button onClick={() => nav(`/routines/${r.id}`)}>Abrir</Button>
            </div>
          ))}

          {!loading && routines.length === 0 && (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              Nenhuma rotina criada ainda. Clique em{" "}
              <span className="font-medium text-foreground">+ Nova rotina</span>.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
