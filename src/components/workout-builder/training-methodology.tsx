import type { TrainingMethodology } from "@/shared/training-methodology";
import styles from "./workout-builder.module.css";
import detailStyles from "./training-methodology.module.css";

export function TrainingMethodologyDetails({ methodology }: { methodology: TrainingMethodology }) {
  return (
    <details className={`${styles.plannerExclusions} ${detailStyles.root}`}>
      <summary className={detailStyles.summary}>Почему так подобрано?</summary>
      <p className={styles.plannerHint}>{methodology.title}</p>
      <ul className={detailStyles.principles}>
        {methodology.principles.map((principle) => (
          <li key={principle.id}>
            <strong>{principle.title}</strong>
            <p>{principle.explanation}</p>
          </li>
        ))}
      </ul>
      {methodology.sources.length ? (
        <>
          <p className={styles.plannerHint}>Источники и пояснения</p>
          <ul className={detailStyles.sources}>
            {methodology.sources.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
                <small>
                  {source.role === "practical_explanation"
                    ? "Практическое объяснение"
                    : "Научная основа"}
                </small>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.plannerHint}>
          Это отдельная редакционная последовательность. Источники силовой методики к ней не
          приписываются.
        </p>
      )}
    </details>
  );
}
