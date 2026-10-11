export const CATALOG_CONTEXTS = {
  gym: "Зал",
  home: "Дом",
  outdoor: "Улица / природа",
  workout_park: "Воркаут-площадка",
} as const;

export const CATALOG_DIRECTIONS = {
  strength: "Силовые",
  calisthenics: "Калистеника",
  yoga: "Йога",
  stretch: "Стретчинг",
  mobility: "Мобильность",
} as const;

export const MUSCLE_GROUPS = {
  chest: "Грудь",
  back: "Спина",
  lower_back: "Разгибатели спины",
  shoulders: "Плечи",
  biceps: "Бицепс",
  triceps: "Трицепс",
  forearms: "Предплечья",
  abs: "Пресс",
  obliques: "Косые мышцы",
  glutes: "Ягодицы",
  quads: "Передняя поверхность бедра",
  hamstrings: "Задняя поверхность бедра",
  calves: "Икры",
  hip_flexors: "Сгибатели бедра",
  adductors: "Внутренняя поверхность бедра",
  hip_abductors: "Отводящие мышцы бедра",
  neck: "Шея",
  feet: "Мышцы стопы",
} as const;

export type CatalogContext = keyof typeof CATALOG_CONTEXTS;
export type CatalogDirection = keyof typeof CATALOG_DIRECTIONS;
export type MuscleGroup = keyof typeof MUSCLE_GROUPS;
export type MuscleRole = "primary" | "secondary" | "stabilizer";

export const WORKOUT_ROLES = {
  warmup: "Разминка",
  main: "Основная часть",
  accessory: "Дополнение",
  skill: "Практика навыка",
  cooldown: "Заминка",
  recovery: "Восстановление",
} as const;

export const EXERCISE_PURPOSES = {
  strength: "Сила",
  hypertrophy: "Рост мышц",
  endurance: "Выносливость",
  mobility: "Подвижность",
  flexibility: "Гибкость",
  skill: "Навык",
  balance: "Баланс",
  relaxation: "Расслабление",
} as const;

// Motor-skill admission is distinct from difficulty, training slot and desired outcome.
export type CatalogSkillDemand =
  | { kind: "none" | "preparation"; requiresPriorSkill: false; rationale: string }
  | { kind: "movement"; requiresPriorSkill: true; rationale: string };

export interface CatalogEditorialEnrichment {
  skillDemand: CatalogSkillDemand;
  workoutRoles: (keyof typeof WORKOUT_ROLES)[];
  purposes: (keyof typeof EXERCISE_PURPOSES)[];
  canonical: boolean;
  discoveryPriority: number;
  priorityBasis: "editorial";
  searchKeywords: string[];
  execution: {
    addedLoad: "none" | "required" | "optional";
    assistance: "none" | "band" | "counterweight";
    countSemantics: "total_reps" | "per_side_reps" | "total_seconds" | "per_side_seconds";
    repetitionUnit: "movement" | "left_right_pair" | "not_applicable";
    assignmentGate: "standard_review" | "skill_review";
  };
}

// V1 files remain editorial inputs. A keyed V2 overlay adds independently reviewed metadata.
export interface CatalogEditorialOverlay extends CatalogEditorialEnrichment {
  displayNameRu?: string;
  additionalAliases?: string[];
  focusMode?: CatalogEditorial["focusMode"];
}

// Editorial classification lives on a draft revision; it is not a training prescription.
export interface CatalogEditorial extends CatalogEditorialEnrichment {
  displayNameRu: string;
  formalNameRu: string;
  aliases: string[];
  contexts: CatalogContext[];
  directions: CatalogDirection[];
  difficulty: "beginner" | "intermediate" | "advanced";
  sideMode: "bilateral" | "alternating" | "per_side" | "none";
  focusMode: "loading" | "stretch" | "mobility" | "balance" | "relaxation";
  cues: string[];
  mistakes: string[];
  optionalEquipment: string;
  sourceRefs: string[];
  reviewStatus: "pending_expert_review";
  relations: {
    alternatives: string[];
    regressions: string[];
    progressions: string[];
    status: "draft";
  };
}

export interface SkillGraphDraft {
  code: string;
  nameRu: string;
  revision: number;
  status: "draft";
  reviewStatus: "pending_expert_review";
  sourceRefs: string[];
  nodes: {
    id: string;
    variantId: string;
    skillGroup: string;
    prerequisiteMode: "all" | "any";
    assessment: "manual_coach_review";
    assessmentNotes: string[];
  }[];
  edges: {
    from: string;
    to: string;
    kind: "prerequisite" | "preparation";
    sourceRefs: string[];
  }[];
}

export interface CatalogSeedRow {
  id: string;
  familyId: string;
  familyNameRu: string;
  aliasEn: string;
  discipline: "strength" | "yoga" | "stretch" | "mobility";
  pattern: string;
  resistanceMode: "bodyweight" | "external_load" | "machine_load" | "assisted_bodyweight";
  metric: "reps" | "time";
  equipmentRequirement: string;
  supportRequirement: string;
  spaceRequirement: string;
  editorial: CatalogEditorial;
  muscles: { group: MuscleGroup; role: MuscleRole }[];
}
