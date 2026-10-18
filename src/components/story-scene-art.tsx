import Image from "next/image";

export type StoryScene = "interests" | "choose" | "prepare" | "finish";

const descriptions: Record<StoryScene, string> = {
  interests: "Тёплая студия MIRON для выбора направлений тренировок",
  choose: "Макс и Лика в общей студии — оба напарника видны целиком",
  prepare: "Спортивная сумка, гантели, полотенце и шейкер в студии MIRON",
  finish: "Макс и Лика приветствуют друг друга касанием кулаков",
};

export function StorySceneArt({ scene, className }: { scene: StoryScene; className: string }) {
  return (
    <picture className={className} data-art={scene}>
      <source
        media="(max-aspect-ratio: 6/5) and (min-height: 451px)"
        srcSet={`/visuals/soft-3d/scenes/${scene}-mobile-v2.webp`}
      />
      <Image
        unoptimized
        src={`/visuals/soft-3d/scenes/${scene}-v2.webp`}
        alt={descriptions[scene]}
        fill
        sizes="100vw"
        loading="eager"
      />
    </picture>
  );
}
