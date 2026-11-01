/** Shared by the thank-you page and transactional email. Never includes photo URLs. */
export function orderWhatsappUrl(number: string | null | undefined, orderNumber?: string) {
  if (!/^55\d{10,11}$/.test(number || "")) return null;
  const message = orderNumber
    ? `Olá! 💛 Quero receber o material da minha homenagem do Trilha do Amor pelo WhatsApp.\n\nMeu pedido é: ${orderNumber}\n\nPode conferir meu pagamento e me orientar sobre a entrega?`
    : "Olá! 💛 Quero receber o material da minha homenagem do Trilha do Amor pelo WhatsApp. Pode me ajudar a localizar meu pedido e conferir o pagamento?";
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
