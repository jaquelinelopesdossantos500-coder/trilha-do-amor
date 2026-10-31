# Validação atual — Supabase (31/10/2026)

57 testes aprovados: 13 backend legado, 14 Kirvano, 18 interface/transição e 12 Supabase. TypeScript e build aprovados. Gravação, leitura com bytes idênticos, bloqueio de acesso público/anônimo e exclusão foram testados no Supabase real. Security Advisors sem ocorrências. A migração D1 0004 adiciona limpeza durável para uploads com resultado incerto, inclusive após nova tentativa. Veja [SUPABASE.md](SUPABASE.md).

A reautorização da instalação GitHub em 31/10/2026 restabeleceu a gravação em `jaquelinelopesdossantos500-coder/trilha-do-amor`. O commit inicial remoto `b4183ed6d4701658ece4c72b32bebb74c35200b5` confirmou que a recusa 403 anterior foi resolvida. Os fontes e mídias da versão validada são publicados na branch `main`. Pagamento real, IDs de produto/oferta, webhook/retorno Kirvano e WhatsApp oficial continuam pendentes. Não foi realizada compra real.

## Republicação e recuperação do pedido

Em 31/10/2026, a API Cloudflare confirmou HTTP 200 e sucesso na versão `5c06dbf2f7664b659226c5d16d65e71c`. A publicação preservou os 34 assets, DB, os dois secrets, domínio, cron e Supabase; zero bindings R2. Os 51 módulos publicados correspondem ao build já validado, sem alteração no código de execução. A anotação `local-bf0ec84` identifica a fonte local, não um commit remoto GitHub.

No domínio público, a sessão recuperou o mesmo pedido de QA `TDA-214570B6B5BF4115` e as duas imagens privadas (ambas decodificadas em 256×256). “Continuar com este pedido” exibiu o carrossel, confirmou fotos salvas e avançou automaticamente à oferta de R$ 27,90, mantendo cenário e ID. Não houve reenvio das fotos, nova cobrança ou compra real. As alterações posteriores a essa publicação são apenas documentação; a suíte de 57 testes, typecheck e build continua correspondendo ao código publicado.

---

# Histórico da entrega anterior — integração Kirvano


## Verificação automatizada

`pnpm run typecheck`: aprovado. `pnpm test`: 45 testes aprovados (13 backend legado, 14 integração Kirvano, 18 interface/transição). `pnpm run build`: aprovado. Não foi criada uma cobrança ou compra real. Os testes Kirvano usam payloads fictícios baseados na documentação oficial, com D1 e R2 reais no runtime local Miniflare.

| Caso solicitado | Evidência e resultado |
| --- | --- |
| A — Cenários | Quatro chaves canônicas salvas corretamente, preservando IDs de mídia e prévias existentes |
| B — Fotos | Dois objetos R2 privados, bytes recuperados e formato/extensão corretos; D1 só fica pronto após ambas as gravações |
| C — Inválidos | Tipo/MIME real, dimensões e limites; arquivo inadequado exibe erro, sem lista permanente. Arquivo Markdown rejeitado no navegador |
| D — ID | UUID backend + número TDA aleatório; chave do cliente não controla o ID; repetição não duplica |
| E — Persistência | Cenário/fotos recuperáveis por backend autorizado; isolamento por sessão; ID curto não libera acesso |
| F — Checkout | URL oficial exata com `src` persistido; sem contatos no corpo; exige os dois objetos salvos. Abertura externa real bloqueada por verificação humana da Kirvano |
| G — Webhook | Token inválido/ausente, configuração incompleta, produto/oferta/valor/data/correlação inválidos, duplicidade, concorrência, pendência, expiração, recusa, aprovação, reembolso e chargeback cobertos |
| H — Pós-compra | Sem aprovação pela URL; estado real consultado; mensagem e ID no link WhatsApp correto em teste; retorno pendente funciona mesmo sem R2 |
| I — Sem WhatsApp | Webhook persiste venda, aprovação, contatos e fotos sem qualquer clique no botão |
| J — Mobile | Fluxo completo em viewport interno de 360px; confirmação/restauração sem rolagem horizontal em 360/375/390/430px; pagamento somente simulado local |

Também cobertos: rollback de upload parcial, expiração/limpeza, exclusão autenticada com confirmação na interface, impossibilidade de usar a mesma venda em dois pedidos e preservação de pedido já reembolsado. Aprovações duplicadas não renovam retenção ou entrega.

## Carrossel preservado

A suíte verifica as três imagens fornecidas em 0/2/4 segundos, progresso, espera pelo upload real, Continuar antecipado apenas após salvar, swipe/indicadores sem loop, falha de rede/retry, falha de imagem, falha de checkpoint, movimento reduzido, rascunho atômico, recarga antes/depois de upload, resposta perdida e Strict Mode sem duplicação. A versão Kirvano exige upload real antes da oferta; sem R2, o erro mantém fotos e permite Revisar fotos/Tentar novamente.

As três fotos 896×1200 foram preservadas em WebP com enquadramento integral e sem gerar imagens substitutas (651.662 bytes no total). Os quatro vídeos de cenário foram preservados: MP4 H.264, 432×768, 24fps, sem áudio, faststart, carga sob demanda; aproximadamente 1,12 MB no total, redução anterior de 90,47% sobre os originais. Não foi feito benchmark de rede móvel.

## Conferência no navegador local

Selecionado O abraço na luz; prévia e navegação para envio; arquivo inadequado rejeitado; duas fotos fictícias validadas; transição automática; pedido `TDA-9C6654D2C13041A9` registrado antes da oferta; oferta de R$ 27,90 sem campos de contato; botão abre simulador local sem fornecer dados pessoais. Pendência mostra mensagem de espera; aprovação simulada mostra pagamento confirmado e produção aguardando, mantendo o mesmo cenário/ID após recarregar. Larguras internas conferidas por DOM: 360/375/390/430px, todas com scrollWidth igual à largura.

O harness mobile existiu apenas durante o QA e foi removido do código e dos assets publicados. O simulador é restrito ao desenvolvimento e bloqueado na produção.

## Limites da homologação remota

A API Cloudflare exige ativação R2 pelo painel (10042). Não foi possível enviar/baixar fotos em produção sem bucket. O GitHub não retorna repositórios acessíveis; branch/commits locais não equivalem a push remoto. IDs de produto/oferta, secret do webhook, número oficial WhatsApp e acesso à configuração Kirvano estão ausentes. O checkout oficial exibiu verificação humana neste navegador e não foi contornada. Produto, preço, meios de pagamento e retorno/webhook do painel não puderam ser conferidos.

Portanto, o código e as simulações passaram; compra real, entrega efetiva de webhook Kirvano com `utm.src`, armazenamento de fotos em produção e botão com o número Business real ainda dependem das configurações descritas em KIRVANO.md. Não declarar o funil pronto para anúncios até concluir essa validação.

## Publicação conferida

Deploy Cloudflare realizado em 31/10/2026 UTC, versão `fa72d437fc4d4ede884bbfec9549ae56`, no mesmo Worker/domínio. API retornou sucesso; configuração remota preservou DB/ASSETS/SESSION_SECRET, cron horário, domínio e query strings redigidas nos logs. Navegador público confirmou oferta sem formulário, sem aviso de teste/pré-lançamento; `api/config` informa `mode=kirvano`, `sessionReady=true`, `storageReady=false`, `checkoutReady=false`, `testEnvironment=false`. Tentativa de pagamento sem R2 retorna erro compreensível e preserva o rascunho. `/obrigado` sem pedido autenticado apresenta localização segura, sem aprovar uma compra.

O navegador ainda possuía um rascunho local de QA anterior, que permitiu conferir a oferta publicada. Novos envios percorrem a preparação com espera obrigatória pelo salvamento. Nenhuma cobrança real foi aberta. A conferência HTTP direta pelo executor não retornou JSON utilizável; a configuração pública foi conferida pelo navegador, e os casos negativos da API continuam cobertos pela suíte local.

## Conferência pública da migração Supabase

Versão final `8adfd9ac947647d1ae650b1c19e52cc6`. Envio real pelo navegador no domínio trilhadoamor.site, carrossel e oferta concluídos com o pedido de teste `TDA-214570B6B5BF4115`. Fotos recuperadas pela API privada, ambas decodificadas pelo navegador (256×256); o Supabase confirmou os dois objetos de 3.433 bytes. Recarregar preservou o ID e não criou outro pedido. O registro foi marcado `is_test=1`, sem aprovação ou compra real. A diferença entre Fetch Node e Workerd foi corrigida com redirecionamento manual; teste de integração no runtime Workerd cobre o ciclo de armazenamento inteiro. Resultado final: 57 testes aprovados, typecheck e build aprovados. R2 removido das dependências de produção.
