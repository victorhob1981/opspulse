import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api";
import { getErrorMessage } from "../lib/error";
import { dueLabel, formatDateTime, relativeTime } from "../lib/format";
import { useAutoRefresh } from "../lib/autoRefresh";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

export default function Dashboard() {
  const nav = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [toggleOpen, setToggleOpen] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Routine | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");

      const payload = await apiFetch("/routines");
      setRoutines(payload?.routines ?? []);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
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

  function askToggle(r: Routine) {
    setToggleTarget(r);
    setToggleOpen(true);
  }

  async function confirmToggle() {
    if (!toggleTarget) return;

    const next = !toggleTarget.is_active;

    setBusyId(toggleTarget.id);
    setError(null);
    try {
      await apiFetch(`/routines/${toggleTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      });

      setToggleOpen(false);
      setToggleTarget(null);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const toggleLabel = toggleTarget?.is_active ? "Pausar" : "Ativar";
  const toggleTitle = toggleTarget?.is_active ? "Pausar rotina" : "Ativar rotina";
  const toggleDesc = toggleTarget
    ? toggleTarget.is_active
      ? `Tem certeza que deseja PAUSAR a rotina "${toggleTarget.name}"?`
      : `Tem certeza que deseja ATIVAR a rotina "${toggleTarget.name}"?`
    : "";

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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Rotinas</CardTitle>
          {loading && <Badge variant="secondary">atualizando lista…</Badge>}
        </CardHeader>

        <CardContent>
          <div className="grid gap-3">
            {routines.map((r) => (
              <Card
                key={r.id}
                className="cursor-pointer transition hover:shadow-sm"
                onClick={() => nav(`/routines/${r.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-base font-semibold">{r.name}</div>
                        <Badge variant={r.is_active ? "default" : "secondary"}>
                          {r.is_active ? "Ativa" : "Pausada"}
                        </Badge>
                      </div>

                      <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
                        <div className="truncate">
                          <span className="font-medium text-foreground">URL:</span>{" "}
                          {r.endpoint_url}
                        </div>

                        <div>
                          <span className="font-medium text-foreground">Intervalo:</span>{" "}
                          {r.interval_minutes} min
                        </div>

                        <div>
                          <span className="font-medium text-foreground">Última:</span>{" "}
                          {formatDateTime(r.last_run_at)}{" "}
                          {r.last_run_at ? (
                            <span className="text-muted-foreground">
                              ({relativeTime(r.last_run_at)})
                            </span>
                          ) : null}
                        </div>

                        <div>
                          <span className="font-medium text-foreground">Próxima:</span>{" "}
                          {formatDateTime(r.next_run_at)}{" "}
                          <span className="text-muted-foreground">
                            ({dueLabel(r.next_run_at)})
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          askToggle(r);
                        }}
                        disabled={busyId === r.id}
                      >
                        {busyId === r.id ? "..." : r.is_active ? "Pausar" : "Ativar"}
                      </Button>

                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          nav(`/routines/${r.id}`);
                        }}
                      >
                        Abrir
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {!loading && routines.length === 0 && (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                Nenhuma rotina ainda. Clique em{" "}
                <span className="font-medium text-foreground">+ Nova rotina</span>.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={toggleOpen}
        onOpenChange={(open) => {
          setToggleOpen(open);
          if (!open) setToggleTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{toggleTitle}</DialogTitle>
            <DialogDescription>{toggleDesc}</DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setToggleOpen(false);
                setToggleTarget(null);
              }}
              disabled={!!busyId}
            >
              Cancelar
            </Button>

            <Button onClick={confirmToggle} disabled={!!busyId}>
              {busyId ? "Aplicando..." : toggleLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
