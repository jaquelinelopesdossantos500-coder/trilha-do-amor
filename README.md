# Trilha do Amor

Funil React/Vinext no domínio https://trilhadoamor.site/, hospedado no Worker Cloudflare existente `trilha-do-amor`. Jornada: cenário → duas fotos → carrossel emocional → oferta de R$ 27,90 → Pulsefy → confirmação por webhook → produção e entrega manual pelo WhatsApp.

O site não pede nome, e-mail ou telefone. Esses dados são preenchidos no checkout e vinculados ao pedido pelo webhook autenticado. Não há geração automática de vídeo nem envio automático de mensagens.

## Estado da integração

Fotografias no Supabase Storage privado; D1 com migração 0005 para detalhes financeiros e adicionais. O botão da oferta abre `https://pulsefy.shop/c/o8gsg5c`, preservando o pedido e uma referência `src` estável. O receptor `/api/webhooks/pulsefy` aceita o formato Pulsefy/Getfy com Bearer, confirma `pedido_pago` e trata reembolso sem duplicar pedidos. `/obrigado` acompanha o status e oferece recebimento no WhatsApp (53) 99190-5194. Para completar a conexão no provedor, cadastrar webhook/token/eventos e a URL de retorno conforme [PULSEFY.md](docs/PULSEFY.md), executar o teste do painel e acompanhar a primeira confirmação real. Nenhuma compra real foi realizada.

Repositório do projeto: [jaquelinelopesdossantos500-coder/trilha-do-amor](https://github.com/jaquelinelopesdossantos500-coder/trilha-do-amor), público, com os fontes completos na branch `main`. Em 31/10/2026 a reautorização da instalação GitHub restabeleceu a gravação pelo conector; o commit inicial foi `b4183ed6d4701658ece4c72b32bebb74c35200b5`. A publicação do site utiliza a API Cloudflare, sem deploy automático GitHub configurado. Chaves privadas e dados de pedidos não fazem parte do repositório.

## Funcionalidades preservadas e integradas

- Quatro cenários com chaves canônicas e prévias MP4 carregadas ao tocar.
- Duas fotos válidas com prévia, troca antes do envio, reencodificação e remoção de EXIF; sem lista permanente de formatos ou checkbox de política.
- Upload real idempotente com metadados D1 e fotos no Supabase privado, ID gerado no backend e acesso por sessão.
- Stories ilustrativos em smartphone CSS, com três imagens, swipe, teclado, pausa e progresso de seis segundos. O avanço aguarda salvamento real; erro permite retry/revisão, sem inventar ID.
- Banner da oferta com a imagem do cenário escolhido desfocada, cadeado vetorial e altura original de 160 px.
- Oferta sem formulário de contatos. Checkout Pulsefy exato com referência aleatória `src` persistida, após confirmar os objetos Supabase.
- Webhook autenticado, idempotente, com revisão concorrente e proteção contra eventos atrasados/associação de outra venda.
- `/obrigado`: estado real do pagamento, ID, entrega e WhatsApp configurável; retorno por URL não aprova.
- Exclusão autenticada das duas fotos e limpeza horária de arquivos vencidos, mantendo metadados necessários ao pedido.
- Painel legado preservado; nenhum dashboard novo foi desenvolvido.

## Desenvolvimento e verificação

Node.js >=22.13 e pnpm 11.25. `.dev.vars` e estado local nunca devem ser publicados.

```sh
pnpm install --frozen-lockfile
pnpm run configure:dev
pnpm run build
pnpm run db:local
pnpm run dev
```

Em desenvolvimento, escolha um cenário, envie `tests/fixtures/foto-teste.png` nos dois campos, veja o carrossel/oferta e abra o simulador local sem preencher contatos. Nenhuma cobrança é criada. O simulador não funciona no Worker com `APP_ENV=production`.

```sh
pnpm run typecheck
pnpm test
pnpm run build
```

Os testes usam D1/armazenamento local Miniflare e payloads fictícios baseados no contrato oficial. O runtime local usa a data de compatibilidade suportada pelo binário instalado; a implantação mantém `2026-10-30`. Suites são sequenciais para evitar disputa entre runtimes. Esses testes não equivalem a homologação ou compra real na Pulsefy.

## Documentação

- [Supabase: fotos privadas e autenticação entre servidores](docs/SUPABASE.md)
- [Cloudflare e publicação no mesmo Worker](docs/CLOUDFLARE.md)
- [Configurações e dependências pendentes](docs/CONFIGURACOES.md)
- [Pulsefy: webhook, token e retorno após pagamento](docs/PULSEFY.md)
- [Kirvano: adaptador legado](docs/KIRVANO.md)
- [Operação manual: localizar pedido, baixar fotos e produzir](docs/OPERACAO.md)
- [Validação e limites](docs/VALIDACAO.md)
- [Stories e banner compacto aprovados](docs/CARROSSEL.md)

`cloudflare.wrangler.jsonc` guarda apenas identificadores não secretos dos recursos existentes. Tokens/senhas ficam em secrets. Preserve `SESSION_SECRET`, domínio, DB e cron nas atualizações.

| Caminho | Função |
| --- | --- |
| `components/funnel.tsx` | Jornada, oferta sem contatos e acompanhamento |
| `components/reunion-preparation.tsx` | Transição/carrossel |
| `app/obrigado/` | Retorno do checkout e acompanhamento |
| `lib/backend.ts` | Pedidos, upload, fotos, exclusão e manutenção |
| `lib/photo-storage.ts`, `supabase/functions/tda-photo-storage/` | Adaptador Supabase e acesso privado assinado |
| `lib/pulsefy.ts`, `lib/hosted-checkout.ts` | Webhook Pulsefy e checkout hospedado |
| `lib/kirvano.ts` | Adaptador legado preservado |
| `lib/payments.ts` | Adaptador legado, não selecionado no modo Pulsefy |
| `db/schema.ts`, `drizzle/` | Modelo e migrações |
| `tests/` | Integração e interface com dados fictícios |
