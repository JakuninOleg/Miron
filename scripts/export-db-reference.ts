import { mkdir, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { CATALOG_RESOURCE_LABELS, loadSkillGraphs } from "../src/server/db/catalog-input";
import {
  CATALOG_CONTEXTS,
  CATALOG_DIRECTIONS,
  MUSCLE_GROUPS,
  WORKOUT_ROLES,
  EXERCISE_PURPOSES,
  type CatalogEditorial,
  type SkillGraphDraft,
} from "../src/shared/catalog-taxonomy";

// Reproduce with:
// node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/export-db-reference.ts
// Only schema metadata and non-personal catalog tables are selected.
type ColumnRow = {
  tableName: string;
  name: string;
  position: number;
  type: string;
  nullable: boolean;
  default: string | null;
  identity: string;
  generated: string;
  comment: string | null;
};
type ConstraintRow = {
  tableName: string;
  name: string;
  kind: string;
  columns: string[];
  definition: string;
  validated: boolean;
};
type IndexRow = {
  tableName: string;
  name: string;
  unique: boolean;
  primary: boolean;
  definition: string;
};
type ForeignKeyRow = {
  name: string;
  fromTable: string;
  fromColumns: string[];
  toSchema: string;
  toTable: string;
  toColumns: string[];
  onDelete: string;
  onUpdate: string;
  matchType: string;
  deferrable: boolean;
  initiallyDeferred: boolean;
  validated: boolean;
  nullable: boolean;
  definition: string;
};
type Requirement = {
  resourceId: string;
  code: string;
  nameRu: string;
  kind: string;
  quantity: number;
  requiresConfirmation: boolean;
};
type Revision = {
  id: string;
  revision: number;
  status: string;
  instructions: string;
  editorial: CatalogEditorial | null;
};
type Muscle = { group: string; nameRu: string; role: "primary" | "secondary" | "stabilizer" };
type MediaSummary = { companion: string; status: string; rightsStatus: string; count: number };
type ExerciseRow = {
  id: string;
  exerciseId: string;
  exerciseNameRu: string;
  nameRu: string;
  aliasEn: string;
  discipline: string;
  pattern: string;
  resistanceMode: string;
  metric: string;
  status: string;
  sourceBasis: string;
  editorial: CatalogEditorial | null;
  muscles: Muscle[];
  requirements: Requirement[];
  revisions: Revision[];
  revisionCount: number;
  media: MediaSummary[];
  mediaCount: number;
};
type ReferenceSkillGraph = Omit<SkillGraphDraft, "status" | "reviewStatus" | "nodes"> & {
  id: string;
  status: string;
  reviewStatus: string;
  nodes: (SkillGraphDraft["nodes"][number] & { variantRevisionId: string })[];
};

const disciplineLabels: Record<string, string> = {
  strength: "Силовые",
  calisthenics: "Калистеника",
  mobility: "Мобильность",
  stretch: "Растяжка",
  yoga: "Йога",
};
const resistanceLabels: Record<string, string> = {
  bodyweight: "Собственный вес",
  assisted_bodyweight: "Собственный вес с помощью",
  external_load: "Внешнее отягощение",
  machine_load: "Тренажёр",
};
const statusLabels: Record<string, string> = {
  draft: "Черновик",
  published: "Опубликовано",
  retired: "Снято с новых назначений",
  revoked: "Отозвано",
  demo: "Демонстрация",
};
const metricLabels: Record<string, string> = { reps: "Повторы", time: "Время" };
const resourceLabels: Record<string, string> = {
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
};
const patternLabels: Record<string, string> = {
  ankle_dorsiflexion: "Тыльное сгибание голеностопа",
  ankle_plantarflexion: "Подъём на носки",
  elbow_extension: "Разгибание локтя",
  elbow_flexion: "Сгибание локтя",
  hinge: "Наклон в тазобедренных суставах",
  hip_abduction: "Отведение бедра",
  hip_extension: "Разгибание бедра",
  hip_external_rotation: "Наружное вращение бедра",
  hip_flexion: "Сгибание бедра",
  hip_rotation: "Вращение бедра",
  horizontal_pull: "Горизонтальная тяга",
  horizontal_push: "Горизонтальный жим",
  inverted_v_support: "Опора в положении перевёрнутой V",
  knee_extension: "Разгибание колена",
  knee_flexion: "Сгибание колена",
  kneeling_forward_fold: "Наклон вперёд с опорой на колени",
  leg_press: "Жим ногами",
  lunge: "Выпад",
  prone_spinal_extension: "Разгибание позвоночника лёжа на животе",
  seated_alignment: "Положение сидя",
  seated_hip_abduction: "Отведение бёдер сидя",
  shoulder_abduction: "Отведение плеча",
  shoulder_flexion: "Сгибание плеча",
  shoulder_horizontal_abduction: "Горизонтальное отведение плеча",
  shoulder_horizontal_adduction: "Горизонтальное приведение плеча",
  spinal_flexion_extension: "Сгибание и разгибание позвоночника",
  split_squat: "Сплит-приседание",
  squat: "Приседание",
  standing_alignment: "Положение стоя",
  standing_balance: "Баланс стоя",
  standing_knee_flexion: "Сгибание колена стоя",
  standing_lateral_extension: "Боковое вытяжение стоя",
  standing_lunge: "Выпад стоя",
  step_up: "Зашагивание",
  supine_hip_extension: "Разгибание бедра лёжа на спине",
  supine_rest: "Отдых лёжа на спине",
  thoracic_rotation: "Вращение грудного отдела",
  trunk_anti_extension: "Сопротивление разгибанию корпуса",
  trunk_anti_lateral_flexion: "Сопротивление боковому наклону корпуса",
  trunk_control: "Контроль корпуса",
  vertical_pull: "Вертикальная тяга",
  vertical_push: "Вертикальный жим",
  wrist_extension: "Разгибание запястья",
};

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
function keyColumnsEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((column) => b.includes(column));
}
function withoutTableName<T extends { tableName: string }>(row: T) {
  const { tableName, ...metadata } = row;
  void tableName;
  return metadata;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required; use --env-file=.env.local");
  const url = new URL(connectionString);
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.port !== "55432" ||
    url.pathname !== "/miron"
  )
    throw new Error("Reference export is restricted to the local MIRON database on port 55432");
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const tableResult = await client.query<{ name: string; comment: string | null }>(`
      SELECT c.relname AS name, obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`);
    const columns = await client.query<ColumnRow>(`
      SELECT c.relname AS "tableName", a.attname AS name, a.attnum AS position,
        format_type(a.atttypid,a.atttypmod) AS type, NOT a.attnotnull AS nullable,
        pg_get_expr(d.adbin,d.adrelid) AS default, a.attidentity AS identity,
        a.attgenerated AS generated, col_description(c.oid,a.attnum) AS comment
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname,a.attnum`);
    const constraints = await client.query<ConstraintRow>(`
      SELECT c.relname AS "tableName", k.conname AS name, k.contype AS kind,
        ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY u(attnum,ordinal)
          JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.attnum ORDER BY u.ordinal) AS columns,
        pg_get_constraintdef(k.oid,true) AS definition, k.convalidated AS validated
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      ORDER BY c.relname,k.conname`);
    const indexes = await client.query<IndexRow>(`
      SELECT c.relname AS "tableName", i.relname AS name, x.indisunique AS unique,
        x.indisprimary AS primary, pg_get_indexdef(x.indexrelid) AS definition
      FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
      JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' ORDER BY c.relname,i.relname`);
    const fkResult = await client.query<ForeignKeyRow>(`
      SELECT k.conname AS name, c.relname AS "fromTable",
        ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY u(attnum,ordinal)
          JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.attnum ORDER BY u.ordinal) AS "fromColumns",
        tn.nspname AS "toSchema", tc.relname AS "toTable",
        ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY u(attnum,ordinal)
          JOIN pg_attribute a ON a.attrelid=tc.oid AND a.attnum=u.attnum ORDER BY u.ordinal) AS "toColumns",
        CASE k.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
          WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS "onDelete",
        CASE k.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
          WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS "onUpdate",
        CASE k.confmatchtype WHEN 'f' THEN 'FULL' WHEN 'p' THEN 'PARTIAL' ELSE 'SIMPLE' END AS "matchType",
        k.condeferrable AS deferrable, k.condeferred AS "initiallyDeferred", k.convalidated AS validated,
        EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum=ANY(k.conkey)
          AND NOT a.attnotnull) AS nullable, pg_get_constraintdef(k.oid,true) AS definition
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class tc ON tc.oid=k.confrelid
      JOIN pg_namespace tn ON tn.oid=tc.relnamespace WHERE n.nspname='public' AND k.contype='f'
      ORDER BY c.relname,k.conname`);
    const exercises = await client.query<ExerciseRow>(`
      SELECT v.id, v.exercise_id AS "exerciseId", e.name_ru AS "exerciseNameRu", v.name_ru AS "nameRu",
        v.alias_en AS "aliasEn", e.discipline, v.pattern, v.resistance_mode AS "resistanceMode",
        v.metric, v.status, v.source_basis AS "sourceBasis",
        latest.editorial,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('group',g.code,'nameRu',g.name_ru,'role',m.role)
          ORDER BY CASE m.role WHEN 'primary' THEN 0 WHEN 'secondary' THEN 1 ELSE 2 END,g.code)
          FROM variant_revision_muscles m JOIN muscle_groups g ON g.code=m.muscle_group_code
          WHERE m.variant_revision_id=latest.id),'[]') AS muscles,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('resourceId',r.id,'code',r.code,'nameRu',r.name_ru,
          'kind',r.kind,'quantity',q.quantity,'requiresConfirmation',q.requires_confirmation) ORDER BY r.kind,r.code)
          FROM variant_requirements q JOIN resource_types r ON r.id=q.resource_type_id WHERE q.variant_id=v.id),'[]') AS requirements,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'revision',x.revision,'status',x.status,
          'instructions',x.instructions,'editorial',x.editorial) ORDER BY x.revision) FROM variant_revisions x WHERE x.variant_id=v.id),'[]') AS revisions,
        (SELECT count(*)::integer FROM variant_revisions x WHERE x.variant_id=v.id) AS "revisionCount",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('companion',m.companion,'status',m.status,
          'rightsStatus',m.rights_status,'count',m.amount) ORDER BY m.companion,m.status,m.rights_status)
          FROM (SELECT a.companion,a.status,a.rights_status,count(*)::integer AS amount FROM media_assets a
            JOIN variant_revisions x ON x.id=a.variant_revision_id WHERE x.variant_id=v.id
            GROUP BY a.companion,a.status,a.rights_status) m),'[]') AS media,
        (SELECT count(*)::integer FROM media_assets a JOIN variant_revisions x ON x.id=a.variant_revision_id
          WHERE x.variant_id=v.id) AS "mediaCount"
      FROM exercise_variants v JOIN exercises e ON e.id=v.exercise_id
      LEFT JOIN LATERAL (SELECT x.id,x.editorial FROM variant_revisions x WHERE x.variant_id=v.id ORDER BY x.revision DESC LIMIT 1) latest ON true
      ORDER BY e.discipline,v.id`);
    const skillGraphs = await client.query<ReferenceSkillGraph>(`
      SELECT g.id,g.code,g.name_ru AS "nameRu",g.revision,g.status,
        g.review_status AS "reviewStatus",g.source_refs AS "sourceRefs",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',n.node_key,'variantId',v.variant_id,'variantRevisionId',n.variant_revision_id,
          'skillGroup',n.skill_group,'prerequisiteMode',n.prerequisite_mode,
          'assessment',n.assessment,'assessmentNotes',n.assessment_notes) ORDER BY n.node_key)
          FROM skill_graph_nodes n JOIN variant_revisions v ON v.id=n.variant_revision_id
          WHERE n.graph_revision_id=g.id),'[]') AS nodes,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'from',e.from_node_key,'to',e.to_node_key,'kind',e.kind,'sourceRefs',e.source_refs)
          ORDER BY e.from_node_key,e.to_node_key,e.kind) FROM skill_graph_edges e
          WHERE e.graph_revision_id=g.id),'[]') AS edges
      FROM skill_graph_revisions g ORDER BY g.code,g.revision`);
    const templates = await client.query<{
      id: string;
      code: string;
      name: string;
      status: string;
      stepCount: number;
    }>(`
      SELECT t.id,t.code,t.name,t.status,(SELECT count(*)::integer FROM template_steps s
        WHERE s.template_id=t.id) AS "stepCount" FROM program_templates t ORDER BY t.code`);
    const resourceTypes = await client.query<{
      id: string;
      code: string;
      nameRu: string;
      kind: string;
    }>(`
      SELECT id,code,name_ru AS "nameRu",kind FROM resource_types ORDER BY kind,code`);
    const counts = await client.query<{
      exerciseFamilies: number;
      variants: number;
      requirements: number;
      revisions: number;
      mediaAssets: number;
      templates: number;
      templateSteps: number;
      resourceTypes: number;
      muscleGroups: number;
      muscleLinks: number;
      skillGraphRevisions: number;
      skillGraphNodes: number;
      skillGraphEdges: number;
    }>(`SELECT
      (SELECT count(*)::integer FROM exercises) AS "exerciseFamilies",
      (SELECT count(*)::integer FROM exercise_variants) AS variants,
      (SELECT count(*)::integer FROM variant_requirements) AS requirements,
      (SELECT count(*)::integer FROM variant_revisions) AS revisions,
      (SELECT count(*)::integer FROM media_assets) AS "mediaAssets",
      (SELECT count(*)::integer FROM program_templates) AS templates,
      (SELECT count(*)::integer FROM template_steps) AS "templateSteps",
      (SELECT count(*)::integer FROM resource_types) AS "resourceTypes",
      (SELECT count(*)::integer FROM muscle_groups) AS "muscleGroups",
      (SELECT count(*)::integer FROM variant_revision_muscles) AS "muscleLinks",
      (SELECT count(*)::integer FROM skill_graph_revisions) AS "skillGraphRevisions",
      (SELECT count(*)::integer FROM skill_graph_nodes) AS "skillGraphNodes",
      (SELECT count(*)::integer FROM skill_graph_edges) AS "skillGraphEdges"`);
    const version = await client.query<{ version: string }>(
      "SELECT current_setting('server_version') AS version",
    );
    await client.query("COMMIT");

    const tables = tableResult.rows.map((table) => ({
      ...table,
      columns: columns.rows
        .filter((column) => column.tableName === table.name)
        .map(withoutTableName),
      constraints: constraints.rows
        .filter((constraint) => constraint.tableName === table.name)
        .map(withoutTableName),
      indexes: indexes.rows.filter((index) => index.tableName === table.name).map(withoutTableName),
    }));
    const foreignKeys = fkResult.rows.map((fk) => ({
      ...fk,
      unique: constraints.rows.some(
        (constraint) =>
          constraint.tableName === fk.fromTable &&
          ["p", "u"].includes(constraint.kind) &&
          keyColumnsEqual(constraint.columns, fk.fromColumns),
      ),
    }));
    const exportExercises = exercises.rows.map((row) => ({
      ...row,
      displayNameRu: row.editorial?.displayNameRu ?? row.nameRu,
      formalNameRu: row.editorial?.formalNameRu ?? row.nameRu,
      aliases: row.editorial?.aliases ?? [row.aliasEn],
      contexts: row.editorial?.contexts ?? [],
      directions: row.editorial?.directions ?? [row.discipline],
      disciplineLabel: disciplineLabels[row.discipline] ?? row.discipline,
      patternLabel: patternLabels[row.pattern] ?? row.pattern,
      resistanceModeLabel: resistanceLabels[row.resistanceMode] ?? row.resistanceMode,
      metricLabel: metricLabels[row.metric] ?? row.metric,
      statusLabel: statusLabels[row.status] ?? row.status,
      requirements: row.requirements.map((requirement) => ({
        ...requirement,
        displayNameRu:
          resourceLabels[requirement.code] ??
          CATALOG_RESOURCE_LABELS[requirement.code] ??
          requirement.nameRu,
      })),
    }));
    const activeDefinitions = await loadSkillGraphs();
    const activeVersions = new Set(
      activeDefinitions.map((graph) => `${graph.code}:${graph.revision}`),
    );
    const activeSkillGraphs = skillGraphs.rows.filter((graph) =>
      activeVersions.has(`${graph.code}:${graph.revision}`),
    );
    if (activeSkillGraphs.length !== activeDefinitions.length)
      throw new Error(
        "Active graph revisions are missing from the local database; seed the reviewed V2 catalog first",
      );
    const historicalSkillGraphs = skillGraphs.rows.filter(
      (graph) => !activeVersions.has(`${graph.code}:${graph.revision}`),
    );
    const byDiscipline: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byContext: Record<string, number> = {};
    const byDirection: Record<string, number> = {};
    const byWorkoutRole: Record<string, number> = {};
    const byPurpose: Record<string, number> = {};
    for (const row of exportExercises) {
      byDiscipline[row.discipline] = (byDiscipline[row.discipline] ?? 0) + 1;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      for (const context of row.contexts) byContext[context] = (byContext[context] ?? 0) + 1;
      for (const direction of row.directions)
        byDirection[direction] = (byDirection[direction] ?? 0) + 1;
      for (const role of row.editorial?.workoutRoles ?? [])
        byWorkoutRole[role] = (byWorkoutRole[role] ?? 0) + 1;
      for (const purpose of row.editorial?.purposes ?? [])
        byPurpose[purpose] = (byPurpose[purpose] ?? 0) + 1;
    }
    const reference = {
      generatedAt: new Date().toISOString(),
      source: {
        engine: "PostgreSQL",
        version: version.rows[0].version,
        schema: "public",
        scope: "Local schema metadata and non-personal catalog only",
        transaction: "REPEATABLE READ READ ONLY",
      },
      tables,
      foreignKeys,
      exercises: exportExercises,
      skillGraphs: activeSkillGraphs,
      historicalSkillGraphs,
      catalogTaxonomy: {
        contexts: CATALOG_CONTEXTS,
        directions: CATALOG_DIRECTIONS,
        muscles: MUSCLE_GROUPS,
        workoutRoles: WORKOUT_ROLES,
        purposes: EXERCISE_PURPOSES,
      },
      templates: templates.rows,
      resourceTypes: resourceTypes.rows.map((resource) => ({
        ...resource,
        displayNameRu:
          resourceLabels[resource.code] ??
          CATALOG_RESOURCE_LABELS[resource.code] ??
          resource.nameRu,
      })),
      stats: {
        ...counts.rows[0],
        activeSkillGraphs: activeSkillGraphs.length,
        activeSkillGraphNodes: activeSkillGraphs.reduce(
          (sum, graph) => sum + graph.nodes.length,
          0,
        ),
        activeSkillGraphEdges: activeSkillGraphs.reduce(
          (sum, graph) => sum + graph.edges.length,
          0,
        ),
        historicalSkillGraphRevisions: historicalSkillGraphs.length,
        tables: tables.length,
        foreignKeys: foreignKeys.length,
        variantsByDiscipline: byDiscipline,
        variantsByStatus: byStatus,
        variantsByContext: byContext,
        variantsByDirection: byDirection,
        variantsByWorkoutRole: byWorkoutRole,
        variantsByPurpose: byPurpose,
        templatesByStatus: Object.fromEntries(
          [...new Set(templates.rows.map((row) => row.status))].map((status) => [
            status,
            templates.rows.filter((row) => row.status === status).length,
          ]),
        ),
      },
      notes: [
        "Одна строка exercises — конкретный вариант из exercise_variants, а не семейство из exercises.",
        "Связи показаны только по существующим FOREIGN KEY. Составные ключи сохраняют реальный порядок колонок.",
        `В каталоге ${counts.rows[0].variants} вариантов; ${byStatus.draft ?? 0} черновиков и ${byStatus.published ?? 0} опубликованных. Техника, сложность и мышечные акценты черновиков ожидают экспертной проверки.`,
        "Короткое имя, точное название, алиасы, направления и места хранятся в editorial конкретной ревизии. Мышечные роли связаны с той же ревизией.",
        "Дом, зал, улица и площадка — типичные подборки. Доступность определяется реальным инвентарём и подходящими условиями, а не одним местом.",
        "Обязательные требования сейчас плоские AND; OR-группы ещё не представлены. Необязательный инвентарь хранится в editorial и не блокирует карточку.",
        "Для силовых мышцы обозначают акцент и участие; для йоги, мобильности и растяжки — область внимания, а не обещание роста мышц.",
        "Связи альтернатив, упрощений и усложнений — редакционные кандидаты; они не разрешают автоматическую замену в программе.",
        "Роли в занятии и цели — многозначные редакционные метки ревизии. Нагрузка, объём и назначение не выводятся из них автоматически.",
        "Canonical и discoveryPriority отражают редакционный выбор базовых карточек; статистическая популярность ещё не измерена.",
        "Графы навыков — черновики с ручной оценкой тренером. prerequisite означает кандидат обязательной зависимости, preparation — подготовительный компонент; автоматического освоения или разблокировки нет.",
        "skill_review исключён из публичного автоматического подбора и создания новой тренировки, включая demo, до реализации проверки навыка.",
        "difficulty, роли, цели и gate независимы. Advanced само по себе не требует skill_review; skillDemand отдельно обосновывает предварительное освоение навыка.",
        "Вкладка навыков использует только активные графы V2; исторические V1-ревизии сохранены в БД и экспортированы отдельно.",
        "execution описывает единицы каталога. Контракт численных целей и офлайн-команд сессии остаётся задачей этапа 0.5.",
        "Конкретные редакционные теги свободного пространства seed упрощены в БД до clear_space.",
        "Имена и характеристики публичного каталога экспортированы; строки пользователей, авторизации и личных тренировок не читались.",
        "Наличие портретов Макса и Лики в интерфейсе не означает наличие медиа выполнения упражнения в media_assets.",
      ],
    };
    const csvRows: (string | number)[][] = [
      [
        "ID варианта",
        "ID семейства",
        "Название варианта",
        "Название семейства в БД",
        "Английское название",
        "Направление",
        "Направление (код)",
        "Движение",
        "Движение (код)",
        "Сопротивление",
        "Сопротивление (код)",
        "Учёт результата",
        "Статус",
        "Обязательный инвентарь",
        "Обязательные опоры",
        "Пространство",
        "Требует подтверждения опоры",
        "Число ревизий",
        "Число изображений / медиа",
        "Инструкция последней ревизии",
        "Основание названий",
        "Короткое название",
        "Точное название",
        "Алиасы",
        "Места",
        "Направления подборок",
        "Главный акцент",
        "Вторичные мышцы",
        "Стабилизаторы",
        "Сложность (черновая)",
        "Учёт сторон",
        "Тип акцента",
        "Короткие подсказки",
        "Частые ошибки",
        "Необязательный инвентарь (коды)",
        "Источники для проверки",
        "Кандидаты альтернатив",
        "Кандидаты упрощения",
        "Кандидаты усложнения",
        "Состояние методической проверки",
        "Роли в занятии",
        "Цели упражнения",
        "Базовое упражнение (редакционный выбор)",
        "Редакционный приоритет",
        "Основание приоритета",
        "Поисковые ключи",
        "Внешняя нагрузка",
        "Помощь",
        "Семантика учёта",
        "Единица повтора",
        "Допуск к назначению",
        "Вид навыкового требования",
        "Требуется предварительный навык",
        "Обоснование навыкового требования",
        "Активные графы навыков",
      ],
    ];
    for (const row of exportExercises) {
      const requirements = (kind: string) =>
        row.requirements
          .filter((item) => item.kind === kind)
          .map((item) => `${item.displayNameRu} × ${item.quantity}`)
          .join("; ") || "Не требуется";
      csvRows.push([
        row.id,
        row.exerciseId,
        row.nameRu,
        row.exerciseNameRu,
        row.aliasEn,
        row.disciplineLabel,
        row.discipline,
        row.patternLabel,
        row.pattern,
        row.resistanceModeLabel,
        row.resistanceMode,
        row.metricLabel,
        row.statusLabel,
        requirements("equipment"),
        requirements("support"),
        requirements("space"),
        row.requirements
          .filter((item) => item.requiresConfirmation)
          .map((item) => item.displayNameRu)
          .join("; ") || "Нет",
        row.revisionCount,
        row.mediaCount,
        row.revisions.at(-1)?.instructions ?? "Нет ревизии",
        row.sourceBasis,
        row.displayNameRu,
        row.formalNameRu,
        row.aliases.join("; "),
        row.contexts.map((context) => CATALOG_CONTEXTS[context]).join("; "),
        row.directions
          .map(
            (direction) =>
              CATALOG_DIRECTIONS[direction as keyof typeof CATALOG_DIRECTIONS] ?? direction,
          )
          .join("; "),
        row.muscles
          .filter((muscle) => muscle.role === "primary")
          .map((muscle) => muscle.nameRu)
          .join("; "),
        row.muscles
          .filter((muscle) => muscle.role === "secondary")
          .map((muscle) => muscle.nameRu)
          .join("; "),
        row.muscles
          .filter((muscle) => muscle.role === "stabilizer")
          .map((muscle) => muscle.nameRu)
          .join("; "),
        row.editorial?.difficulty ?? "Не размечено",
        row.editorial?.sideMode ?? "Не размечено",
        row.editorial?.focusMode ?? "Не размечено",
        row.editorial?.cues.join("; ") ?? "",
        row.editorial?.mistakes.join("; ") ?? "",
        row.editorial?.optionalEquipment ?? "",
        row.editorial?.sourceRefs.join("; ") ?? "",
        row.editorial?.relations.alternatives.join("; ") ?? "",
        row.editorial?.relations.regressions.join("; ") ?? "",
        row.editorial?.relations.progressions.join("; ") ?? "",
        row.editorial?.reviewStatus ?? "Не размечено",
        row.editorial?.workoutRoles?.map((role) => WORKOUT_ROLES[role]).join("; ") ?? "",
        row.editorial?.purposes?.map((purpose) => EXERCISE_PURPOSES[purpose]).join("; ") ?? "",
        row.editorial?.canonical ? "Да" : "Нет",
        row.editorial?.discoveryPriority ?? "",
        row.editorial?.priorityBasis ?? "",
        row.editorial?.searchKeywords?.join("; ") ?? "",
        row.editorial?.execution?.addedLoad ?? "",
        row.editorial?.execution?.assistance ?? "",
        row.editorial?.execution?.countSemantics ?? "",
        row.editorial?.execution?.repetitionUnit ?? "",
        row.editorial?.execution?.assignmentGate ?? "",
        row.editorial?.skillDemand?.kind ?? "Не размечено",
        row.editorial?.skillDemand?.requiresPriorSkill === true
          ? "Да"
          : row.editorial?.skillDemand
            ? "Нет"
            : "Не размечено",
        row.editorial?.skillDemand?.rationale ?? "",
        activeSkillGraphs
          .filter((graph) => graph.nodes.some((node) => node.variantId === row.id))
          .map((graph) => `${graph.code}:r${graph.revision}`)
          .join("; "),
      ]);
    }
    await mkdir("docs/reference", { recursive: true });
    await writeFile(
      "docs/reference/db-reference.json",
      `${JSON.stringify(reference, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      "docs/reference/exercises.csv",
      `\uFEFF${csvRows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`,
      "utf8",
    );
    console.log(
      JSON.stringify({
        files: ["docs/reference/db-reference.json", "docs/reference/exercises.csv"],
        stats: reference.stats,
      }),
    );
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  // Driver errors may include connection information; keep reference exports secret-free.
  console.error(
    "Reference export failed. Check the local PostgreSQL service and DATABASE_URL without printing credentials.",
  );
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string")
    console.error(`Diagnostic code: ${error.code}`);
  if (error instanceof Error) {
    console.error(`Error type: ${error.name}`);
    const ownFrame = error.stack
      ?.split("\n")
      .find((line) => line.includes("export-db-reference.ts:"));
    if (ownFrame) console.error(ownFrame.trim());
  }
  process.exitCode = 1;
});
