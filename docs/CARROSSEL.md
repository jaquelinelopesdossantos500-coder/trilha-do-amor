# Stories entre fotografias e oferta

A experiência aprovada reutiliza a navegação, o estado e a preparação de pedidos existentes. `ReunionPreparation` controla tempo, pausa e finalização; `FamilyStoryMockup` apresenta o smartphone e os Stories. O funil continua responsável pelo upload idempotente, recuperação e checkpoint antes da oferta. Backend, checkout e webhooks foram preservados.

## Imagens e identificação

As duas ilustrações de pessoas fictícias, geradas para demonstração, são `public/media/stories/abraco-na-varanda.webp` e `cafe-em-familia.webp`. O terceiro Story reutiliza `public/media/escadaria.webp`. O conjunto tem 261.356 bytes. As imagens anteriores permanecem no repositório como histórico e não são carregadas pela nova sequência.

“Memórias em Família” identifica um mockup, acompanhado de “Exemplo ilustrativo” e “Exemplos ilustrativos de recriações com IA”. Não há métricas, comentários ou depoimentos de compradores, nem uso de suas fotos privadas na demonstração.

## Comportamento

- Seis segundos: três Stories em 0/2/4 segundos, sem loop, com crossfade, movimento fotográfico discreto e barras sequenciais.
- Indicadores, swipe e setas do teclado permitem escolher um Story; a escolha manual não é substituída pelo relógio.
- Pausar congela o tempo e o avanço automático. A entrada da legenda continua para garantir sua leitura. Retomar desconta o tempo pausado.
- Continuar só habilita após preparar o pedido e carregar as ilustrações. O checkpoint é salvo antes do fade de 280 ms; cliques concorrentes não navegam duas vezes.
- O progresso indica transição, não geração de vídeo. Upload pendente continua aguardando; falhas permitem retry ou revisão das fotos, com a mesma chave idempotente.
- Movimento reduzido remove as animações CSS, a profundidade do smartphone, a mudança automática de Story e o fade; controles manuais permanecem disponíveis.

## Banner da oferta

`LockedMemorialPreview` mantém a altura original de **160 px** e bordas de 15 px. Usa a imagem do cenário real do pedido, com `blur(8px)` apenas na imagem. O cadeado SVG dourado, o nome do cenário e a identificação de prévia ilustrativa permanecem nítidos. Os textos longos da primeira experiência foram removidos do card.

O pacote de R$ 27,90 continua fora do banner, com produção após confirmação do pagamento. O CTA “CRIAR MINHA HOMENAGEM 💛” chama a integração existente, preservando a associação do pedido.

## Persistência e validação

IndexedDB mantém fotos/rascunho, cenário, chave idempotente, etapa, início e ID remoto. Pedido salvo é recuperado por sessão e ID sem repetir o upload. Fotos reais continuam privadas no Supabase; D1 mantém seus metadados.

60 testes aprovados, TypeScript e build limpo aprovados. QA local conferiu a sequência e a oferta em 360×800, 390×844, 430×932, 768×1024 e 1440×900. Pausa, barras completas, quatro cenários, falhas de rede, Strict Mode, recarga e retry fazem parte da suíte. Não houve compra real. Consulte `VALIDACAO.md` para os limites da homologação de pagamento.

A versão recebeu autorização explícita “APROVADO, PODE PUBLICAR”. A bancada de revisão, fotos fictícias de QA e artefatos de captura não fazem parte da publicação.
