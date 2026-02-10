// src/pages/Executions.tsx
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatDateTime, formatDuration, relativeTime } from "../lib/format";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Routine = { id: string; name: string };

type Run = {
  id: string;
  routine_id?: string;
  routine_name?: string;
  triggered_by: string;
  status: string;
  http_status: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
};

function statusVariant(status: string): "default" | "destructive" | "secondary" {
  if (status === "SUCCESS") return "default";
  if (status === "FAIL") return "destructive";
  return "secondary";
}

export default function Executions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const rr = await apiFetch("/routines");
      const routines: Routine[] = rr?.routines ?? [];

      // puxa runs de cada rotina e “achata”
      const perRoutine = await Promise.all(
        routines.map(async (r) => {
          const res = await apiFetch(`/routines/${r.id}/runs`);
          const list: Run[] = res?.runs ?? [];
          return list.map((x) => ({
            ...x,
            routine_id: r.id,
            routine_name: r.name,
          }));
        })
      );

      const all = perRoutine.flat();

      // ordena por created_at desc e limita
      all.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setRuns(all.slice(0, 100));
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const countFail = useMemo(() => runs.filter((r) => r.status === "FAIL").length, [runs]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Execuções</h1>
          <p className="text-sm text-muted-foreground">
            Últimas execuções consolidadas (até 100).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Atualizando..." : "Recarregar"}
          </Button>
          {runs.length ? <Badge variant="secondary">{runs.length} registros</Badge> : null}
          {countFail ? <Badge variant="destructive">{countFail} falhas</Badge> : null}
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
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rotina</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {runs.map((r) => (
                  <TableRow key={`${r.routine_id ?? "x"}-${r.id}`}>
                    <TableCell className="max-w-[220px] truncate">
                      {r.routine_name ?? "—"}
                    </TableCell>

                    <TableCell>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </TableCell>

                    <TableCell className="font-mono text-xs">
                      {r.http_status ? `HTTP ${r.http_status}` : "—"}
                    </TableCell>

                    <TableCell>{formatDuration(r.duration_ms)}</TableCell>

                    <TableCell>
                      <Badge variant="secondary">{r.triggered_by}</Badge>
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {formatDateTime(r.created_at)} ({relativeTime(r.created_at)})
                    </TableCell>
                  </TableRow>
                ))}

                {!loading && runs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      Nenhuma execução ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
