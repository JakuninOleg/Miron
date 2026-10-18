import Image from "next/image";
import styles from "./auth-screen.module.css";

/** Contact shadows share the foreground alpha, so feet stay grounded at every scale. */
export function AuthScene() {
  return (
    <>
      <div className={styles.backdrop} aria-hidden="true" data-testid="auth-backdrop">
        <Image
          src="/visuals/soft-3d/auth/studio-v2.webp"
          alt=""
          fill
          sizes="100vw"
          loading="eager"
          unoptimized
        />
      </div>
      <div className={styles.art} aria-hidden="true" data-testid="auth-scene">
        <Image
          src="/visuals/soft-3d/auth/companions-anatomy-v4.webp"
          alt=""
          width={1342}
          height={1264}
          sizes="(max-width: 700px) 100vw, 60vw"
          loading="eager"
          unoptimized
        />
      </div>
    </>
  );
}
