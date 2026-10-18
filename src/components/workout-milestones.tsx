import Link from "next/link";
import { Award, BookOpen, Footprints, Flame, Trophy } from "lucide-react";
import type { Progress } from "@/shared/contracts";
import {
  newProgressMilestones,
  progressLevel,
  type ProgressMilestoneSnapshot,
} from "@/shared/progress-milestones";
import styles from "./workout-screen.module.css";
import { journeyState } from "@/shared/journey-story";

export function WorkoutMilestones({
  before,
  progress,
  showNew,
}: {
  before: ProgressMilestoneSnapshot;
  progress: Progress;
  showNew: boolean;
}) {
  const milestones = newProgressMilestones(before, {
    xp: progress.xp,
    completedWorkouts: progress.completedWorkouts,
    activityDays: progress.journey?.activityDays,
  });
  const icons = { first: Footprints, rhythm: Flame, return: Trophy };
  const availableChapter =
    before.activityDays === undefined && progress.journey && progress.journey.activityDays > 0
      ? journeyState(progress.journey.activityDays).current
      : null;
  return (
    <div className={styles.milestones}>
      <Link
        href="/progress"
        className={styles.level}
        aria-label={`Уровень ${progressLevel(progress.xp)}, ${progress.xp % 500} из 500 XP. Открыть прогресс`}
      >
        <span>
          <strong>Уровень {progressLevel(progress.xp)}</strong>
          <span>{progress.xp % 500} / 500 XP</span>
        </span>
        <progress max={500} value={progress.xp % 500} />
      </Link>
      {showNew ? (
        <div aria-live="polite" className={styles.unlocks}>
          {availableChapter ? (
            <Link href="/progress?section=story" className={styles.unlock}>
              <BookOpen size={30} />
              <span>
                Доступна глава твоей истории<strong>{availableChapter.title}</strong>
                <small>Все открытые главы остаются в прогрессе</small>
              </span>
            </Link>
          ) : null}
          {milestones.level ? (
            <Link href="/progress" className={styles.unlock}>
              <Award size={30} />
              <span>
                Новый уровень<strong>Уровень {milestones.level}</strong>
              </span>
            </Link>
          ) : null}
          {milestones.achievements.map((item) => {
            const Icon = icons[item.id];
            return (
              <Link href="/progress" key={item.id} className={styles.unlock}>
                <Icon size={30} />
                <span>
                  Новое достижение<strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
              </Link>
            );
          })}
          {milestones.chapters.map((item) => (
            <Link href="/progress?section=story" key={item.id} className={styles.unlock}>
              <BookOpen size={30} />
              <span>
                Новая глава твоей истории<strong>{item.title}</strong>
                <small>Читать, когда захочется</small>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
