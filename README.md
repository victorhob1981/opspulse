# OpsPulse

OpsPulse é um mini SaaS de portfólio para cadastrar, agendar e monitorar rotinas (health checks e chamadas HTTP),
com histórico de execuções e, no MVP 2, um resumo inteligente com LLM quando houver falha.

## Objetivo
Projeto de aprendizado e portfólio com foco em arquitetura, cloud e boas práticas, rodando com custo mínimo (free tiers).

## Stack
- Backend: Azure Functions (Python)
- Banco/Auth: Supabase (PostgreSQL + Auth)
- Frontend: Azure Static Web Apps ou Vercel

## MVP 1 (entregável)
- Auth (Supabase)
- CRUD routines com interval_minutes
- Execução manual
- Histórico de runs
- Timer Function executa pendentes
- /health + logs
- Controles: max_concurrency=5, timeout 5–10s, retry=1 + backoff
- Segurança: bloquear headers sensíveis; secrets via App Settings

## MVP 2 (brilho)
- RLS (Supabase policies)
- Run Summary com LLM (contexto mínimo sanitizado)
- Retry/backoff melhor (429/503)
- Webhook/events (opcional)

## Estrutura
- /api  -> backend (Azure Functions)
- /web  -> frontend
- /docs -> diagramas e evidências
