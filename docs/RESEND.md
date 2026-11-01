# Confirmação de pedido por e-mail

O webhook autenticado da Pulsefy continua em `/api/webhooks/pulsefy`. Ao confirmar uma compra real do checkout configurado, o backend salva o pagamento e uma única tarefa de confirmação na mesma transação D1. O envio usa a API do Resend em segundo plano, sem atrasar ou desfazer a confirmação financeira. Não há envio de teste financeiro, PIX pendente, acesso ou reembolso.

O e-mail contém número do pedido, cenário, valor efetivamente pago, adicionais conhecidos, prazo informado e botão **Receber meu material pelo WhatsApp**. O link usa o mesmo helper e número da página `/obrigado`; a mensagem já inclui o pedido. As fotos e referências privadas não são incluídas. A entrega continua sendo feita pela equipe pelo WhatsApp, sem geração automática.

## Configuração

- Domínio de envio: `notificacoes.trilhadoamor.site`, autenticado por DKIM/SPF e DMARC próprio; sem alterar MX/SPF do domínio principal.
- Remetente: `Trilha do Amor <pedidos@notificacoes.trilhadoamor.site>`.
- `EMAIL_CONFIRMATIONS_ENABLED=true`, `RESEND_FROM`, `PUBLIC_BASE_URL` e `WHATSAPP_NUMBER` ficam nas variáveis do Worker.
- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` e `RESEND_REPLY_TO` ficam como secrets, preservados nas publicações. Nunca adicionar valores reais ao Git, frontend ou logs.
- Callback do Resend: `https://trilhadoamor.site/api/webhooks/resend`.
- Eventos: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`.
- Verificação Svix com HMAC-SHA256 do corpo bruto, limite de 64 KiB e tolerância de cinco minutos. Cada ID de notificação é processado uma vez; os dados pessoais do payload não são armazenados no histórico de eventos.

## Confiabilidade e operação

A migração `0006_order_confirmation_email.sql` cria `email_outbox`, `email_delivery_events` e `email_suppressions`. A chave única por pedido/tipo, o lease D1 e `Idempotency-Key: order-confirmation/<id>/v1` evitam envios repetidos. O conteúdo e destinatário ficam congelados durante tentativas ambíguas. Depois de aceito pela API, o conteúdo duplicado é descartado da fila.

O Worker tenta enviar imediatamente com `waitUntil`. O cron `*/5 * * * *` retoma falhas de rede, limite e indisponibilidade com espera progressiva; a limpeza de fotos permanece em `0 * * * *`. `accepted` significa aceito pelo Resend; `delivery_status=delivered` significa que o servidor do destinatário aceitou a mensagem, sem afirmar abertura ou caixa principal. O rastreamento de aberturas e cliques está desativado.

Sem endereço válido, a tarefa aguarda o contato. Uma reentrega autenticada da mesma venda pode preencher um endereço originalmente ausente. Mensagem já tentada não troca destinatário. Reembolso cancela tarefas ainda não enviadas. Rejeições, supressões e reclamações impedem novos envios ao mesmo destinatário, identificado por hash com segredo da aplicação.

Após 23 horas desde uma tentativa potencialmente aceita, a tarefa vai para `manual_review`, pois o Resend só garante idempotência durante 24 horas. Antes de reenviar manualmente, conferir o histórico do Resend; nunca trocar a chave para contornar uma resposta ambígua. `failed`, `suppressed`, `manual_review` e endereços ausentes exigem atendimento. Não há reenvio automático de mensagens entregues nem confirmação retroativa em massa de compras anteriores à configuração.

Consultas operacionais sem expor endereço ou conteúdo:

```sql
SELECT status, delivery_status, count(*) AS total FROM email_outbox GROUP BY status, delivery_status;
SELECT order_id, status, delivery_status, attempts, last_error, updated_at FROM email_outbox WHERE status IN ('failed','manual_review','suppressed','awaiting_recipient') ORDER BY updated_at DESC;
```

Os testes locais usam D1 Miniflare, dados fictícios e a API de e-mail simulada. Incluem execução real Workerd, aprovação/fila atômicas, reentregas, concorrência, falhas de rede, conteúdo congelado, cancelamento, assinatura e replay de callbacks, eventos fora de ordem e supressão. A prévia enviada à conta responsável é identificada como **TESTE** e não representa uma compra real.

Fontes primárias: [Send Email](https://resend.com/docs/api-reference/emails/send-email), [Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys), [Verify webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests), [Svix verification](https://docs.svix.com/receiving/verifying-payloads/how-manual).
