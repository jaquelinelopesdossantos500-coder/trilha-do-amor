# Pulsefy — pagamento aprovado e retorno ao WhatsApp

## Configuração no formulário de webhook

| Campo | Valor |
| --- | --- |
| Nome | Trilha do Amor — Pagamentos |
| URL | `https://trilhadoamor.site/api/webhooks/pulsefy` |
| Bearer token | Segredo compartilhado configurado em `PULSEFY_WEBHOOK_TOKEN`; copiar do arquivo privado entregue ao responsável, sem o prefixo `Bearer ` |
| Eventos | **Pedido pago** e **Reembolso** |
| Envio de acesso (pós-aprovação) | Desmarcado; não é uma confirmação financeira |
| Produtos | **Trilha do Amor – Reencontro em Vídeo**, produto principal desse checkout |
| Ativo | Ligado |

O token é enviado pelo provedor no cabeçalho `Authorization: Bearer …`, comparado em tempo constante e nunca exposto pela configuração pública. Não colocar o token na URL, frontend, Git, logs ou capturas. `SESSION_SECRET` e a chave privada do armazenamento permanecem inalterados.

Depois de salvar, usar **Testar**, selecionando **Pedido pago**. O teste oficial contém `payload.test=true`: a resposta esperada é HTTP 200 com `received: true` e `test: true`. Isso confirma a conexão e não aprova uma venda fictícia. Em caso de erro, consultar os logs desse webhook na Pulsefy; tokens e dados pessoais devem permanecer ocultos em qualquer material compartilhado.

## Retorno ao cliente — configuração separada

No editor do checkout Pulsefy, seção de redirecionamento, configurar **Redirecionar após compra (URL)** como `https://trilhadoamor.site/obrigado`. Se houver upsell/downsell, manter esse endereço como destino final depois das ofertas. A URL do webhook não deve ser usada como página de retorno, e `/obrigado` não deve ser cadastrada como receptor de webhook.

O webhook é uma chamada entre servidores. Ele responde JSON e não redireciona o navegador do comprador. O checkout executa o retorno ao site; `/obrigado` recupera o pedido da sessão e consulta o status real, inclusive quando a notificação demora alguns segundos. O botão de recebimento e o botão flutuante abrem o WhatsApp `5553991905194` com o número público do pedido. A conversa não é enviada automaticamente, e os arquivos são produzidos e entregues manualmente.

## Contrato e validação

Endpoint POST com corpo limitado a 64 KiB, envelope `{ event, payload, timestamp }`. O evento **Pedido pago** usa `pedido_pago`; aprovação exige `payload.order.status=completed`, moeda BRL, compra avulsa, o checkout exato `https://pulsefy.shop/c/o8gsg5c` e `payload.tracking.src` correspondendo ao `checkout_reference` privado de um pedido já registrado. Não há associação por nome, telefone, e-mail ou proximidade de horário.

O preço-base é R$ 27,90. Se o checkout inclui order bumps, o total deve ser exatamente R$ 27,90 mais a soma dos adicionais em BRL. Total e itens sanitizados são preservados em `payment_total_cents`, `payment_currency` e `payment_details_json`; o preço-base do pedido permanece inalterado. Os adicionais aparecem no recibo para acompanhamento da entrega. Vendas separadas de upsell/downsell com outro checkout não são usadas para aprovar o pedido principal.

`payload.order.id` é a identificação estável da venda Pulsefy e fica em `payment_id`, com provedor `pulsefy`. A identificação do gateway e os produtos comprados ficam nos detalhes privados de pagamento. Nome, e-mail e telefone são persistidos para entrega quando presentes; CPF, senhas, payload bruto e tokens não são armazenados.

O recibo do evento usa fingerprint dos dados financeiros e da correlação. O `timestamp` de envio não entra na chave, pois muda nas retentativas do provedor. Duplicatas não renovam prazo de entrega ou retenção. Atualizações concorrentes usam comparação de revisão. Uma venda não pode quitar dois pedidos. Outra venda para um pedido já quitado é registrada para revisão, sem substituir a anterior. Reembolso (`reembolso`, estado `refunded`) prevalece sobre aprovação, inclusive quando chega primeiro. Avisos de envio de acesso, pendência e outros eventos são reconhecidos sem aprovar pedidos.

Pedidos não pagos gerados pelo mesmo checkout quando o identificador interno ainda era `kirvano` podem migrar para `pulsefy`, preservando ID, cenário, fotos, sessão e referência. Isso não transfere vendas já pagas de outro provedor. Os adaptadores legados foram mantidos.

## Operação e limites

Migração D1 0005 adiciona apenas os três campos de detalhes de pagamento. Não altera ou remove fotografias, sessões ou pedidos existentes. As fotos permanecem no Supabase privado, com o cron e a política de retenção existentes.

O receptor e os casos de autenticação, aprovação, adicionais, duplicidade, concorrência e reembolso foram testados com payloads fictícios locais baseados no contrato primário. O teste oficial da Pulsefy e a primeira confirmação real precisam ser acompanhados após salvar a configuração no painel. Nenhuma compra real foi realizada nesta entrega. Não habilitar aprovação por parâmetros de URL ou pelo clique no WhatsApp.

## Fontes primárias

A interface e o checkout apresentados pela Pulsefy correspondem à plataforma Getfy; o frontend público identifica `getfy-checkout-root`. A integração usa o contrato público Getfy do commit `c652e2a7ff7e0b937c58b30357e7394b4d93b13d`, consultado em 31/10/2026. A correspondência com essa instalação deve ser confirmada pelo teste do painel e por uma notificação real; não se presume que versões ou customizações sejam idênticas.

- [Envelope, Bearer e retentativas](https://github.com/getfy-opensource/getfy/blob/c652e2a7ff7e0b937c58b30357e7394b4d93b13d/app/Jobs/DispatchWebhookJob.php)
- [Campos financeiros, produto, adicionais e tracking](https://github.com/getfy-opensource/getfy/blob/c652e2a7ff7e0b937c58b30357e7394b4d93b13d/app/Support/WebhookPayloadBuilder.php)
- [Eventos e nomes exibidos no formulário](https://github.com/getfy-opensource/getfy/blob/c652e2a7ff7e0b937c58b30357e7394b4d93b13d/config/webhook_events.php)
- [Teste manual do painel](https://github.com/getfy-opensource/getfy/blob/c652e2a7ff7e0b937c58b30357e7394b4d93b13d/app/Http/Controllers/WebhookController.php)
- [Campo de redirecionamento](https://github.com/getfy-opensource/getfy/blob/c652e2a7ff7e0b937c58b30357e7394b4d93b13d/resources/js/Pages/Checkout/Builder.vue)
