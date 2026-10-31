# Integração Kirvano

> Histórico do adaptador legado. A integração ativa agora é Pulsefy; configuração e validação em [PULSEFY.md](PULSEFY.md). Os IDs e secrets Kirvano abaixo não são necessários para o webhook Pulsefy.

## Contrato implementado

Destino do botão de checkout informado pelo responsável: `https://pulsefy.shop/c/o8gsg5c`.

O navegador envia apenas cenário e duas fotos. O backend gera o UUID interno e o número `TDA-` com 16 caracteres hexadecimais aleatórios, registra o cenário canônico e guarda as imagens privadas. Somente depois de confirmar os dois objetos privados Supabase, o checkout recebe `?src=tda_<40 caracteres aleatórios>`. Essa referência permanece estável nas novas tentativas do mesmo pedido. Não contém nome, telefone, caminho de arquivo ou credencial para acessar fotos.

A documentação oficial admite `src` no checkout e o retorna em `utm.src` no webhook. O servidor faz correspondência exata com `orders.checkout_reference`. O ID da venda fica em `payment_id`, com índice único por provedor. O UUID da URL do checkout não é presumido como `offer_id`; os IDs de produto e oferta devem ser obtidos no painel ou em payload autorizado da própria Kirvano.

A abertura do checkout hospedado exige o link exato acima, `PAYMENT_MODE=kirvano`, `ENABLE_LIVE_PAYMENTS=true`, sessão e fotos privadas salvas. As credenciais do webhook não bloqueiam esse redirecionamento. A confirmação financeira continua separada: sem token e IDs de produto/oferta configurados, o servidor não aceita uma aprovação automática. Nesse caso, o atendimento confere a venda diretamente na Kirvano e coordena a entrega pelo WhatsApp.

`/obrigado` está disponível com o botão “RECEBA SEU MATERIAL NO WHATSAPP” e botão flutuante para `5553991905194`. A mensagem contém o número público do pedido quando ele é recuperado na sessão. Uma visita sem sessão oferece contato para localizar o pedido, sem divulgar fotos, identificar outro comprador ou afirmar que houve pagamento. O botão apenas abre a conversa; não envia mensagem nem disponibiliza arquivos automaticamente.

## Autenticação e eventos

Endpoint: `POST https://trilhadoamor.site/api/webhooks/kirvano?token=<SEGREDO_COMPARTILHADO>`.

A documentação descreve um Token opcional, mas não fixa publicamente seu cabeçalho ou transporte. Para evitar supor um cabeçalho não documentado, esta implementação exige um segredo aleatório na própria URL de webhook configurada pelo vendedor. Use no mínimo 32 bytes aleatórios, exclusivamente no secret `KIRVANO_WEBHOOK_TOKEN` e na URL cadastrada na Kirvano. Não coloque a URL completa em tickets, prints, Git ou no frontend. A Cloudflare está configurada com `observability.redact_query_string=true`. O código não registra payloads, tokens ou dados pessoais nos logs. Uma eventual cópia do webhook deve ocultar o token.

A verificação compara hashes em tempo constante antes de processar o corpo. Sem configuração: 503. Token inválido: 401. Payload/correlação, produto, oferta, tipo de venda ou valor inválidos: 422. Corpo limitado a 64 KiB. Falha transitória de persistência: 5xx, permitindo nova entrega. Não é uma assinatura criptográfica emitida pela Kirvano: a autenticidade depende do sigilo da URL compartilhada. Caso o provedor documente uma assinatura ou transporte mais forte, o adaptador `lib/kirvano.ts` poderá incorporá-lo.

Eventos documentados tratados: `SALE_APPROVED`, `SALE_REFUSED`, `SALE_REFUNDED`, `SALE_CHARGEBACK`, `PIX_GENERATED`, `PIX_EXPIRED`, `BANK_SLIP_GENERATED`, `BANK_SLIP_EXPIRED`. Aprovação exige produto e oferta exatos, `ONE_TIME`, item principal sem order bump, preço e total de R$ 27,90. Não usar este checkout com adicionais, valor alterado ou outro produto sem adaptar e homologar a validação.

Como o payload oficial não documenta um ID único de notificação, o recibo é identificado pelo hash determinístico dos campos financeiros e de correlação. `payment_events` registra o hash, resultado e datas, sem guardar o payload. A atualização do pedido usa comparação de revisão para concorrência. Duplicatas não prorrogam retenção ou entrega. Aprovação não é rebaixada por pendência, recusa ou expiração atrasadas. Reembolso/chargeback prevalece sobre aprovação, inclusive se a entrega dos eventos chegar invertida. Uma segunda venda para pedido já quitado é registrada para revisão, sem substituir a primeira. Eventos com referência desconhecida são auditados como `unmatched`; nunca há associação por nome, telefone ou proximidade de horário.

`created_at` do provedor, documentado sem fuso, é preservado para ordenação/diagnóstico, sem convertê-lo arbitrariamente em horário financeiro UTC. `paid_at` é o instante UTC em que o servidor recebeu a confirmação autenticada. Nome, e-mail, telefone e identificador do comprador são persistidos quando disponibilizados; CPF e dados completos do cartão não são armazenados. A confirmação não depende do navegador nem de clique no WhatsApp.

## Configuração exata no painel

1. Armazenamento já migrado para Supabase: projeto `yllbzrbyjaaksdsqcmiq`, bucket privado `trilha-do-amor-fotos`, função autenticada `tda-photo-storage`. Manter a configuração do Worker descrita em SUPABASE.md. Não é necessário ativar R2.
2. No Worker, manter `PAYMENT_MODE=kirvano`, o checkout exato e o `SESSION_SECRET` existente. Configurar `KIRVANO_PRODUCT_ID` e `KIRVANO_OFFER_ID` correspondentes ao produto/oferta de R$ 27,90. Configurar `WHATSAPP_NUMBER` com o número oficial no formato `55` + DDD + telefone, somente dígitos.
3. Criar o segredo compartilhado em ambiente seguro e configurar `KIRVANO_WEBHOOK_TOKEN` como secret na Cloudflare. Cadastrar a URL completa acima em Kirvano → Integrações → Webhooks → Criar; selecionar o produto correto e os eventos tratados. O campo Token opcional não substitui o parâmetro exigido por este endpoint.
4. Em Produto → Ofertas → editar, configurar “Ir para outra página após aprovado” para `https://trilhadoamor.site/obrigado`. Esta página recupera o pedido no mesmo navegador/sessão. Se a Kirvano usar navegador externo, o cliente poderá informar o ID ao suporte; o ID público isolado não libera fotos ou dados.
5. Conferir no checkout o produto, R$ 27,90, meios de pagamento, entrega manual de 1 vídeo de 8s + 3 fotos pelo WhatsApp, prazo e suporte reais. Não foi realizada compra real.
6. Usar o teste de webhook do painel e confirmar logs/HTTP. Um evento `TEST` autenticado só testa conectividade; não prova que uma venda real devolverá `utm.src`. Para homologação completa, executar um mecanismo de teste autorizado da Kirvano que devolva a referência real, produto e oferta. Conferir no D1 o pedido, venda e contatos; repetir a notificação e testar reembolso. Não inventar uma associação se `src` não vier.
7. `ENABLE_LIVE_PAYMENTS=true` libera o redirecionamento solicitado para o checkout hospedado. A aprovação no site permanece condicionada ao webhook autenticado e validado. Não usar parâmetros da página de retorno nem o clique no WhatsApp como comprovação de compra.

## Estado verificado nesta entrega

Supabase privado configurado e validado; metadados e sessões permanecem no D1. O R2 não é mais uma dependência. O checkout hospedado foi liberado, e o WhatsApp oficial foi configurado. IDs de produto/oferta e secret compartilhado do webhook continuam pendentes. O navegador do checkout pediu verificação humana e a inspeção parou nesse ponto. Não foram verificados preço, meios de pagamento ou configuração de retorno no painel. O diretório de plugins não oferece conector Kirvano; o MCP oficial descrito pela empresa exige OAuth e não está conectado nesta sessão. A correlação está implementada e coberta com payloads oficiais simulados, mas ainda não homologada no provedor. É necessário cadastrar o retorno `https://trilhadoamor.site/obrigado` na oferta Kirvano e configurar o webhook para que a confirmação automática ocorra sem atendimento manual.

## Fontes oficiais consultadas em 31/10/2026 UTC

- https://help.kirvano.com/hc/central-de-ajuda/articles/1765385505-configurando-integracao-via-webhook
- https://help.kirvano.com/hc/central-de-ajuda/articles/1765392597-how-to-pass-utm-parameters-in-the-checkout-url
- https://help.kirvano.com/hc/central-de-ajuda/articles/1775656489-ex
- https://help.kirvano.com/hc/central-de-ajuda/articles/1765394914-configuring-integration-via-webhook
- https://help.kirvano.com/hc/central-de-ajuda/articles/1765386280-como-configurar-up_sell
- https://help.kirvano.com/hc/central-de-ajuda/articles/1793304262-conecte-o-seu-agente-de-ia-a-kirvano
- https://docs.kirvano.com/docs/mcp/ferramentas/integracoes
