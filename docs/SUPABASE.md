# Fotos privadas no Supabase — 31/10/2026

## Recursos e escopo

- Projeto existente: **Trilha do Amor**, referência `yllbzrbyjaaksdsqcmiq`, região `us-west-2`.
- Bucket: `trilha-do-amor-fotos`, privado, até 10 MiB por imagem, somente JPEG/PNG/WebP.
- Edge Function: `tda-photo-storage`, com autenticação própria por assinatura ECDSA P-256.
- Worker e domínio preservados: `trilha-do-amor`, https://trilhadoamor.site/.
- D1 preservado para pedidos, cenários, sessões, pagamentos e retenção. Não foi migrado para Postgres.

Antes da mudança, o D1 de produção continha zero pedidos e o R2 nunca havia sido ativado. Portanto não havia fotografias antigas para copiar nem pedido a reassociar. O Supabase existente foi reaproveitado, sem criar outro projeto. Não é mais necessário ativar R2 para o site receber as fotos.

## Caminho dos dados

O navegador mantém o mesmo fluxo de envio para o Worker. O backend valida as imagens, cria o pedido no D1 e grava as duas fotos no Supabase. As chaves permanecem `pedidos/TDA-.../foto-cliente.jpg` e `foto-pessoa-querida.jpg`, com extensão conforme o formato real. O cliente só avança depois da confirmação das duas gravações e do registro do pedido. Checkout, retorno Kirvano e ID permanecem os mesmos.

A recuperação continua pelas rotas autenticadas do próprio site. O Worker verifica o cookie do proprietário e o prazo das fotos antes de ler o Supabase. Não há URL pública, login adicional ou chave Supabase no frontend.

## Autenticação entre os servidores

O conector disponível administra o projeto, mas não fornece uma chave secreta do projeto ao Worker. Para concluir a integração sem copiar uma chave privilegiada para outro ambiente, a Edge Function usa suas variáveis de servidor nativas `SUPABASE_SECRET_KEYS` (preferida) ou `SUPABASE_SERVICE_ROLE_KEY` (compatibilidade). Essas credenciais nunca saem do ambiente Supabase.

O Worker possui somente uma chave privada ECDSA de integração, no secret `SUPABASE_STORAGE_PRIVATE_KEY`. A chave pública correspondente está em `supabase/functions/tda-photo-storage/public-key.ts`. Requisições assinam ação, chave do objeto, timestamp, nonce e hash SHA-256 do corpo. A função verifica a assinatura antes de ler o corpo, aceita uma janela de 60 segundos e depois confirma o hash dos bytes. Alterar ação, referência ou conteúdo invalida a requisição. Repetir uma requisição exata dentro da janela mantém a operação idempotente; não libera outros arquivos.

`verify_jwt=false` remove somente a verificação JWT genérica do gateway Supabase; toda operação exige a assinatura da integração. Sem assinatura válida, a função retorna 401 antes de acessar o Storage. A função só opera o bucket fixo e o padrão de chaves do projeto, sem permitir caminhos arbitrários. As respostas não incluem credenciais, URLs assinadas ou erros internos. Não foram abertas políticas públicas para `anon` ou `authenticated`; RLS permanece ativo em `storage.objects`.

Preserve o secret e a chave pública nas próximas publicações. Se precisar rotacionar a chave, gere um par novo, atualize o secret do Worker e a chave pública da função e valide ambos. Não publique a chave privada, não a coloque em `vars`, `.dev.vars.example`, Git, prints ou mensagens.

## Variáveis no Worker

| Nome | Valor |
| --- | --- |
| `PHOTO_STORAGE_PROVIDER` | `supabase` |
| `SUPABASE_STORAGE_URL` | `https://yllbzrbyjaaksdsqcmiq.supabase.co/functions/v1/tda-photo-storage` |
| `SUPABASE_STORAGE_PRIVATE_KEY` | Secret configurado na Cloudflare; sem valor no código |

A configuração de produção não possui binding R2. O adaptador R2 local foi mantido exclusivamente para emulação e testes anteriores; não cria bucket remoto nem exige assinatura R2 na conta. Quando `PHOTO_STORAGE_PROVIDER=supabase`, a ausência de configuração é tratada como erro e nunca provoca fallback silencioso para R2.

## Retenção e falhas

Pedidos sem pagamento: 48 horas. Depois da primeira confirmação de pagamento: 30 dias. O acesso às fotos é bloqueado no instante do vencimento, e o cron horário apaga os objetos pela API Storage, preservando os metadados necessários do pedido. A exclusão pelo cliente usa a mesma autenticação e remove as duas fotos, sem executar reembolso.

Uma conexão pode falhar depois de o serviço remoto ter recebido o upload. Por isso a migração D1 `0004_photo_cleanup_jobs.sql` registra uma limpeza durável **antes** das gravações. Só depois de concluir ambas e confirmar o pedido, uma transação D1 marca o upload como pronto e remove esse trabalho. Em caso de falha/crash, a rotina horária volta a excluir os caminhos depois de uma margem de dez minutos, mesmo se a nova tentativa já tiver substituído o registro falho. Os caminhos do pedido novo são distintos e não são apagados pela limpeza antiga. Falhas de exclusão mantêm o trabalho para nova tentativa.

## Operação manual

1. No D1 `trilha-do-amor`, localize o ID público na coluna `number`. Consulte `scenario_key`, `payment_status`, `self_key` e `loved_key` conforme OPERACAO.md.
2. No Supabase → projeto **Trilha do Amor** → Storage → `trilha-do-amor-fotos`, localize as duas chaves e use Download no painel autenticado.
3. Não torne o bucket público para baixar. Confirmar o pagamento no D1/Kirvano antes de produzir.
4. Não apagar linhas de `storage.objects` por SQL: isso não equivale a excluir os arquivos. Use a API Storage ou o painel.

## Validação executada

- 57 testes automatizados aprovados; TypeScript e build aprovados.
- Teste real pela função publicada: gravou duas imagens fictícias, confirmou existência, recuperou bytes idênticos, rejeitou downloads anônimos/públicos e excluiu as duas imagens. Consulta posterior confirmou zero objetos residuais desse teste.
- Supabase Security Advisors: nenhuma ocorrência.
- Cobertura inclui assinatura ausente/inválida/expirada, alteração de corpo/ação/chave, tamanho/MIME, isolamento entre sessões, falha parcial com rollback, retry idempotente, retenção e upload tardio após falha.

Nenhuma compra real foi feita. O armazenamento Supabase não substitui a configuração ainda pendente da Kirvano e do WhatsApp oficial.

## Fontes oficiais

- https://supabase.com/changelog.md
- https://supabase.com/docs/guides/storage/buckets/creating-buckets
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/storage/serving/downloads
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/functions/function-configuration
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys

A validação no runtime Workerd cobre upload, leitura, existência e exclusão com assinatura entre runtimes distintos. O adaptador usa `redirect=manual` e rejeita respostas de redirecionamento; o modo `error` do Fetch padrão não é implementado pelo Worker. Diagnósticos de falha gravam apenas fase, status HTTP e classe do erro no D1, sem credenciais, corpo ou caminhos privados.

## Resultado no domínio público

Publicação final Cloudflare `8adfd9ac947647d1ae650b1c19e52cc6`, no mesmo Worker e domínio. O navegador enviou duas imagens fictícias, retomou após recarregar e avançou automaticamente à oferta. Pedido de QA `TDA-214570B6B5BF4115`, cenário `carinho-no-ceu`, upload `ready`, pagamento `pending`, marcado `is_test=1` para não ser confundido com venda. As duas fotos JPEG de 3.433 bytes foram localizadas no bucket e carregaram pela API privada com 256×256 pixels. Nova atualização da página preservou o mesmo ID; D1 permaneceu com um único pedido válido. As imagens fictícias ficam sujeitas à retenção normal de 48 horas.

A publicação preservou DB, secret de sessão e cron horário, com zero bindings R2 em produção. Em 31/10/2026 a reautorização da instalação GitHub restabeleceu também a gravação no repositório existente, confirmada pelo commit inicial `b4183ed6d4701658ece4c72b32bebb74c35200b5`. Os fontes completos, incluindo esta integração Supabase, ficam na branch `main`; configurações secretas permanecem somente nos provedores.
