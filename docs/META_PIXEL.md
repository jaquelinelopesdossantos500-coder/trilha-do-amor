# Meta Pixel

Pixel: 1278560048663680. Carregamento assíncrono após aceitar a medição de anúncios, com preferências disponíveis no rodapé. A recusa não interfere no upload, checkout ou WhatsApp.

- PageView: uma vez por carregamento autorizado.
- ViewContent: oferta de um pedido real salvo.
- InitiateCheckout: backend retornou o endereço do checkout, antes do redirecionamento.
- Purchase: apenas após consultar paymentStatus=approved no backend; exclui pedidos de teste e usa o valor efetivamente pago, incluindo order bumps.
- Contact: clique no link do WhatsApp.

Eventos por pedido usam eventID estável e registro local para evitar repetição ao atualizar ou consultar o pagamento. Nenhuma compra é inferida pelo acesso a /obrigado. O carregamento e os eventos não bloqueiam o funil em caso de indisponibilidade da Meta.

AutoConfig está desativado para evitar coleta automática dos campos do site. Os parâmetros explícitos usam produto genérico, moeda e valor; não incluem fotos, nomes, e-mails, telefone, cenário ou chaves de arquivos. O SDK da Meta coleta metadados de navegação, incluindo URL/referrer e identificadores do navegador, conforme sua implementação.

A integração é pelo navegador. Não há API de Conversões sem token de acesso da Meta. Se o comprador fechar o navegador ou bloquear o Pixel, Purchase pode não ser recebido. Validar uma compra real em Gerenciador de Eventos → Testar eventos. O checkout Pulsefy é outro domínio: esta instalação não altera a configuração de pixel do painel Pulsefy.
