import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { getErrorMessage } from "../lib/error";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function isValidUrl(url: string) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

type HttpMethod = "GET" | "POST";

export default function CreateRoutine() {
  const nav = useNavigate();

  const [name, setName] = useState("Nova rotina");
  const [endpointUrl, setEndpointUrl] = useState("https://httpbin.org/status/200");
  const [intervalMinutes, setIntervalMinutes] = useState<number>(5);
  const [httpMethod, setHttpMethod] = useState<HttpMethod>("GET");
  const [isActive, setIsActive] = useState(true);
  const [headersText, setHeadersText] = useState('{"User-Agent":"OpsPulse"}');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const intervalOk = useMemo(() => Number.isFinite(intervalMinutes) && intervalMinutes >= 5, [intervalMinutes]);
  const urlOk = useMemo(() => {
    const u = endpointUrl.trim();
    return !!u && isValidUrl(u);
  }, [endpointUrl]);

  function parseHeadersOrError(): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
    let headersJson: Record<string, string> = {};
    const ht = headersText.trim();

    if (!ht) return { ok: true, value: headersJson };

    try {
      const parsed = JSON.parse(ht);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { ok: false, error: 'headers_json precisa ser um JSON objeto. Ex: {"User-Agent":"OpsPulse"}' };
      }

      headersJson = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
      return { ok: true, value: headersJson };
    } catch {
      return { ok: false, error: 'headers_json inválido. Use um JSON objeto. Ex: {"User-Agent":"OpsPulse"}' };
    }
  }

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

    const headersParsed = parseHeadersOrError();
    if (!headersParsed.ok) {
      setMsg(headersParsed.error);
      return;
    }

    // Observação: o backend já bloqueia Authorization/Cookie/X-API-Key.
    const payload = {
      name: trimmedName,
      kind: "HTTP_CHECK",
      interval_minutes: intervalMinutes,
      endpoint_url: trimmedUrl,
      http_method: httpMethod,
      headers_json: headersParsed.value,
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
      if (id) nav(`/routines/${id}`, { replace: true });
      else nav("/", { replace: true });
    } catch (e: unknown) {
      setMsg(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Criar rotina</h1>
          <p className="text-sm text-muted-foreground">
            MVP: Rotina HTTP com <span className="font-medium">interval_minutes</span> (sem cron).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => nav(-1)}>
            ← Voltar
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogTrigger>
            <DialogContent>
              <UiDialogHeader>
                <UiDialogTitle>Cancelar criação?</UiDialogTitle>
                <DialogDescription>
                  Você vai perder as alterações deste formulário.
                </DialogDescription>
              </UiDialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => { /* fecha pelo overlay */ }}>
                  Continuar editando
                </Button>
                <Button
                  onClick={() => nav("/", { replace: true })}
                >
                  Sair sem salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button onClick={() => (document.getElementById("create-routine-submit") as HTMLButtonElement | null)?.click()} disabled={saving}>
            {saving ? "Salvando..." : "Criar"}
          </Button>
        </div>
      </div>

      {/* Mensagens */}
      {msg && (
        <Card className={msg.toLowerCase().includes("criada") ? "border-emerald-200" : "border-destructive/40"}>
          <CardHeader>
            <CardTitle className="text-base">{msg.toLowerCase().includes("criada") ? "Sucesso" : "Erro"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <span className="font-medium">Detalhe:</span> {msg}
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Detalhes</CardTitle>
          <div className="flex items-center gap-2">
            {!urlOk && <Badge variant="secondary">URL inválida</Badge>}
            {!intervalOk && <Badge variant="secondary">Intervalo &lt; 5</Badge>}
            {saving && <Badge variant="secondary">salvando…</Badge>}
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-5">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nome</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Healthcheck do site" />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Endpoint URL</label>
              <Input
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">
                Dica: use endpoints de teste como <span className="font-medium">httpbin</span> pra validar.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Intervalo (min)</label>
                <Input
                  type="number"
                  min={5}
                  value={Number.isFinite(intervalMinutes) ? String(intervalMinutes) : ""}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">Regra do banco: mínimo 5.</p>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Método</label>
                <Select value={httpMethod} onValueChange={(v) => setHttpMethod(v as HttpMethod)}>
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
              <label className="text-sm font-medium">Headers (JSON)</label>
              <Textarea
                rows={6}
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                placeholder='{"User-Agent":"OpsPulse"}'
              />
              <p className="text-xs text-muted-foreground">
                Mantenha simples. O backend bloqueia <span className="font-medium">Authorization</span>,{" "}
                <span className="font-medium">Cookie</span> e <span className="font-medium">X-API-Key</span>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(Boolean(v))} />
              <span className="text-sm font-medium">Ativa</span>
            </div>

            {/* Botões do form (mantém submit real) */}
            <div className="flex flex-wrap items-center gap-2">
              <Button id="create-routine-submit" type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Criar"}
              </Button>
              <Button type="button" variant="outline" onClick={() => nav(-1)}>
                Voltar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
