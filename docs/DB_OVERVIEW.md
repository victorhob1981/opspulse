# DB Overview — OpsPulse (Supabase / Postgres)

Este documento descreve o schema **public** do OpsPulse, os principais *checks/constraints*, os índices e como isso sustenta o scheduler (Timer) e os endpoints da API.

> Objetivo: garantir que qualquer pessoa consiga entender **como o banco funciona**, **por que foi desenhado assim** e **onde estão os pontos de atenção**.

---

## Visão geral (entidades)

O banco tem 3 tabelas principais:

1) **workspaces**
- Representa o “espaço” de trabalho do usuário (multi-tenant).
- Um workspace pertence a um usuário do Supabase Auth.

2) **routines**
- Representa a rotina agendada (job).
- Define o intervalo, o próximo horário de execução e dados do HTTP check/webhook.

3) **routine_runs**
- Representa cada execução (manual ou automática) e seu resultado.
- É o histórico que o front vai mostrar.

---

## Tabela: `public.workspaces`

### Campos principais
- `id` (uuid, PK) — identificador do workspace.
- `owner_id` (uuid, FK -> `auth.users(id)`) — dono do workspace (Supabase Auth).
- `name` (text) — nome do workspace.
- `created_at` (timestamptz) — quando foi criado.

### Por que existe
- Permite multi-tenant “de verdade”: as rotinas sempre ficam vinculadas a um workspace.
- Facilita evoluir para RLS depois, sem refatoração pesada.

### Índices
- `workspaces_pkey (id)` — padrão.

---

## Tabela: `public.routines`

### Campos principais
- `id` (uuid, PK)
- `workspace_id` (uuid, FK -> `public.workspaces(id)`)
- `name` (text) — nome da rotina.
- `kind` (text CHECK) — tipo: `HTTP_CHECK` ou `WEBHOOK_CALL`
- `interval_minutes` (int CHECK) — **>= 5**
- `next_run_at` (timestamptz) — quando deve rodar de novo.
- `last_run_at` (timestamptz) — quando rodou por último (pode ser null).
- `is_active` (bool) — habilita/desabilita rotina.
- `endpoint_url` (text)
- `http_method` (text CHECK) — `GET` ou `POST`
- `headers_json` (jsonb default `{}`)
- `auth_mode` (text CHECK) — `NONE` ou `SECRET_REF`
- `secret_ref` (text, nullable) — referência do segredo (ex.: `GITHUB_TOKEN`)
- **Locks do scheduler**
  - `lock_until` (timestamptz, nullable)
  - `locked_by` (text, nullable)
- `created_at`, `updated_at` (timestamptz)

### Por que existe `interval_minutes >= 5`
- Mantém o MVP simples e evita “mini-DDoS” local ou custos/ruído desnecessário.
- Em ambiente real, 1 minuto pode ser caro e pode gerar muitos runs rapidamente.
- Para testar rápido no dev, você pode:
  - forçar `next_run_at` no passado (via SQL) **ou**
  - relaxar o CHECK depois (MVP 1.5+), se fizer sentido.

### Scheduler lock (como funciona e por quê)
O scheduler precisa evitar que:
- duas execuções rodem a mesma rotina ao mesmo tempo
- duas instâncias diferentes (ou ticks próximos) peguem a mesma rotina

Por isso existe o “cadeado”:
- `lock_until`: até quando o lock vale
- `locked_by`: quem pegou o lock (id da instância local)

Regra prática:
- só pode executar se `lock_until is null` **ou** `lock_until < now()`

Isso evita corrida e duplicidade de runs.

### Índices
- `idx_routines_scheduler (is_active, next_run_at)`
  - essencial para buscar “rotinas vencidas” rapidamente
- `idx_routines_workspace (workspace_id)`
  - essencial para listar rotinas do workspace
- `routines_pkey (id)`

### Observação de performance (futuro)
Se o volume de rotinas crescer muito, pode valer um índice adicional que inclua `lock_until`:
```sql
create index if not exists idx_routines_sched_lock
on public.routines (is_active, next_run_at, lock_until);
