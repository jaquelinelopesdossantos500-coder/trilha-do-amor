export const PREPARATION_DURATION_MS = 6000;
export const PREPARATION_SLIDE_MS = 2000;
export const PREPARATION_FADE_MS = 280;

export const PREPARATION_IMAGES = [
  {
    src: "/media/recreations/reencontro-familiar.webp",
    alt: "Recriação ilustrativa de um homem abraçando uma senhora em uma varanda com vegetação.",
    caption: "Um abraço que vive para sempre na memória.",
  },
  {
    src: "/media/recreations/memorias-de-familia.webp",
    alt: "Recriação ilustrativa de uma mulher sorrindo ao lado de um senhor idoso ao ar livre.",
    caption: "O amor atravessa gerações.",
  },
  {
    src: "/media/recreations/lembranca-especial.webp",
    alt: "Recriação ilustrativa de uma mulher segurando uma fotografia de um abraço com uma senhora.",
    caption: "Porque existem pessoas que nunca deixam nosso coração.",
  },
] as const;

export async function preloadPreparationImages() {
  await Promise.all(PREPARATION_IMAGES.map(({ src }) => new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => finish(new Error("As imagens não carregaram. Confira sua conexão e tente novamente.")), 15000);
    function finish(error?: Error) {
      clearTimeout(timer); image.onload = null; image.onerror = null;
      if (error) reject(error); else resolve();
    }
    image.onload = () => finish();
    image.onerror = () => finish(new Error("Não foi possível carregar as imagens. Confira sua conexão e tente novamente."));
    image.decoding = "async";
    image.src = src;
  })));
}
