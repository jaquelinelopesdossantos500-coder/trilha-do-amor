# Configuração do ambiente

A implantação atual usa a conta, Worker, domínio e D1 existentes. Não criar outro repositório ou outra infraestrutura. Fluxo de pagamento de produção: Pulsefy. Configuração do webhook e retorno em [PULSEFY.md](PULSEFY.md).

| Nome | Valor/finalidade | Situação atual |
| --- | --- | --- |
| `DB` | D1 `trilha-do-amor`, ID `b456360d-cd3a-49e9-b723-76d2c1c5b077` | Configurado; migrações 0000–0005 |
| `PHOTO_STORAGE_PROVIDER` | `supabase` | Configurado |
| `SUPABASE_STORAGE_URL` | Função `tda-photo-storage` do projeto `yllbzrbyjaaksdsqcmiq` | Configurada e validada |
| `SUPABASE_STORAGE_PRIVATE_KEY` | Chave privada ECDSA de integração, tipo Secret | Configurada; preservar |
| `SESSION_SECRET` | Secret aleatório do acesso aos pedidos | Configurado; preservar o valor existente |
| `PAYMENT_MODE` | `pulsefy` | Configurado |
| `PULSEFY_CHECKOUT_URL` | `https://pulsefy.shop/c/o8gsg5c` | Configurado |
| `PULSEFY_WEBHOOK_TOKEN` | Bearer compartilhado, tipo Secret | Configurado no Worker; copiar o token privado para o painel Pulsefy |
| `KIRVANO_CHECKOUT_URL` | Mantido para compatibilidade do adaptador legado | Não selecionado no modo Pulsefy |
| `KIRVANO_PRODUCT_ID` | Exclusivo do adaptador legado | Não usado no modo Pulsefy |
| `KIRVANO_OFFER_ID` | Exclusivo do adaptador legado | Não usado no modo Pulsefy |
| `KIRVANO_WEBHOOK_TOKEN` | Exclusivo do adaptador legado | Não usado no modo Pulsefy |
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
| `POLICIES_APPROVED` | Registro interno de revisão dos dados/políticas | `false`; não é gate de checkout Pulsefy |
| `ADMIN_PASSWORD_HASH` | Secret PBKDF2 do painel legado | Não configurado em produção; não necessário para operação via console Cloudflare |

Não colocar secrets em `vars`, frontend, Git, prints ou chat. O `PULSEFY_WEBHOOK_TOKEN` fica em Workers → trilha-do-amor → Settings → Variables and Secrets, tipo Secret. O mesmo valor deve ser cadastrado no campo Bearer token da Pulsefy; não colocar na URL. Não rotacionar `SESSION_SECRET`: a troca invalida a sessão de acompanhamento dos clientes.

`WHATSAPP_NUMBER` é público por natureza; o botão abre uma conversa com ID e mensagem preenchidos, sem envio automático. Os dados de contato do comprador são preenchidos só no checkout Pulsefy e recebidos por webhook. Não foi implementada API de WhatsApp, e-mail transacional ou geração automática com IA. Produção, suporte e entrega são manuais.

Desenvolvimento local continua usando `PAYMENT_MODE=simulation` e arquivos fictícios. O adaptador antigo Mercado Pago foi preservado para evitar remoção de dependências históricas, mas não é selecionado pelo fluxo Pulsefy. Suas credenciais não substituem as configurações Pulsefy e não devem ser incluídas para esta entrega.

As fotos já usam o bucket privado Supabase `trilha-do-amor-fotos`; não existe dependência R2 na produção. A função Supabase usa suas próprias credenciais nativas de servidor. Não é necessário fornecer ou copiar uma chave `service_role` para Cloudflare ou frontend. Veja SUPABASE.md.
