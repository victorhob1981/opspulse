import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { dueLabel, formatDateTime, formatDuration, relativeTime } from "../lib/format";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

function statusBadgeVariant(status: string): "default" | "destructive" | "secondary" {
  if (status === "SUCCESS") return "default";
  if (status === "FAIL") return "destructive";
  return "secondary";
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

  // Dialog states
  const [openToggle, setOpenToggle] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);

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

  async function toggleActiveConfirmed() {
    if (!routine) return;

    const next = !routine.is_active;

    setToggling(true);
    setError(null);
    try {
      await apiFetch(`/routines/${routine.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      });
      setOpenToggle(false);
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setToggling(false);
    }
  }

  async function deleteRoutineConfirmed() {
    if (!routine) return;

    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/routines/${routine.id}`, { method: "DELETE" });
      setOpenDelete(false);
      nav("/", { replace: true });
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ====== STATS / OVERVIEW ======
  const stats = useMemo(() => {
    const sorted = [...runs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const total = sorted.length;
    const successes = sorted.filter((r) => r.status === "SUCCESS").length;
    const fails = sorted.filter((r) => r.status === "FAIL").length;

    const successRate = total ? Math.round((successes / total) * 100) : 0;

    const lastRun = sorted[0] ?? null;
    const lastFailure = sorted.find((r) => r.status === "FAIL") ?? null;

    const durations = sorted
      .map((r) => r.duration_ms)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    const avgDuration =
      durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

    const maxDuration =
      durations.length ? Math.max(...durations) : null;

    const now = Date.now();
    const since24h = now - 24 * 60 * 60 * 1000;

    const runs24h = sorted.filter((r) => new Date(r.created_at).getTime() >= since24h);
    const total24h = runs24h.length;
    const success24h = runs24h.filter((r) => r.status === "SUCCESS").length;
    const successRate24h = total24h ? Math.round((success24h / total24h) * 100) : 0;

    const manualCount = sorted.filter((r) => r.triggered_by === "MANUAL").length;
    const scheduleCount = sorted.filter((r) => r.triggered_by === "SCHEDULE").length;

    // streak: quantos SUCCESS seguidos (a partir do mais recente)
    let successStreak = 0;
    for (const r of sorted) {
      if (r.status === "SUCCESS") successStreak++;
      else break;
    }

    return {
      total,
      successes,
      fails,
      successRate,
      lastRun,
      lastFailure,
      avgDuration,
      maxDuration,
      total24h,
      successRate24h,
      manualCount,
      scheduleCount,
      successStreak,
    };
  }, [runs]);

  const toggleLabel = routine?.is_active ? "Pausar" : "Ativar";
  const toggleTitle = routine?.is_active ? "Pausar rotina" : "Ativar rotina";
  const toggleDesc = routine
    ? routine.is_active
      ? `Tem certeza que deseja PAUSAR a rotina "${routine.name}"?`
      : `Tem certeza que deseja ATIVAR a rotina "${routine.name}"?`
    : "";

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Detalhe da rotina</h1>

          {routine ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{routine.id}</Badge>
              <Badge variant={routine.is_active ? "default" : "secondary"}>
                {routine.is_active ? "Ativa" : "Pausada"}
              </Badge>
              {loading ? <Badge variant="secondary">carregando…</Badge> : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Carregando..." : "Recarregar"}
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

      {!routine ? (
        <Card>
          <CardHeader>
            <CardTitle>Carregando...</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Buscando os detalhes da rotina.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Top card com infos + ações */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="truncate">{routine.name}</CardTitle>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {routine.endpoint_url}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button onClick={runNow} disabled={running}>
                  {running ? "Rodando..." : "Rodar agora"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => nav(`/routines/${routine.id}/edit`)}
                >
                  Editar
                </Button>

                <Button variant="outline" onClick={() => setOpenToggle(true)} disabled={toggling}>
                  {toggling ? "Aplicando..." : toggleLabel}
                </Button>

                <Button variant="destructive" onClick={() => setOpenDelete(true)} disabled={deleting}>
                  {deleting ? "Excluindo..." : "Excluir"}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="grid gap-2 text-sm">
              <div>
                <span className="font-medium">Intervalo:</span>{" "}
                {routine.interval_minutes} min
              </div>

              <div>
                <span className="font-medium">Última:</span>{" "}
                {formatDateTime(routine.last_run_at)}{" "}
                {routine.last_run_at ? (
                  <span className="text-muted-foreground">
                    ({relativeTime(routine.last_run_at)})
                  </span>
                ) : null}
              </div>

              <div>
                <span className="font-medium">Próxima:</span>{" "}
                {formatDateTime(routine.next_run_at)}{" "}
                <span className="text-muted-foreground">
                  ({dueLabel(routine.next_run_at)})
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="runs">
            <TabsList>
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="runs">Execuções</TabsTrigger>
              <TabsTrigger value="config">Config</TabsTrigger>
            </TabsList>

            {/* ====== OVERVIEW ====== */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-sm font-medium">Taxa de sucesso</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">
                    {stats.total ? `${stats.successRate}%` : "—"}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {stats.successes}/{stats.total} execuções
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-sm font-medium">Última execução</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {stats.lastRun ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusBadgeVariant(stats.lastRun.status)}>
                            {stats.lastRun.status}
                          </Badge>
                          <Badge variant="secondary">{stats.lastRun.triggered_by}</Badge>
                          {stats.lastRun.http_status ? (
                            <Badge variant="outline">HTTP {stats.lastRun.http_status}</Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(stats.lastRun.created_at)} ({relativeTime(stats.lastRun.created_at)})
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">Sem execuções ainda.</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-sm font-medium">Última falha</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {stats.lastFailure ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="destructive">FAIL</Badge>
                          {stats.lastFailure.http_status ? (
                            <Badge variant="outline">HTTP {stats.lastFailure.http_status}</Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(stats.lastFailure.created_at)} ({relativeTime(stats.lastFailure.created_at)})
                        </div>
                        {stats.lastFailure.error_message ? (
                          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                            {stats.lastFailure.error_message}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">Nenhuma falha registrada 🎉</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-sm font-medium">Performance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="text-sm">
                      <span className="font-medium">Média:</span>{" "}
                      {stats.avgDuration != null ? formatDuration(stats.avgDuration) : "—"}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Pior:</span>{" "}
                      {stats.maxDuration != null ? formatDuration(stats.maxDuration) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Streak: {stats.successStreak} sucesso(s) seguidos
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Últimas 24h</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                  <div>
                    <span className="font-medium text-foreground">Execuções:</span> {stats.total24h}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Sucesso:</span>{" "}
                    {stats.total24h ? `${stats.successRate24h}%` : "—"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Triggers:</span>{" "}
                    {stats.scheduleCount} schedule • {stats.manualCount} manual
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Próxima execução</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {routine ? (
                    <>
                      <div>
                        <span className="font-medium text-foreground">Quando:</span>{" "}
                        {formatDateTime(routine.next_run_at)} ({dueLabel(routine.next_run_at)})
                      </div>
                      <div className="mt-1">
                        <span className="font-medium text-foreground">Intervalo:</span>{" "}
                        {routine.interval_minutes} min •{" "}
                        <span className="font-medium text-foreground">Ativa:</span>{" "}
                        {routine.is_active ? "sim" : "não"}
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ====== RUNS ====== */}
            <TabsContent value="runs" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Histórico (runs)</CardTitle>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={load} disabled={loading}>
                      {loading ? "Atualizando..." : "Atualizar"}
                    </Button>
                    {runs.length ? (
                      <Badge variant="secondary">{runs.length} registros</Badge>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Trigger</TableHead>
                          <TableHead>HTTP</TableHead>
                          <TableHead>Duração</TableHead>
                          <TableHead>Quando</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {runs.map((run) => (
                          <TableRow key={run.id}>
                            <TableCell>
                              <Badge variant={statusBadgeVariant(run.status)}>
                                {run.status}
                              </Badge>
                            </TableCell>

                            <TableCell>
                              <Badge variant="secondary">{run.triggered_by}</Badge>
                            </TableCell>

                            <TableCell className="font-mono text-xs">
                              {run.http_status ? `HTTP ${run.http_status}` : "—"}
                            </TableCell>

                            <TableCell>{formatDuration(run.duration_ms)}</TableCell>

                            <TableCell className="text-muted-foreground">
                              {formatDateTime(run.created_at)}{" "}
                              <span>({relativeTime(run.created_at)})</span>
                            </TableCell>
                          </TableRow>
                        ))}

                        {!loading && runs.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-sm text-muted-foreground">
                              Nenhum run ainda.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="text-sm font-medium">Detalhes</div>

                    <div className="grid gap-3">
                      {runs.slice(0, 10).map((run) => (
                        <Card key={run.id} className="border-muted">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                                <Badge variant="secondary">{run.triggered_by}</Badge>
                                {run.http_status ? (
                                  <Badge variant="outline">HTTP {run.http_status}</Badge>
                                ) : null}
                                <Badge variant="outline">{formatDuration(run.duration_ms)}</Badge>
                              </div>

                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(run.created_at)} ({relativeTime(run.created_at)})
                              </div>
                            </div>

                            <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                              <div>
                                <span className="font-medium text-foreground">Início:</span>{" "}
                                {formatDateTime(run.started_at)}
                              </div>
                              <div>
                                <span className="font-medium text-foreground">Fim:</span>{" "}
                                {formatDateTime(run.finished_at)}
                              </div>

                              {run.error_message ? (
                                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-foreground">
                                  <div className="font-medium">Erro</div>
                                  <div className="mt-1 text-sm">{run.error_message}</div>
                                </div>
                              ) : null}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ====== CONFIG ====== */}
            <TabsContent value="config" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Configuração</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">URL:</span>{" "}
                    {routine.endpoint_url}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Intervalo:</span>{" "}
                    {routine.interval_minutes} min
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Ativa:</span>{" "}
                    {routine.is_active ? "sim" : "não"}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Dialog: Toggle */}
          <Dialog open={openToggle} onOpenChange={setOpenToggle}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{toggleTitle}</DialogTitle>
                <DialogDescription>{toggleDesc}</DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenToggle(false)} disabled={toggling}>
                  Cancelar
                </Button>
                <Button onClick={toggleActiveConfirmed} disabled={toggling}>
                  {toggling ? "Aplicando..." : toggleLabel}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog: Delete */}
          <Dialog open={openDelete} onOpenChange={setOpenDelete}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Excluir rotina</DialogTitle>
                <DialogDescription>
                  Tem certeza que deseja excluir a rotina "{routine.name}"?
                  <br />
                  <b>Isso NÃO pode ser desfeito.</b>
                </DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenDelete(false)} disabled={deleting}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={deleteRoutineConfirmed} disabled={deleting}>
                  {deleting ? "Excluindo..." : "Excluir"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
