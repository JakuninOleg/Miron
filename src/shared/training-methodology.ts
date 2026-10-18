import type { CatalogDirection } from "./catalog-taxonomy";

export interface TrainingSource {
  id: string;
  title: string;
  url: string;
  role: "evidence" | "practical_explanation";
  reviewedAt: string;
}
export interface TrainingPrinciple {
  id: string;
  title: string;
  explanation: string;
  sourceIds: string[];
}
interface MethodologyBase {
  version: string;
  title: string;
  principles: TrainingPrinciple[];
  sources: TrainingSource[];
}
export type TrainingMethodology =
  | (MethodologyBase & { kind: "strength"; effort: { minRir: 2; maxRir: 3 } })
  | (MethodologyBase & { kind: "yoga"; sequence: "whole" })
  | (MethodologyBase & { kind: "stretch"; progression: "comfortable_range" })
  | (MethodologyBase & { kind: "mobility"; progression: "controlled_range" });

export interface StrengthStepCoaching {
  kind: "strength";
  effortHint: string;
  repetitionsInReserve?: { min: 2; max: 3 };
  progression: "learn" | "repeat" | "ease" | "discuss_progression";
  explanation: string;
  basedOnWorkoutIds: string[];
  sourceIds: string[];
}

const sources: TrainingSource[] = [
  {
    id: "acsm-2026",
    title: "ACSM: силовые тренировки для здоровых взрослых, 2026",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/",
    role: "evidence",
    reviewedAt: "2026-10-17",
  },
  {
    id: "supersets-2025",
    title: "Суперсеты и обычные подходы: систематический обзор, 2025",
    url: "https://pubmed.ncbi.nlm.nih.gov/39903375/",
    role: "evidence",
    reviewedAt: "2026-10-17",
  },
  {
    id: "nippard-practice",
    title: "Джефф Ниппард: замены упражнений и организация занятия",
    url: "https://jeffnippard.com/products/the-ultimate-push-pull-legs-system",
    role: "practical_explanation",
    reviewedAt: "2026-10-17",
  },
  {
    id: "drop-sets-2026",
    title: "Дропсеты: нагрузка и долгосрочные результаты, метаанализ 2026",
    url: "https://pubmed.ncbi.nlm.nih.gov/41920484/",
    role: "evidence",
    reviewedAt: "2026-10-17",
  },
];

export function isStrengthDirection(direction: CatalogDirection): boolean {
  return direction === "strength" || direction === "calisthenics";
}

/** Public editorial rules. Exact dose thresholds are MIRON policy, not quoted prescriptions. */
export function trainingMethodology(direction: CatalogDirection): TrainingMethodology {
  if (isStrengthDirection(direction))
    return {
      kind: "strength",
      version: "strength-evidence-v2",
      title: "Силовые: посильная нагрузка и постепенный прогресс",
      effort: { minRir: 2, maxRir: 3 },
      sources: sources.map((source) => ({ ...source })),
      principles: [
        {
          id: "weekly_volume",
          title: "Распределяем работу на неделю",
          explanation:
            "Частота помогает разместить нагрузку в расписании. Добавление дня full body распределяет выбранный объём, а не умножает его.",
          sourceIds: ["acsm-2026"],
        },
        {
          id: "effort",
          title: "Оставляем немного сил",
          explanation:
            "Для обычных силовых подходов на повторения ориентир — запас примерно на 2–3 повтора с управляемой техникой. Это приблизительная самооценка, а не обязательный отказ.",
          sourceIds: ["acsm-2026"],
        },
        {
          id: "progression",
          title: "Следующий шаг опирается на результат",
          explanation:
            "Смотрим фактические подходы и твою оценку. Повышение веса не выполняется автоматически; следующий шаг можно обсудить после уверенных повторений.",
          sourceIds: ["acsm-2026"],
        },
        {
          id: "substitution",
          title: "Подбираем сопоставимые замены",
          explanation:
            "Учитываем движение, основной мышечный акцент, оборудование и уровень. Вес другого упражнения не переносится.",
          sourceIds: ["acsm-2026", "nippard-practice"],
        },
        {
          id: "pairs",
          title: "Суперсеты помогают сократить занятие",
          explanation:
            "Чередуем совместимые движения и сохраняем отдых между кругами. Пары могут ощущаться тяжелее; короткая пауза не обязательна для всех упражнений.",
          sourceIds: ["supersets-2025"],
        },
        {
          id: "drop_sets",
          title: "Дропсет — дополнительный выбор",
          explanation:
            "Снижение веса продолжает последний подход и может экономить время. Исследования не показывают устойчивого преимущества в росте мышц перед обычными подходами, а субъективная нагрузка выше. В MIRON это необязательный вариант для ограниченного списка упражнений; выполнять до отказа не требуется.",
          sourceIds: ["drop-sets-2026"],
        },
      ],
    };
  if (direction === "yoga")
    return {
      kind: "yoga",
      version: "yoga-sequence-v1",
      title: "Йога: цельная практика",
      sequence: "whole",
      sources: [],
      principles: [
        {
          id: "sequence",
          title: "Сохраняем последовательность",
          explanation:
            "Порядок поз, переходы и обе стороны закреплены в выбранном комплексе. Для другой практики выбираем целую последовательность.",
          sourceIds: [],
        },
        {
          id: "practice",
          title: "Подбираем по условиям и опыту",
          explanation:
            "Длительность и доступные опоры учитываются отдельно. Силовой объём, запас повторений и увеличение веса здесь не используются.",
          sourceIds: [],
        },
      ],
    };
  if (direction === "stretch")
    return {
      kind: "stretch",
      version: "stretch-range-v1",
      title: "Растяжка: комфортная амплитуда",
      progression: "comfortable_range",
      sources: [],
      principles: [
        {
          id: "regions",
          title: "Учитываем выбранные области и стороны",
          explanation:
            "В комплексе сохраняются порядок и обе стороны; удержания и активные движения имеют собственную дозировку.",
          sourceIds: [],
        },
        {
          id: "comfort",
          title: "Избегаем форсирования",
          explanation:
            "Ориентируемся на комфорт движения. Силовые подходы, запас повторений и прибавка веса к растяжке не применяются.",
          sourceIds: [],
        },
      ],
    };
  return {
    kind: "mobility",
    version: "mobility-control-v1",
    title: "Мобильность: управляемое движение",
    progression: "controlled_range",
    sources: [],
    principles: [
      {
        id: "control",
        title: "Сохраняем контроль движения",
        explanation:
          "Выбираем доступную последовательность с подходящими опорами и работой обеих сторон.",
        sourceIds: [],
      },
      {
        id: "range",
        title: "Усложняем по качеству движения",
        explanation:
          "Ориентир — управляемая амплитуда. Силовая прогрессия веса и подсчёт недельных силовых подходов не применяются.",
        sourceIds: [],
      },
    ],
  };
}
