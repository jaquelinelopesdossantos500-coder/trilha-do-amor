# Consulta e produção manual

Use a conta Cloudflare já vinculada ao domínio. Não há dashboard novo nesta entrega. A área administrativa que já existia foi preservada, mas a operação inicial pode ser feita no D1 Cloudflare e no Storage Supabase. O bucket privado está configurado no projeto Supabase Trilha do Amor.

## Encontrar um pedido

Cloudflare → Storage & databases → D1 → `trilha-do-amor` (`b456360d-cd3a-49e9-b723-76d2c1c5b077`) → Console. Confirme o ID recebido pelo cliente e substitua apenas o valor do exemplo:

```sql
SELECT id, number, scenario_key, created_at, updated_at,
       payment_provider, payment_id, payment_status, production_status,
       buyer_id, name, email, whatsapp, paid_at, delivery_due_at, completed_at,
       self_key, loved_key, upload_state, photos_expires_at, photos_deleted_at
FROM orders WHERE number = 'TDA-ID_RECEBIDO';
```

O número é público para atendimento. Nome, e-mail, telefone, UUID e chaves são privados. Nunca encaminhe resultado completo, URL com token ou fotos sem conferir a titularidade. A API pública exige a sessão original; conhecer esse número ou mesmo o UUID não é suficiente.

| scenario_key | Cenário |
| --- | --- |
| escadaria-dourada | A escadaria dourada |
| carinho-no-ceu | O carinho no céu |
| abraco-nas-nuvens | O abraço nas nuvens |
| abraco-na-luz | O abraço na luz |

## Baixar as duas fotos

Em Supabase → projeto **Trilha do Amor** (`yllbzrbyjaaksdsqcmiq`) → Storage → `trilha-do-amor-fotos`, procure as chaves exatas de `self_key` e `loved_key` do resultado. A estrutura será `pedidos/TDA-.../foto-cliente.png` e `foto-pessoa-querida.png`, ou extensões `.jpg`/`.webp` conforme a imagem validada. Os nomes originais enviados não são usados. Abra cada objeto e use Download no painel autenticado. Não habilite acesso público para baixar.

Se `photos_deleted_at` estiver preenchido, as chaves forem nulas ou o prazo já tiver vencido, as fotos não estão disponíveis para produção. Solicite novo envio pelo fluxo seguro e valide com o cliente a referência do novo pedido. Uma aprovação tardia pode ser registrada mesmo após a exclusão; isso não recria as fotos.

## Conferir pagamento e eventos

Produzir apenas quando `payment_status='approved'` e a venda estiver vinculada ao mesmo pedido. `paid_at` registra o recebimento da confirmação autenticada; `payment_id` identifica a venda Kirvano. Conferir também a venda no painel Kirvano em caso de dúvida. Visita à página de obrigado, comprovante em imagem ou clique no WhatsApp não aprova o pedido.

```sql
SELECT event_type, transaction_id, event_time, received_at, processed_at, outcome
FROM payment_events
WHERE order_id = (SELECT id FROM orders WHERE number = 'TDA-ID_RECEBIDO')
ORDER BY received_at;
```

`applied` foi processado; `duplicate_state`/`terminal_preserved`/`approved_preserved` preservaram estado. `other_sale_review` indica outra venda que exige conferência manual, sem sobrescrever a primeira. `transaction_conflict` impede usar a mesma venda em dois pedidos. Consulte também `unmatched`: pode indicar venda sem referência reconhecida e precisa ser investigada no painel, sem associação aproximada por contatos.

```sql
SELECT received_at, event_type, transaction_id, outcome
FROM payment_events
WHERE outcome IN ('unmatched','other_sale_review','transaction_conflict')
ORDER BY received_at DESC LIMIT 50;
```

## Pendentes, abandono e exclusão

```sql
SELECT number, scenario_key, created_at, payment_status, upload_state,
       photos_expires_at, photos_deleted_at
FROM orders
WHERE payment_status IN ('pending','rejected','cancelled')
ORDER BY created_at DESC LIMIT 100;
```

Sem pagamento: retenção de 48 horas após envio. Após aprovação: 30 dias, contados da primeira confirmação. Valores configuráveis, divulgados na política. A rotina horária remove até 100 pares vencidos por execução e limpa sessões/limites expirados; o acesso às fotos é bloqueado assim que vence, independentemente da rotina. Falha parcial de upload registra estado `failed` e tenta apagar ambos os objetos; a fila `photo_cleanup_jobs` repete a exclusão depois de uma margem de dez minutos, pelo cron horário, para cobrir confirmações tardias após falhas de conexão. Os trabalhos só são removidos após a conclusão real ou a limpeza confirmada. Não há envio direto público para o bucket Supabase, portanto cada upload fica associado a uma linha do pedido antes de gravar os objetos.

O cliente pode solicitar exclusão no próprio pedido (mesmo navegador), em “Privacidade e exclusão das fotos”, com confirmação. O endpoint remove as duas fotos e preserva metadados financeiros, sem executar reembolso. Pedidos pelo suporte exigem conferência de titularidade; apague os objetos correspondentes no Supabase pela API Storage ou pelo painel e atualize `photos_deleted_at`/chaves nulas somente depois da exclusão real. Acompanhe a rotina para garantir a política de retenção.

## Produzir e entregar

Depois da aprovação, baixar as duas fotos, conferir `scenario_key`, produzir manualmente 1 vídeo vertical de 8s e 3 fotos quadradas e entregar pelo WhatsApp recebido da Kirvano. Não há envio automático. O contato é persistido pelo webhook mesmo quando o comprador fecha o navegador e não inicia conversa.

Para registrar produção/entrega manualmente pelo console (substitua o ID; nunca marque entregue antes de entregar):

```sql
UPDATE orders SET production_status='in_production', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), revision=revision+1
WHERE number='TDA-ID_RECEBIDO' AND payment_status='approved' AND production_status='awaiting_production';

UPDATE orders SET production_status='delivered', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), revision=revision+1
WHERE number='TDA-ID_RECEBIDO' AND payment_status='approved' AND production_status IN ('in_production','ready');
```

Reembolsos são feitos na Kirvano, nunca só alterando o D1. O webhook registra reembolso/chargeback e impede restauração por uma aprovação atrasada. Ajustar feriados e eventuais atrasos com o cliente; `delivery_due_at` é uma estimativa de dias úteis sem calendário de feriados integrado.
