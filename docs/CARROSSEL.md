# Transição entre fotografias e oferta

A tela reutiliza o logotipo, as cores, o estado e a navegação do funil. `ReunionPreparation` contém apenas a apresentação e o controle de tempo. O funil continua responsável por salvar e restaurar o pedido. O gateway e a API de pedidos não foram alterados.

## Imagens

São exclusivamente as três imagens anexadas, na ordem solicitada. As versões WebP mantêm os 896×1200 pixels e o enquadramento inteiro, sem recorte ou alteração de rostos. O total passou de 2.263.376 para 651.662 bytes. O mapeamento está em `carousel-media.json`.

As imagens são pré-carregadas na seleção das fotos e novamente verificadas antes de liberar o avanço. A legenda de exemplos ilustrativos de IA permanece visível. Não são apresentadas como depoimentos ou avaliações de compradores.

## Comportamento

- Imagem 1 de 0 a 2 segundos, imagem 2 de 2 a 4 e imagem 3 de 4 a 6, sem repetição.
- Swipe, setas do teclado e três indicadores permitem escolher uma imagem. Após interação, a escolha manual não é substituída pelo relógio.
- A barra mede a transição da interface; o estado de salvamento é independente. Ao completar seis segundos, a tela continua aguardando dados e imagens, se necessário.
- Continuar só habilita após concluir a preparação. A próxima etapa é persistida antes do fade de 280 ms e da navegação; cliques concorrentes não navegam duas vezes.
- Movimento reduzido desativa o avanço animado entre imagens e o fade; os indicadores continuam funcionando.
- Falha em rede, imagens ou salvamento mantém a tela com erro e opção de tentar novamente. A chave idempotente é preservada. Solicitações pendentes são canceladas ao sair da página.

## Persistência e integração

O registro IndexedDB existente passa a guardar fotos, cenário, chave de idempotência, etapa, início da transição e ID remoto quando presente. Os campos são salvos juntos, a transação precisa terminar antes de confirmar sucesso e a expiração de 12 horas é mantida. Rascunhos antigos continuam legíveis.

Com D1 e Supabase disponíveis, a preparação reutiliza a API existente para registrar o pedido antes de abrir a oferta. A tela aguarda o upload efetivo; em recargas ou retries usa a mesma chave. Um pedido já registrado é recuperado por sua sessão e ID, sem reenviar as fotos. O checkout recebe o mesmo pedido e mantém suas regras de pagamento.

Atualização Kirvano: a preparação exige armazenamento real antes de avançar. Sem armazenamento, preserva o rascunho local e exibe erro com Tentar novamente/Revisar fotos; não abre oferta nem cria um ID remoto fictício. O armazenamento de produção agora utiliza o bucket privado Supabase descrito em SUPABASE.md.

## Verificação

57 testes aprovados (suíte ampliada com a migração Supabase), TypeScript sem erros e build de produção concluído. O navegador confirmou enquadramento integral, gesto de deslizar e ausência de rolagem em 360×640, 375×740, 390×844 e 430×932. O fluxo local confirmou registro real, avanço automático e preservação do pedido após atualizar a página. Consulte `VALIDACAO.md` para os casos de falha e os limites do teste remoto.

Na entrega anterior do carrossel, a conferência em `https://trilhadoamor.site/` confirmou a entrada na transição após duas fotos fictícias, as três recriações anexadas carregadas e o avanço à oferta. A captura da tela publicada foi feita durante a transição, sem conteúdo de teste sobreposto.
