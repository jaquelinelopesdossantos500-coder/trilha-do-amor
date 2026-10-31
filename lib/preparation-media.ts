export const PREPARATION_DURATION_MS = 6000;
export const PREPARATION_SLIDE_MS = 2000;
export const PREPARATION_FADE_MS = 280;

export const PREPARATION_IMAGES = [
  {
    src: "/media/stories/abraco-na-varanda.webp",
    alt: "Ilustração de uma filha adulta abraçando sua mãe idosa na varanda de uma casa brasileira.",
    caption: "Tem pessoas que deixam saudade em uma família inteira. 💛",
  },
  {
    src: "/media/stories/cafe-em-familia.webp",
    alt: "Ilustração de uma neta adulta e sua avó compartilhando um café em uma cozinha brasileira.",
    caption: "Uma fotografia pode trazer tantas histórias de volta...",
  },
  {
    src: "/media/escadaria.webp",
    alt: "Recriação artística de duas pessoas de braços abertos para um reencontro em uma escadaria dourada entre nuvens.",
    caption: "Uma homenagem para guardar... e compartilhar com quem também sente saudade.",
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
