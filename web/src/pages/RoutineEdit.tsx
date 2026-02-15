import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { getErrorMessage } from "../lib/error";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  http_method: "GET" | "POST";
  headers_json: Record<string, unknown>;
  is_active: boolean;
};

function isValidUrl(url: string) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

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

  const [initialSnapshot, setInitialSnapshot] = useState<string>("");
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const parsedHeaders = useMemo(() => {
    try {
      const raw = headersText?.trim() || "{}";
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
      // força valores string (mais seguro pro backend)
      return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
    } catch {
      return null;
    }
  }, [headersText]);

  const dirty = useMemo(() => {
    const current = JSON.stringify(
      {
        name: name.trim(),
        endpoint_url: endpointUrl.trim(),
        interval_minutes: intervalMinutes.trim(),
        http_method: httpMethod,
        headers_text: headersText,
        is_active: isActive,
      },
      null,
      0
    );
    return initialSnapshot !== "" && current !== initialSnapshot;
  }, [name, endpointUrl, intervalMinutes, httpMethod, headersText, isActive, initialSnapshot]);

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

      const snap = JSON.stringify(
        {
          name: (routine.name ?? "").trim(),
          endpoint_url: (routine.endpoint_url ?? "").trim(),
          interval_minutes: String(routine.interval_minutes ?? 5).trim(),
          http_method: (routine.http_method ?? "GET") as "GET" | "POST",
          headers_text: JSON.stringify(routine.headers_json ?? {}, null, 2),
          is_active: !!routine.is_active,
        },
        null,
        0
      );
      setInitialSnapshot(snap);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setError(null);

    const trimmedName = name.trim();
    const trimmedUrl = endpointUrl.trim();

    if (!trimmedName) return setError("Nome é obrigatório.");
    if (!trimmedUrl) return setError("Endpoint URL é obrigatório.");
    if (!isValidUrl(trimmedUrl)) return setError("Informe uma URL válida.");

    const n = Number(intervalMinutes);
    if (!Number.isFinite(n) || n < 5) return setError("Intervalo deve ser um número (mínimo 5).");

    if (parsedHeaders === null) return setError("Headers JSON inválido (verifique vírgulas/aspas).");

    setSaving(true);
    try {
      await apiFetch(`/routines/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: trimmedName,
          endpoint_url: trimmedUrl,
          interval_minutes: n,
          http_method: httpMethod,
          headers_json: parsedHeaders,
          is_active: isActive,
        }),
      });

      nav(`/routines/${id}`, { replace: true });
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    if (dirty) setConfirmCancelOpen(true);
    else nav(`/routines/${id}`);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2">
            <Link
              to={`/routines/${id}`}
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              ← Voltar
            </Link>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Editar rotina</h1>
          <p className="text-sm text-muted-foreground">
            MVP: rotina HTTP com <span className="font-medium">interval_minutes</span> (sem cron).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dirty && <Badge variant="secondary">alterações não salvas</Badge>}
          <Button variant="outline" onClick={load} disabled={loading || saving}>
            {loading ? "Carregando..." : "Recarregar"}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurações</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Endpoint URL</label>
            <Input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Dica: use uma URL completa (com https://).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Intervalo (min)</label>
              <Input
                inputMode="numeric"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(e.target.value)}
                placeholder="5"
              />
              <p className="text-xs text-muted-foreground">Regra do banco: mínimo 5.</p>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Método</label>
              <Select value={httpMethod} onValueChange={(v) => setHttpMethod(v as "GET" | "POST")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium">Headers (JSON)</label>
              {parsedHeaders === null ? (
                <Badge variant="destructive">JSON inválido</Badge>
              ) : (
                <Badge variant="secondary">ok</Badge>
              )}
            </div>

            <Textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              className="min-h-[160px] font-mono text-xs"
            />

            <p className="text-xs text-muted-foreground">
              Dica: mantenha simples. O backend bloqueia Authorization/Cookie/X-API-Key.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Ativa</div>
              <div className="text-xs text-muted-foreground">
                Se desativar, o scheduler ignora essa rotina.
              </div>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving || loading}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar alterações?</DialogTitle>
            <DialogDescription>
              Você tem mudanças não salvas. Se sair agora, você vai perder essas alterações.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmCancelOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmCancelOpen(false);
                nav(`/routines/${id}`);
              }}
            >
              Descartar e sair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
