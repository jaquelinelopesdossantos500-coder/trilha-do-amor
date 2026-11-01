# Fotos, cenário e identificação para atendimento

A fotografia fica no Supabase Storage privado (`trilha-do-amor-fotos`). O pedido fica no D1 Cloudflare existente, com o número público `TDA-...`, cenário canônico, as duas chaves do Storage, pagamento e prazo. Não é necessário publicar o bucket ou copiar fotos para o WhatsApp para relacionar os registros. O número recebido pelo atendimento corresponde à pasta `pedidos/TDA-.../` e à coluna `orders.number`.

O cliente só avança para a oferta depois de salvar as duas imagens e o registro do pedido. Antes de abrir o checkout, o backend confere novamente a existência de ambas no Supabase. Uma repetição do mesmo envio não duplica o pedido. Trocar uma foto ou cenário antes do envio cria uma nova chave de intenção; uma resposta perdida não pode reaproveitar silenciosamente fotografias de uma tentativa anterior. Repetir uma chave com outro cenário é recusado.

## Recuperação na página de obrigado

1. A referência explícita `?pedido=<uuid>` tem prioridade e sempre passa pela autenticação da sessão original.
2. Ao abrir o checkout, a aba guarda seu próprio pedido no `sessionStorage`. Um checkout em outra aba não substitui esse marcador.
3. O rascunho IndexedDB e o `localStorage` preservam a retomada existente.
4. Se faltarem referências locais, `/api/orders/recover` usa exclusivamente o cookie da sessão para consultar os pedidos dessa pessoa que chegaram ao checkout. Um único pedido pode ser recuperado automaticamente. Havendo vários, a pessoa escolhe o número/cenário; o sistema não adivinha por e-mail, preço ou status.
5. Enquanto a consulta estiver pendente ou falhar, o botão do WhatsApp fica indisponível. Depois da recuperação, tanto o botão principal quanto o flutuante levam o número do mesmo pedido. Falhas permitem consultar novamente, sem novo upload.

Sem o cookie original e sem uma referência válida, outra pessoa ou navegador não pode abrir as fotos pelo ID. A página de obrigado sem pedido oferece atendimento para localização manual e não afirma pagamento. O botão do e-mail já contém o número do pedido e funciona como alternativa para falar com o suporte em outro navegador. Abrir o WhatsApp prepara a mensagem; o cliente ainda precisa enviá-la.

## Operação

Consultar o número em Cloudflare → D1 → `trilha-do-amor` → `orders`, conforme [OPERACAO.md](OPERACAO.md), para conferir `scenario_key`, `payment_status`, `self_key` e `loved_key`. As imagens ficam no Supabase → projeto Trilha do Amor → Storage → `trilha-do-amor-fotos` → `pedidos/TDA-.../`.

Retenção configurada: 48 horas sem pagamento e 30 dias após a primeira aprovação. O cron horário remove fotografias vencidas; os dados necessários do pedido são preservados. Não produzir usando somente comprovante ou clique no WhatsApp: o pagamento deve estar aprovado no registro e no provedor.

## Verificações

Os testes automatizados cobrem os quatro cenários, uploads privados, rollback de falha parcial, retry sem duplicação, recarga, foto/cenário alterados antes do envio, checkout com referências estáveis, isolamento entre clientes, retorno na mesma aba, duas abas, referência explícita, perda de armazenamento local, escolha entre pedidos e falha de rede durante recuperação. Pagamento e confirmação por e-mail permanecem nos testes existentes.

A conferência de produção compara as chaves dos pedidos com os nomes reais dos objetos, sem publicar fotografias nem dados de clientes. Pedidos criados para QA são identificados como teste e não simulam pagamento aprovado em produção. Nenhuma compra real é feita durante essa verificação.
