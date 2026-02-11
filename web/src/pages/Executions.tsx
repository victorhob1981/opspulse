import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { dueLabel, formatDateTime, formatDuration, relativeTime } from "../lib/format";
import { useAutoRefresh } from "../lib/autoRefresh";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  routine_id: string;
  triggered_by: string;
  status: string;
  http_status: number | null;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
};

function statusBadgeVariant(status: string): "default" | "destructive" | "secondary" {
  if (status === "SUCCESS") return "default";
  if (status === "FAIL") return "destructive";
  return "secondary";
}

export default function Executions() {
  const nav = useNavigate();

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | "ALL">("ALL");
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch("/routines");
      const list: Routine[] = payload?.routines ?? [];
      setRoutines(list);

      if (selectedRoutineId === "ALL") {
        const limited = list.slice(0, 20);
        const allRuns = await Promise.all(
          limited.map(async (r) => {
            const rr = await apiFetch(`/routines/${r.id}/runs?limit=20`);
            const items: Run[] = rr?.runs ?? [];
            return items.map((x) => ({ ...x, routine_id: r.id }));
          })
        );

        const flat = allRuns.flat();
        flat.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRuns(flat);
      } else {
        const rr = await apiFetch(`/routines/${selectedRoutineId}/runs?limit=50`);
        setRuns(rr?.runs ?? []);
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedRoutineId]);

  useAutoRefresh(load, {
    enabled: true,
    intervalMs: 15000,
    refreshOnFocus: true,
    refreshOnVisible: true,
    runOnMount: true,
  });

  const routineById = useMemo(() => {
    const m = new Map<string, Routine>();
    for (const r of routines) m.set(r.id, r);
    return m;
  }, [routines]);

  const headerLabel = useMemo(() => {
    if (selectedRoutineId === "ALL") return "Execuções (todas)";
    const r = routineById.get(selectedRoutineId);
    return r ? `Execuções (${r.name})` : "Execuções";
  }, [selectedRoutineId, routineById]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Execuções</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe os runs recentes e filtre por rotina.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Atualizando..." : "Recarregar"}
          </Button>
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{headerLabel}</CardTitle>

          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={selectedRoutineId}
              onChange={(e) =>
                setSelectedRoutineId((e.target.value as any) === "ALL" ? "ALL" : e.target.value)
              }
            >
              <option value="ALL">Todas</option>
              {routines.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            {loading && <Badge variant="secondary">atualizando…</Badge>}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Rotina</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>

              <TableBody>
                {runs.map((run) => {
                  const routine =
                    selectedRoutineId === "ALL"
                      ? routineById.get(run.routine_id)
                      : routineById.get(selectedRoutineId as string);
                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                      </TableCell>

                      <TableCell className="max-w-[260px]">
                        <div className="truncate font-medium">{routine?.name ?? run.routine_id}</div>
                        {routine?.next_run_at ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Próxima: {formatDateTime(routine.next_run_at)} ({dueLabel(routine.next_run_at)})
                          </div>
                        ) : null}
                      </TableCell>

                      <TableCell>
                        <Badge variant="secondary">{run.triggered_by}</Badge>
                      </TableCell>

                      <TableCell className="font-mono text-xs">
                        {run.http_status ? `HTTP ${run.http_status}` : "—"}
                      </TableCell>

                      <TableCell>{formatDuration(run.duration_ms)}</TableCell>

                      <TableCell className="text-muted-foreground">
                        {formatDateTime(run.created_at)} <span>({relativeTime(run.created_at)})</span>
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => nav(`/routines/${routine?.id ?? run.routine_id}`)}
                        >
                          Abrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!loading && runs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-muted-foreground">
                      Nenhuma execução encontrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {selectedRoutineId === "ALL" && routines.length > 20 && (
            <div className="text-xs text-muted-foreground">
              Mostrando execuções das primeiras 20 rotinas (para reduzir carga). Selecione uma rotina
              para ver mais detalhes.
            </div>
          )}

          {selectedRoutineId !== "ALL" && (
            <div className="flex items-center justify-between rounded-md border p-4 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {routineById.get(selectedRoutineId as string)?.name ?? selectedRoutineId}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  URL: {routineById.get(selectedRoutineId as string)?.endpoint_url ?? "—"} • Intervalo:{" "}
                  {routineById.get(selectedRoutineId as string)?.interval_minutes ?? "—"} min
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => nav(`/routines/${selectedRoutineId}`)}
              >
                Abrir rotina
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
