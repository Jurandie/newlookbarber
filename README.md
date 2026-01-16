# Neewlook Barber - Agenda (Cloudflare D1)

Sistema de agendamento moderno com regra unica de conflito (sem sobreposicao de horarios).

## Requisitos
- Node 20+
- Wrangler CLI (`npm install` ja instala)

## Configurar D1
1. `wrangler d1 create neewlookbarber`
2. Atualize `database_id` em `wrangler.toml`
3. `npm run d1:apply`
4. (Opcional) `npm run d1:local` para usar D1 local

## Rodar local
- `npm run dev`

## Seguranca e credenciais
- Defina o login do barbeiro via secrets do Wrangler:
  - `wrangler secret put BARBER_USER`
  - `wrangler secret put BARBER_PASS`
- Para dev local, crie `.dev.vars` com `BARBER_USER` e `BARBER_PASS`.
- (Opcional) Restrinja CORS com `ALLOWED_ORIGINS` (lista separada por virgula).

## Endpoints
- `GET /api/services`
- `GET /api/public/days`
- `GET /api/availability?date=YYYY-MM-DD&service_id=1`
- `GET /api/appointments?date=YYYY-MM-DD`
- `POST /api/appointments`
- `PATCH /api/appointments/:id/cancel`
- `PATCH /api/appointments/:id/reschedule`
- `POST /api/login`
- `GET /api/settings/days`
- `PATCH /api/settings/days`

## Payload de exemplo
```json
{
  "client_name": "Joao Silva",
  "client_phone": "11999990000",
  "date": "2025-01-18",
  "start_time": "10:30",
  "service_id": 1
}
```

## Regras
- Funcionamento (padrao inicial): terca a domingo, 09:00-18:00 (segunda fechado)
- Slots: 15 minutos
- Duracao: 30 ou 45 minutos, conforme servico
- Conflito: nao permite sobreposicao

## Dias de trabalho
- O barbeiro pode ativar/desativar dias da semana no painel.
- A API salva os dias em `working_days` e bloqueia agendamentos em dias fechados.

## Acesso do barbeiro
- Configure `BARBER_USER` e `BARBER_PASS` nos secrets do Cloudflare.
- Apenas o barbeiro logado pode listar, cancelar ou remarcar agendamentos.
- Painel discreto: acesse `/barbeiro/` para login e gestao.
