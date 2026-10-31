# Trilha do Amor

Funil React/Vinext no domínio https://trilhadoamor.site/, hospedado no Worker Cloudflare existente `trilha-do-amor`. Jornada: cenário → duas fotos → carrossel emocional → oferta de R$ 27,90 → Kirvano → confirmação por webhook → produção e entrega manual pelo WhatsApp.

O site não pede nome, e-mail ou telefone. Esses dados são preenchidos na Kirvano e vinculados ao pedido somente pelo webhook autenticado. Não há geração automática de vídeo nem envio automático de mensagens.

## Estado da integração

Código integrado, com 60 testes automatizados aprovados. Fotografias migradas para Supabase Storage privado no projeto existente Trilha do Amor; D1 atualizado até a migração 0004 para limpeza durável de uploads interrompidos. A liberação de pagamentos ainda depende de configurar produto/oferta, webhook e retorno na Kirvano, informar o WhatsApp oficial e homologar o retorno de `src` no provedor. Nenhuma compra real foi realizada. Cobranças permanecem bloqueadas enquanto as dependências técnicas não estiverem prontas.

Repositório do projeto: [jaquelinelopesdossantos500-coder/trilha-do-amor](https://github.com/jaquelinelopesdossantos500-coder/trilha-do-amor), público, com os fontes completos na branch `main`. Em 31/10/2026 a reautorização da instalação GitHub restabeleceu a gravação pelo conector; o commit inicial foi `b4183ed6d4701658ece4c72b32bebb74c35200b5`. A publicação do site utiliza a API Cloudflare, sem deploy automático GitHub configurado. Chaves privadas e dados de pedidos não fazem parte do repositório.

## Funcionalidades preservadas e integradas

- Quatro cenários com chaves canônicas e prévias MP4 carregadas ao tocar.
- Duas fotos válidas com prévia, troca antes do envio, reencodificação e remoção de EXIF; sem lista permanente de formatos ou checkbox de política.
- Upload real idempotente com metadados D1 e fotos no Supabase privado, ID gerado no backend e acesso por sessão.
- Stories ilustrativos em smartphone CSS, com três imagens, swipe, teclado, pausa e progresso de seis segundos. O avanço aguarda salvamento real; erro permite retry/revisão, sem inventar ID.
- Banner da oferta com a imagem do cenário escolhido desfocada, cadeado vetorial e altura original de 160 px.
- Oferta sem formulário de contatos. Checkout Kirvano exato com referência aleatória `src` persistida, após confirmar os objetos Supabase.
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

Os testes usam D1/armazenamento local Miniflare e payloads fictícios baseados no contrato oficial. O runtime local usa a data de compatibilidade suportada pelo binário instalado; a implantação mantém `2026-10-30`. Suites são sequenciais para evitar disputa entre runtimes. Esses testes não equivalem a homologação ou compra real na Kirvano.

## Documentação

- [Supabase: fotos privadas e autenticação entre servidores](docs/SUPABASE.md)
- [Cloudflare e publicação no mesmo Worker](docs/CLOUDFLARE.md)
- [Configurações e dependências pendentes](docs/CONFIGURACOES.md)
- [Kirvano: correlação, autenticação e configuração exata](docs/KIRVANO.md)
- [Operação manual: localizar pedido, baixar fotos e produzir](docs/OPERACAO.md)
- [Validação e limites](docs/VALIDACAO.md)
- [Stories e banner compacto aprovados](docs/CARROSSEL.md)

`cloudflare.wrangler.jsonc` guarda apenas identificadores não secretos dos recursos existentes. Tokens/senhas ficam em secrets. Preserve `SESSION_SECRET`, domínio, DB e cron nas atualizações.

| Caminho | Função |
| --- | --- |
| `components/funnel.tsx` | Jornada, oferta sem contatos e acompanhamento |
| `components/reunion-preparation.tsx` | Transição/carrossel |
| `app/obrigado/` | Retorno da Kirvano |
| `lib/backend.ts` | Pedidos, upload, fotos, exclusão e manutenção |
| `lib/photo-storage.ts`, `supabase/functions/tda-photo-storage/` | Adaptador Supabase e acesso privado assinado |
| `lib/kirvano.ts` | Checkout e webhook de produção |
| `lib/payments.ts` | Adaptador legado, não selecionado no modo Kirvano |
| `db/schema.ts`, `drizzle/` | Modelo e migrações |
| `tests/` | Integração e interface com dados fictícios |
