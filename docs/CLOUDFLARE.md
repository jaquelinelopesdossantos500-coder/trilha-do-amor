# Infraestrutura atual — Cloudflare e Supabase

- Domínio HTTPS: https://trilhadoamor.site/
- Worker existente: `trilha-do-amor`.
- Conta Cloudflare: `eb97df37b19199050ad3505046200f6c`.
- D1 existente: `trilha-do-amor`, UUID `b456360d-cd3a-49e9-b723-76d2c1c5b077`.
- Migrações 0000–0004 aplicadas; 0004 acrescenta apenas a fila durável de limpeza de uploads, sem recriar pedidos.
- Cron preservado: `0 * * * *`.
- Secrets `SESSION_SECRET` e `SUPABASE_STORAGE_PRIVATE_KEY` preservados nas publicações.
- Custom Domain preservado: zona `46355bcf5a1c7d7138d508b077f0424d`, vínculo `2ccf3b6b245f2a73ee0f8ef6f425b0b9eb1cc5f7`.
- Fotos: Supabase, projeto `yllbzrbyjaaksdsqcmiq`, bucket privado `trilha-do-amor-fotos`.
- Nenhum binding R2 é usado na produção. Não é necessário ativar R2 na conta.

O Worker continua responsável pelo site, sessões, autorização e pedidos. O Supabase recebe as fotos por uma função autenticada com assinaturas de curta duração. O D1 mantém o cenário, referências privadas, ID e estados financeiros. Não foi criado outro Worker, D1, domínio ou projeto Supabase.

## Atualizar o mesmo Worker

Com acesso autenticado à conta:

```sh
pnpm run typecheck
pnpm test
pnpm run build
pnpm exec wrangler d1 migrations apply DB --remote --config cloudflare.wrangler.jsonc
pnpm exec wrangler deploy --config cloudflare.wrangler.jsonc
```

Não criar outro banco ou trocar o domínio. Use o arquivo de implantação da raiz, que já aponta para Supabase e contém apenas identificadores/configuração não secretos. Não publicar `.dev.vars`. Na publicação pela API, preservar bindings secretos com `keep_bindings` e enviar DB/ASSETS/vars explicitamente.

A função Supabase deve corresponder à chave de integração presente no Worker. Seus fontes estão em `supabase/functions/tda-photo-storage/`, e o protocolo comum está em `lib/storage-protocol.ts`. Consulte SUPABASE.md para a autenticação, retenção e operação. Não copiar uma chave privilegiada do Supabase para o frontend.

## Endpoints mantidos

| Método e caminho | Função |
| --- | --- |
| `POST /api/session` | Sessão anônima privada, cookie HttpOnly |
| `POST /api/orders` | Cenário e duas imagens validadas; D1 + Supabase, com chave idempotente |
| `GET /api/orders/:uuid` | Status e metadados do próprio pedido |
| `GET /api/orders/:uuid/photos/self` e `/loved` | Fotos Supabase, após validar sessão e retenção |
| `DELETE /api/orders/:uuid/photos` | Exclusão das duas fotos pelo proprietário |
| `POST /api/orders/:uuid/checkout` | Confirma presença das fotos e retorna Kirvano com `src` persistido |
| `POST /api/webhooks/kirvano` | Notificação autenticada; configuração Kirvano ainda necessária |
| `POST /api/orders/:uuid/reconcile` | Estado salvo no servidor; Kirvano é atualizado por webhook |
| `GET /obrigado` | Retorno seguro; não confirma pagamento por URL |

A manutenção horária exclui fotos vencidas e revisa trabalhos de upload inconcluso. O acesso às fotos vence imediatamente, antes da exclusão física. Logs omitem corpos e credenciais; query strings são redigidas na Cloudflare.

## GitHub

Repositório existente: `jaquelinelopesdossantos500-coder/trilha-do-amor`, público, branch `main`. Em 31/10/2026 a instalação foi reautorizada para todos os repositórios e a gravação pelo conector foi confirmada pelo commit inicial `b4183ed6d4701658ece4c72b32bebb74c35200b5`. Os fontes completos e as mídias da versão validada são publicados via API Git, com atualização condicional da branch para preservar alterações concorrentes. A publicação Cloudflare permanece independente: não há workflow de deploy automático GitHub/Cloudflare configurado.

## Publicação da migração

Versão final `8adfd9ac947647d1ae650b1c19e52cc6`, com DB e cron preservados e `PHOTO_STORAGE_PROVIDER=supabase`. Configuração posterior confirmou ambos os secrets, URL da função correta e zero bindings R2. O envio público e a recuperação privada das imagens foram verificados; a migração de armazenamento está concluída. A configuração Kirvano permanece separadamente pendente.

Republicação posterior em 31/10/2026: versão `5c06dbf2f7664b659226c5d16d65e71c`, anotação de origem `local-bf0ec84`. Mesmos módulos de execução, com `keep_assets: true` e os 34 assets existentes preservados. O navegador confirmou restauração do pedido e fotos privadas, carrossel e avanço automático para a oferta com o mesmo ID. Essa anotação antecede a publicação GitHub e identifica exclusivamente o commit local. A sincronização dos fontes não exige republicar o Worker, pois as mudanças seguintes são apenas documentação.
