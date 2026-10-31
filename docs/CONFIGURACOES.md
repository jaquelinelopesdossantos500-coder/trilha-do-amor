# Configuração do ambiente

A implantação atual usa a conta, Worker, domínio e D1 existentes. Não criar outro repositório ou outra infraestrutura. Fluxo de pagamento de produção: Kirvano. Detalhes de homologação em [KIRVANO.md](KIRVANO.md).

| Nome | Valor/finalidade | Situação atual |
| --- | --- | --- |
| `DB` | D1 `trilha-do-amor`, ID `b456360d-cd3a-49e9-b723-76d2c1c5b077` | Configurado; migrações 0000–0004 aplicadas |
| `PHOTO_STORAGE_PROVIDER` | `supabase` | Configurado |
| `SUPABASE_STORAGE_URL` | Função `tda-photo-storage` do projeto `yllbzrbyjaaksdsqcmiq` | Configurada e validada |
| `SUPABASE_STORAGE_PRIVATE_KEY` | Chave privada ECDSA de integração, tipo Secret | Configurada; preservar |
| `SESSION_SECRET` | Secret aleatório do acesso aos pedidos | Configurado; preservar o valor existente |
| `PAYMENT_MODE` | `kirvano` | Configurado |
| `KIRVANO_CHECKOUT_URL` | `https://pay.kirvano.com/abed794c-74c4-4493-810f-b9a4708a56e4` | Configurado |
| `KIRVANO_PRODUCT_ID` | ID real do produto de R$ 27,90 | Não fornecido |
| `KIRVANO_OFFER_ID` | ID real da oferta correspondente | Não fornecido; não deduzir da URL |
| `KIRVANO_WEBHOOK_TOKEN` | Secret de 32 bytes aleatórios ou mais, compartilhado com a URL de webhook | Pendente de configuração segura nos dois serviços |
| `ENABLE_LIVE_PAYMENTS` | Autoriza abrir o checkout hospedado informado pelo responsável | `true`; não aprova pagamentos nem dispensa autenticação de webhook |
| `WHATSAPP_NUMBER` | Número oficial: `55` + DDD + telefone, só dígitos | `5553991905194`, informado pelo responsável |
| `PUBLIC_BASE_URL` | `https://trilhadoamor.site` | Configurado |
| `DELIVERY_DAYS` | Dias úteis de produção | `2`; confirmar prazo praticado no checkout |
| `RETENTION_DAYS` | Retenção das fotos após primeira confirmação de pagamento | `30` |
| `UNPAID_RETENTION_HOURS` | Retenção dos uploads sem pagamento | `48` |
| `APP_ENV` | `production` | Configurado; simulador bloqueado nesse ambiente |
| `SUPPORT_EMAIL` | E-mail comercial monitorado | Não fornecido |
| `BUSINESS_NAME`, `BUSINESS_DOCUMENT`, `BUSINESS_ADDRESS` | Identificação real do vendedor para políticas | Não fornecida; sem dados fictícios publicados |
| `AI_PROVIDER_NAME` | Ferramenta utilizada na produção manual | Não fornecida |
| `POLICIES_APPROVED` | Registro interno de revisão dos dados/políticas | `false`; não é gate de checkout Kirvano |
| `ADMIN_PASSWORD_HASH` | Secret PBKDF2 do painel legado | Não configurado em produção; não necessário para operação via console Cloudflare |

Não colocar secrets em `vars`, frontend, Git, prints ou chat. Configure `KIRVANO_WEBHOOK_TOKEN` em Workers → trilha-do-amor → Settings → Variables and Secrets, tipo Secret, ou com a entrada interativa do Wrangler. Compartilhe a mesma chave apenas na URL cadastrada na Kirvano. Não rotacionar `SESSION_SECRET`: a troca invalida a sessão de acompanhamento dos clientes.

`WHATSAPP_NUMBER` é público por natureza; o botão abre uma conversa com ID e mensagem preenchidos, sem envio automático. Os dados de contato do comprador são preenchidos só na Kirvano e recebidos por webhook. Não foi implementada API de WhatsApp, e-mail transacional ou geração automática com IA. Produção, suporte e entrega são manuais.

Desenvolvimento local continua usando `PAYMENT_MODE=simulation` e arquivos fictícios. O adaptador antigo Mercado Pago foi preservado para evitar remoção de dependências históricas, mas não é selecionado pelo fluxo Kirvano. Suas credenciais não substituem as configurações Kirvano e não devem ser incluídas para esta entrega.

As fotos já usam o bucket privado Supabase `trilha-do-amor-fotos`; não existe dependência R2 na produção. A função Supabase usa suas próprias credenciais nativas de servidor. Não é necessário fornecer ou copiar uma chave `service_role` para Cloudflare ou frontend. Veja SUPABASE.md.
