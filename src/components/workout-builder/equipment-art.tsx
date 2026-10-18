import Image from "next/image";
import type { EquipmentArt as Art } from "@/shared/workout-inventory";
import styles from "./equipment-art.module.css";

/** Illustrations describe equipment; they are not exercise technique instructions. */
export function EquipmentArt({ art, paired = false }: { art: Art; paired?: boolean }) {
  const duplicate = paired && (art === "dumbbell" || art === "kettlebell");
  return (
    <span className={styles.art} data-paired={duplicate} aria-hidden="true">
      {Array.from({ length: duplicate ? 2 : 1 }, (_, index) => (
        <span key={index} className={styles.object}>
          <Image
            unoptimized
            src={`/visuals/soft-3d/equipment/${art}.webp`}
            alt=""
            fill
            sizes="(max-width: 700px) 43vw, 200px"
          />
        </span>
      ))}
    </span>
  );
}
