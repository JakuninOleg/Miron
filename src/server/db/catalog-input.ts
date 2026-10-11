import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  CATALOG_CONTEXTS,
  CATALOG_DIRECTIONS,
  EXERCISE_PURPOSES,
  MUSCLE_GROUPS,
  WORKOUT_ROLES,
  type CatalogSeedRow,
  type SkillGraphDraft,
} from "../../shared/catalog-taxonomy";
import { assertCatalogConsistency, validateSkillGraphs } from "./catalog-consistency";

export const CATALOG_RESOURCE_LABELS: Record<string, string> = {
  floor: "Подходящая поверхность пола",
  clear_space: "Свободное пространство",
  dumbbell: "Гантель",
  mat: "Коврик",
  yoga_block: "Блок для йоги",
  yoga_strap: "Ремень для йоги",
  stretch_strap: "Ремень для растяжки",
  resistance_band: "Эластичная лента",
  pull_up_bar: "Турник",
  stable_bench: "Устойчивая скамья",
  bench: "Скамья",
  barbell: "Штанга",
  kettlebell: "Гиря",
  weighted_vest: "Жилет-утяжелитель",
  dip_belt: "Пояс для отягощений",
  assisted_pull_up_machine: "Тренажёр для подтягиваний с противовесом",
  barbell_with_plates_and_collars: "Штанга, блины и замки",
  chest_press_machine: "Тренажёр для жима от груди",
  high_cable_station_with_rope: "Верхний блок с канатной рукоятью",
  lat_pulldown_machine_with_bar: "Верхний блок с перекладиной",
  leg_extension_machine: "Тренажёр для разгибания ног",
  leg_press_machine: "Тренажёр для жима ногами",
  low_horizontal_exercise_bar: "Низкая горизонтальная перекладина",
  seated_cable_row_station_with_handle: "Нижний блок с рукоятью для тяги сидя",
  seated_leg_curl_machine: "Тренажёр для сгибания ног сидя",
  bench_press_station_with_safeties: "Стойка для жима лёжа со страховочными упорами",
  machine_integrated_seat_and_backrest: "Сиденье и спинка тренажёра",
  machine_integrated_seat_and_foot_support: "Сиденье и опоры для стоп тренажёра",
  machine_integrated_seat_and_pads: "Сиденье и валики тренажёра",
  machine_integrated_seat_and_platform: "Сиденье и платформа тренажёра",
  machine_integrated_seat_and_thigh_pad: "Сиденье и упор для бёдер тренажёра",
  machine_integrated_support: "Встроенная опора тренажёра",
  secured_stable_bench: "Закреплённая устойчивая скамья",
  secured_stable_exercise_bench: "Закреплённая устойчивая тренировочная скамья",
  solid_doorframe: "Прочная дверная рама",
  solid_wall: "Прочная стена",
  squat_rack_with_safeties: "Стойка для приседаний со страховочными упорами",
  stable_bench_with_backrest: "Устойчивая скамья со спинкой",
  stable_exercise_step: "Устойчивая тренировочная платформа",
  stable_flat_bench: "Устойчивая горизонтальная скамья",
  verified_secure_bar_mounting: "Проверенное надёжное крепление перекладины",
  parallel_bars: "Брусья",
  gymnastic_rings: "Гимнастические кольца",
  suspension_trainer: "Подвесные петли",
  cable_station: "Блочная станция",
  smith_machine: "Тренажёр Смита",
  ez_bar: "EZ-гриф",
  plates: "Блины",
  ankle_cuff: "Манжета для блочного тренажёра",
  foam_roller: "Массажный ролл",
  towel: "Полотенце",
  chair: "Стул",
  stable_chair: "Устойчивый стул",
  stable_step: "Устойчивая ступень",
  secure_anchor: "Надёжное крепление",
  flat_non_slip_surface: "Ровная нескользкая поверхность",
  water_bottle: "Бутылка с водой",
  filled_water_bottle: "Наполненная бутылка с надёжной крышкой",
  backpack: "Рюкзак с закреплённым грузом",
  assisted_dip_machine: "Тренажёр для отжиманий на брусьях с противовесом",
  dual_cable_station_with_handles: "Двойной блок с рукоятями",
  hip_abduction_machine: "Тренажёр для разведения бёдер",
  incline_bench_press_station_with_safeties: "Наклонная скамья и стойка со страховочными упорами",
  low_cable_station_with_ankle_cuff: "Нижний блок с манжетой для голени",
  low_cable_station_with_handle: "Нижний блок с рукоятью",
  lying_leg_curl_machine: "Тренажёр для сгибания ног лёжа",
  pec_deck_machine: "Тренажёр для сведения рук",
  seated_calf_raise_machine: "Тренажёр для подъёма на носки сидя",
  shoulder_press_machine: "Тренажёр для жима над головой",
  stable_adjustable_bench: "Устойчивая регулируемая скамья",
  stable_balance_support: "Устойчивая опора для равновесия",
  assistance_band: "Резина для помощи в подтягивании",
  back_extension_bench: "Скамья для гиперэкстензии",
  cable_station_with_handle: "Блочная станция с рукоятью",
  ez_bar_with_plates_and_collars: "EZ-гриф, блины и замки",
  high_cable_station_with_bar: "Верхний блок с прямой рукоятью",
  high_cable_station_with_handle: "Верхний блок с одиночной рукоятью",
  lat_pulldown_machine_with_neutral_handle: "Верхний блок с нейтральной рукоятью",
  low_cable_station_with_bar: "Нижний блок с прямой рукоятью",
  neutral_grip_pull_up_bar: "Турник с нейтральными рукоятями",
  preacher_bench: "Скамья Скотта",
  reverse_pec_deck_machine: "Тренажёр для обратного разведения рук",
  seated_row_machine: "Тренажёр для горизонтальной тяги сидя",
  verified_resistance_band_anchor: "Проверенное крепление эластичной ленты",
  verified_stable_exercise_machine: "Устойчивый проверенный тренажёр",
  verified_suspension_anchor: "Проверенное крепление подвесных петель",
  load_pad: "Подкладка под гриф",
  exercise_dowel: "Гимнастическая палка",
  long_foam_roller: "Длинный ролл для опоры головы и таза",
  stable_exercise_chair: "Устойчивый тренировочный стул без колёс",
  blanket: "Плед для опоры",
  bolster: "Болстер для йоги",
  parallettes: "Паралетсы",
  sliders: "Диски для скольжения",
  nordic_foot_anchor: "Фиксатор стоп для Nordic",
  verified_secure_ring_anchor: "Проверенное крепление колец",
  verified_stable_parallettes: "Устойчивые паралетсы",
  verified_secure_nordic_anchor: "Проверенный фиксатор стоп",
  stable_padded_knee_support: "Устойчивая мягкая опора под колено",
  leg_press_machine_single_leg_compatible: "Жим ногами: тренажёр допускает работу одной ногой",
  leg_extension_machine_single_leg_compatible:
    "Разгибание ног: тренажёр допускает работу одной ногой",
  seated_leg_curl_machine_single_leg_compatible:
    "Сгибание ног сидя: тренажёр допускает работу одной ногой",
  leg_press_machine_calf_raise_compatible: "Жим ногами: тренажёр допускает подъём на носки",
};

function keys<T extends string>(value: Record<T, string>): [T, ...T[]] {
  const values = Object.keys(value) as T[];
  if (!values.length) throw new Error("Catalog taxonomy must not be empty");
  return [values[0], ...values.slice(1)];
}

const stableId = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/);
const text = z.string().trim().min(1).max(300);
const uniqueTextList = z
  .array(text)
  .max(24)
  .refine((list) => new Set(list).size === list.length, {
    message: "Duplicate entries are not allowed",
  });
const resources = z
  .string()
  .max(1500)
  .refine(
    (value) =>
      value === "none" ||
      (value.split(";").every((token) => /^[a-z][a-z0-9_]*(?::[1-9]\d{0,2})?$/.test(token)) &&
        new Set(value.split(";").map((token) => token.split(":")[0])).size ===
          value.split(";").length),
    { message: "Expected none or unique snake_case resources with positive quantities" },
  );

const enrichmentShape = {
  skillDemand: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("none"),
      requiresPriorSkill: z.literal(false),
      rationale: z.string().trim().min(1).max(1000),
    }),
    z.strictObject({
      kind: z.literal("preparation"),
      requiresPriorSkill: z.literal(false),
      rationale: z.string().trim().min(1).max(1000),
    }),
    z.strictObject({
      kind: z.literal("movement"),
      requiresPriorSkill: z.literal(true),
      rationale: z.string().trim().min(1).max(1000),
    }),
  ]),
  workoutRoles: z
    .array(z.enum(keys(WORKOUT_ROLES)))
    .min(1)
    .max(6),
  purposes: z
    .array(z.enum(keys(EXERCISE_PURPOSES)))
    .min(1)
    .max(8),
  canonical: z.boolean(),
  discoveryPriority: z.int().min(0).max(100),
  priorityBasis: z.literal("editorial"),
  searchKeywords: z
    .array(text)
    .min(1)
    .max(48)
    .refine((list) => new Set(list).size === list.length, {
      message: "Duplicate search keywords are not allowed",
    }),
  execution: z.strictObject({
    addedLoad: z.enum(["none", "required", "optional"]),
    assistance: z.enum(["none", "band", "counterweight"]),
    countSemantics: z.enum(["total_reps", "per_side_reps", "total_seconds", "per_side_seconds"]),
    repetitionUnit: z.enum(["movement", "left_right_pair", "not_applicable"]),
    assignmentGate: z.enum(["standard_review", "skill_review"]),
  }),
};

export const catalogOverlaySchema = z.strictObject({
  ...enrichmentShape,
  displayNameRu: z.string().trim().min(1).max(70).optional(),
  additionalAliases: uniqueTextList.optional(),
  focusMode: z.enum(["loading", "stretch", "mobility", "balance", "relaxation"]).optional(),
});

const baseEditorialSchema = z.strictObject({
  displayNameRu: z.string().trim().min(1).max(70),
  formalNameRu: text,
  aliases: uniqueTextList.min(1),
  contexts: z
    .array(z.enum(keys(CATALOG_CONTEXTS)))
    .min(1)
    .max(4),
  directions: z
    .array(z.enum(keys(CATALOG_DIRECTIONS)))
    .min(1)
    .max(5),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  sideMode: z.enum(["bilateral", "alternating", "per_side", "none"]),
  focusMode: z.enum(["loading", "stretch", "mobility", "balance", "relaxation"]),
  cues: uniqueTextList.min(1).max(5),
  mistakes: uniqueTextList.min(1).max(5),
  optionalEquipment: resources,
  sourceRefs: z
    .array(z.url().refine((url) => new URL(url).protocol === "https:"))
    .min(1)
    .max(10),
  reviewStatus: z.literal("pending_expert_review"),
  relations: z.strictObject({
    alternatives: z.array(stableId).max(15),
    regressions: z.array(stableId).max(15),
    progressions: z.array(stableId).max(15),
    status: z.literal("draft"),
  }),
});

const baseCatalogRowSchema = z.strictObject({
  id: stableId,
  familyId: stableId,
  familyNameRu: text,
  aliasEn: text,
  discipline: z.enum(["strength", "yoga", "stretch", "mobility"]),
  pattern: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z][a-z0-9_]*$/),
  resistanceMode: z.enum(["bodyweight", "external_load", "machine_load", "assisted_bodyweight"]),
  metric: z.enum(["reps", "time"]),
  equipmentRequirement: resources,
  supportRequirement: resources,
  spaceRequirement: resources,
  editorial: baseEditorialSchema,
  muscles: z
    .array(
      z.strictObject({
        group: z.enum(keys(MUSCLE_GROUPS)),
        role: z.enum(["primary", "secondary", "stabilizer"]),
      }),
    )
    .max(18),
});

export const catalogSeedRowSchema = baseCatalogRowSchema
  .extend({ editorial: baseEditorialSchema.extend(enrichmentShape) })
  .superRefine((row, context) => {
    const unique = (list: string[], path: (string | number)[]) => {
      if (new Set(list).size !== list.length)
        context.addIssue({ code: "custom", message: "Duplicate classification", path });
    };
    unique(row.editorial.contexts, ["editorial", "contexts"]);
    unique(row.editorial.directions, ["editorial", "directions"]);
    unique(row.editorial.sourceRefs, ["editorial", "sourceRefs"]);
    unique(row.editorial.workoutRoles, ["editorial", "workoutRoles"]);
    unique(row.editorial.purposes, ["editorial", "purposes"]);
    unique(
      row.muscles.map((muscle) => muscle.group),
      ["muscles"],
    );
    if (
      row.editorial.focusMode !== "relaxation" &&
      !row.muscles.some((muscle) => muscle.role === "primary")
    )
      context.addIssue({
        code: "custom",
        message: "Primary muscle focus is required",
        path: ["muscles"],
      });
    for (const kind of ["alternatives", "regressions", "progressions"] as const) {
      unique(row.editorial.relations[kind], ["editorial", "relations", kind]);
      if (row.editorial.relations[kind].includes(row.id))
        context.addIssue({
          code: "custom",
          message: "An exercise cannot relate to itself",
          path: ["editorial", "relations", kind],
        });
    }
  });

export interface HistoricCatalogVariant {
  id: string;
  familyId: string;
  metric?: "reps" | "time";
}

export function canEditCatalogDraft(status: string, revisionStatuses: string[]): boolean {
  return (
    status === "draft" && revisionStatuses.every((revisionStatus) => revisionStatus === "draft")
  );
}

export function validateCatalogRows(
  input: unknown,
  historic: HistoricCatalogVariant[] = [],
): CatalogSeedRow[] {
  const rows = z.array(catalogSeedRowSchema).min(1).max(1000).parse(input);
  const byId = new Map<string, CatalogSeedRow>();
  const families = new Map<string, { name: string; discipline: string }>();
  for (const row of rows) {
    if (byId.has(row.id)) throw new Error(`Duplicate catalog variant: ${row.id}`);
    byId.set(row.id, row);
    const previous = families.get(row.familyId);
    if (previous && (previous.name !== row.familyNameRu || previous.discipline !== row.discipline))
      throw new Error(`Conflicting catalog family: ${row.familyId}`);
    families.set(row.familyId, { name: row.familyNameRu, discipline: row.discipline });
  }
  for (const row of rows) {
    for (const ids of [
      row.editorial.relations.alternatives,
      row.editorial.relations.regressions,
      row.editorial.relations.progressions,
    ])
      for (const id of ids)
        if (!byId.has(id)) throw new Error(`Unknown relation ${id} in ${row.id}`);
  }
  for (const previous of historic) {
    if (byId.get(previous.id)?.familyId !== previous.familyId)
      throw new Error(`Historic variant is missing or reassigned: ${previous.id}`);
    if (previous.metric && byId.get(previous.id)?.metric !== previous.metric)
      throw new Error(`Historic variant metric cannot change: ${previous.id}`);
  }
  assertCatalogConsistency(rows, CATALOG_RESOURCE_LABELS);
  return rows;
}

function csvFields(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else current += character;
  }
  if (quoted) throw new Error("Unclosed historic CSV field");
  values.push(current);
  return values;
}

function historicRows(csv: string): HistoricCatalogVariant[] {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  if (!lines[0]?.startsWith("canonical_id,variant_id,"))
    throw new Error("Unexpected historic CSV header");
  const header = csvFields(lines[0]);
  const metricIndex = header.indexOf("metric");
  if (metricIndex < 0) throw new Error("Historic CSV metric is missing");
  return lines.slice(1).map((line) => {
    const fields = csvFields(line);
    const [familyId, id] = fields;
    const metric = fields[metricIndex];
    if (metric !== "reps" && metric !== "time") throw new Error(`Invalid historic metric: ${id}`);
    return { familyId, id, metric };
  });
}

export function mergeCatalogOverlay(baseInput: unknown, overlayInput: unknown): CatalogSeedRow[] {
  const baseRows = z.array(baseCatalogRowSchema).min(1).max(1000).parse(baseInput);
  const overlay = z.record(stableId, catalogOverlaySchema).parse(overlayInput);
  const baseIds = new Set(baseRows.map((row) => row.id));
  for (const id of Object.keys(overlay))
    if (!baseIds.has(id)) throw new Error(`Unknown catalog overlay: ${id}`);
  return baseRows.map((row) => {
    const additions = overlay[row.id];
    if (!additions) throw new Error(`Missing catalog overlay: ${row.id}`);
    const { displayNameRu, additionalAliases = [], ...enrichment } = additions;
    const renamed = displayNameRu !== undefined && displayNameRu !== row.editorial.displayNameRu;
    return {
      ...row,
      editorial: {
        ...row.editorial,
        ...enrichment,
        displayNameRu: displayNameRu ?? row.editorial.displayNameRu,
        aliases: [
          ...new Set([
            ...row.editorial.aliases,
            ...(renamed ? [row.editorial.displayNameRu] : []),
            ...additionalAliases,
          ]),
        ],
      },
    };
  });
}

export async function loadCatalogSeed(): Promise<CatalogSeedRow[]> {
  const [strength, flexibility, historic, overlay, calisthenics, additions] = await Promise.all([
    readFile("data/catalog/strength.v1.json", "utf8"),
    readFile("data/catalog/flexibility.v1.json", "utf8"),
    readFile("data/catalog/seed-exercises.v0.csv", "utf8"),
    readFile("data/catalog/editorial.v2.json", "utf8"),
    readFile("data/catalog/calisthenics.v2.json", "utf8"),
    readFile("data/catalog/strength-additions.v2.json", "utf8"),
  ]);
  const chunks = [JSON.parse(strength) as unknown, JSON.parse(flexibility) as unknown];
  if (!chunks.every(Array.isArray)) throw new Error("Catalog files must contain arrays");
  const baseRows = mergeCatalogOverlay(chunks.flat(), JSON.parse(overlay) as unknown);
  if (baseRows.length !== 200)
    throw new Error(`Expected 200 baseline variants; received ${baseRows.length}`);
  const extraChunks: unknown[] = [
    JSON.parse(calisthenics) as unknown,
    JSON.parse(additions) as unknown,
  ];
  if (!extraChunks.every(Array.isArray))
    throw new Error("Catalog extension files must contain arrays");
  const preserved = [
    ...historicRows(historic),
    ...baseRows.map((row) => ({ id: row.id, familyId: row.familyId, metric: row.metric })),
  ];
  const rows = validateCatalogRows([...baseRows, ...extraChunks.flat()], preserved);
  if (rows.length !== 300)
    throw new Error(`Expected 300 draft catalog variants; received ${rows.length}`);
  await loadSkillGraphs(rows);
  return rows;
}

export async function loadSkillGraphs(rows?: CatalogSeedRow[]): Promise<SkillGraphDraft[]> {
  const catalog = rows ?? (await loadCatalogSeed());
  const input = JSON.parse(await readFile("data/catalog/skill-graphs.v2.json", "utf8")) as unknown;
  const graphs = validateSkillGraphs(input, catalog);
  if (graphs.some((graph) => graph.revision !== 2))
    throw new Error("The active V2 skill graphs must have revision 2");
  return graphs;
}
