import type {
  CatalogContext,
  CatalogDirection,
  MuscleGroup,
} from "../../src/shared/catalog-taxonomy";

/** Editorial runtime allowlist. These sequences and doses have no professional method review. */
export const PLANNER_LIBRARY_DISCLOSURE =
  "Черновик тренировки. Профессиональная проверка не проводилась. Время и дозировки — редакционные ориентиры MIRON.";

export interface PlannerExerciseGroup {
  key: string;
  pattern: string;
  focus: "loading" | "stretch" | "mobility" | "balance" | "relaxation";
  primary: readonly MuscleGroup[];
  metric: "reps" | "time";
  variants: readonly string[];
}

function loading(
  key: string,
  pattern: string,
  primary: MuscleGroup,
  variants: string[],
  metric: "reps" | "time" = "reps",
): PlannerExerciseGroup {
  return { key, pattern, focus: "loading", primary: [primary], metric, variants };
}

export const PLANNER_LOADING_GROUPS = {
  squat: loading("squat", "squat", "quads", [
    "strength.squat.bodyweight",
    "strength.squat.box_bodyweight",
    "strength.squat.goblet_dumbbell",
    "strength.squat.goblet_kettlebell",
  ]),
  legPress: loading("leg_press", "leg_press", "quads", [
    "strength.leg_press.machine",
    "strength.leg_press.single_leg_machine",
  ]),
  splitSquat: loading("split_squat", "split_squat", "quads", [
    "strength.split_squat.bodyweight",
    "strength.split_squat.dumbbell",
  ]),
  lunge: loading("lunge", "lunge", "quads", [
    "strength.lunge.reverse_bodyweight",
    "strength.lunge.forward_bodyweight",
    "strength.lunge.reverse_dumbbell",
  ]),
  hip: loading("hip", "hip_extension", "glutes", [
    "strength.glute_bridge.bodyweight",
    "strength.donkey_kick.quadruped",
    "strength.glute_bridge.dumbbell",
    "strength.hip_thrust.dumbbell",
  ]),
  hamstrings: loading("hamstrings", "knee_flexion", "hamstrings", [
    "strength.knee_flexion.seated_machine",
    "strength.knee_flexion.lying_machine",
    "strength.knee_flexion.sliding_bodyweight",
    "strength.hamstring_walkout.floor",
  ]),
  hinge: loading("hinge", "hinge", "hamstrings", [
    "strength.romanian_deadlift.dumbbell",
    "strength.romanian_deadlift.barbell",
  ]),
  push: loading("push", "horizontal_push", "chest", [
    "strength.push_up.wall",
    "strength.push_up.knees",
    "strength.push_up.incline",
    "strength.push_up.floor",
    "strength.horizontal_press.dumbbell_floor",
    "strength.horizontal_press.machine",
    "strength.horizontal_press.dumbbell_bench",
  ]),
  pull: loading("pull", "horizontal_pull", "back", [
    "strength.row.single_arm_dumbbell_supported",
    "strength.row.seated_cable",
    "strength.row.machine",
    "strength.row.dumbbell_bent_over",
    "strength.row.resistance_band",
    "strength.inverted_row.fixed_bar",
    "strength.inverted_row.suspension_trainer",
  ]),
  verticalPull: loading("vertical_pull", "vertical_pull", "back", [
    "strength.vertical_pull.lat_pulldown",
    "strength.vertical_pull.neutral_lat_pulldown",
    "strength.pull_up.assisted_machine",
    "strength.pull_up.fixed_bar",
    "strength.pull_up.assistance_band",
  ]),
  shoulder: loading("shoulder", "vertical_push", "shoulders", [
    "strength.overhead_press.dumbbell_seated",
    "strength.overhead_press.machine",
    "strength.overhead_press.dumbbell_standing",
    "strength.overhead_press.resistance_band",
  ]),
  lateral: loading("lateral", "shoulder_abduction", "shoulders", [
    "strength.lateral_raise.dumbbell",
    "strength.lateral_raise.single_arm_cable",
  ]),
  biceps: loading("biceps", "elbow_flexion", "biceps", [
    "strength.biceps_curl.dumbbell",
    "strength.biceps_curl.hammer_dumbbell",
    "strength.biceps_curl.barbell",
  ]),
  triceps: loading("triceps", "elbow_extension", "triceps", [
    "strength.triceps_extension.cable_rope",
    "strength.triceps_extension.resistance_band_pushdown",
    "strength.triceps_extension.dumbbell_overhead",
  ]),
  calves: loading("calves", "ankle_plantarflexion", "calves", [
    "strength.calf_raise.standing_bodyweight",
    "strength.calf_raise.seated_machine",
    "strength.calf_raise.standing_dumbbell",
  ]),
  core: loading("core", "trunk_control", "abs", [
    "strength.dead_bug.alternating",
    "strength.bird_dog.alternating",
  ]),
  sideCore: loading(
    "side_core",
    "trunk_anti_lateral_flexion",
    "obliques",
    ["strength.side_plank.knees"],
    "time",
  ),
} satisfies Record<string, PlannerExerciseGroup>;

export interface PlannerLibrarySlot {
  key: string;
  group: PlannerExerciseGroup;
  anchor: boolean;
  preferredVariantId?: string;
  target: number;
  restSeconds: number;
  phase: "warmup" | "main" | "cooldown";
}

export interface PlannerLibraryTemplate {
  id: string;
  title: string;
  direction: CatalogDirection;
  contexts: readonly CatalogContext[];
  kind: "fullbody" | "upper" | "lower" | "push" | "pull" | "legs" | "support";
  slots: readonly PlannerLibrarySlot[];
  wholeSequence: boolean;
  /** An explicit partial rebuild; never represented as equivalent fullbody coverage. */
  coverageWarning?: string;
}

const places: CatalogContext[] = ["home", "gym", "outdoor", "workout_park"];
const G = PLANNER_LOADING_GROUPS;
function main(group: PlannerExerciseGroup, anchor = true): PlannerLibrarySlot {
  const accessory = ["core", "side_core", "calves", "biceps", "triceps", "lateral"].includes(
    group.key,
  );
  return {
    key: group.key,
    group,
    anchor,
    target: group.metric === "time" ? 20 : accessory ? 10 : 8,
    restSeconds: accessory ? 60 : 120,
    phase: "main",
  };
}
function strength(
  id: string,
  title: string,
  kind: PlannerLibraryTemplate["kind"],
  groups: PlannerExerciseGroup[],
  direction: "strength" | "calisthenics" = "strength",
  contexts = places,
): PlannerLibraryTemplate {
  return {
    id,
    title,
    kind,
    direction,
    contexts,
    slots: groups.map((group, index) => {
      const slot = main(group, index < 3);
      if (direction === "strength" && group.key === "push")
        slot.preferredVariantId = id.startsWith("gym.")
          ? "strength.horizontal_press.machine"
          : "strength.horizontal_press.dumbbell_floor";
      if (direction === "strength" && group.key === "pull")
        slot.preferredVariantId = id.startsWith("gym.")
          ? "strength.row.seated_cable"
          : "strength.row.single_arm_dumbbell_supported";
      return slot;
    }),
    wholeSequence: false,
  };
}

export const PLANNER_STRENGTH_TEMPLATES: readonly PlannerLibraryTemplate[] = [
  strength(
    "gym.fullbody.a",
    "Всё тело: тренажёры",
    "fullbody",
    [G.legPress, G.push, G.verticalPull, G.hamstrings, G.core],
    "strength",
    ["gym", "home"],
  ),
  strength("home.dumbbells.a", "Всё тело: присед, жим и тяга", "fullbody", [
    G.squat,
    G.push,
    G.pull,
    G.hip,
    G.core,
  ]),
  strength("home.dumbbells.b", "Всё тело: выпады и тяга", "fullbody", [
    G.lunge,
    G.push,
    G.pull,
    G.hip,
    G.core,
  ]),
  strength("gym.fullbody.b", "Всё тело: раздельный присед", "fullbody", [
    G.splitSquat,
    G.push,
    G.pull,
    G.hamstrings,
    G.core,
  ]),
  strength("gym.upper.a", "Верх: горизонтальный жим и тяга", "upper", [
    G.push,
    G.pull,
    G.shoulder,
    G.biceps,
    G.triceps,
  ]),
  strength("gym.upper.b", "Верх: вертикальная тяга", "upper", [
    G.push,
    G.verticalPull,
    G.lateral,
    G.biceps,
    G.triceps,
  ]),
  strength("gym.lower.a", "Низ: присед и ягодицы", "lower", [
    G.squat,
    G.hip,
    G.hamstrings,
    G.calves,
    G.core,
  ]),
  strength("gym.lower.b", "Низ: тренажёры", "lower", [
    G.legPress,
    G.hip,
    G.hamstrings,
    G.calves,
    G.core,
  ]),
  strength("home.lower.a", "Низ: присед и контроль корпуса", "lower", [
    G.squat,
    G.hip,
    G.calves,
    G.core,
  ]),
  strength("gym.push.a", "Жимы", "push", [G.push, G.shoulder, G.triceps, G.core]),
  strength("gym.pull.a", "Тяги", "pull", [G.verticalPull, G.pull, G.biceps, G.core]),
  strength("gym.legs.a", "Ноги", "legs", [G.squat, G.hip, G.hamstrings, G.calves]),
  strength(
    "calisthenics.fullbody.a",
    "Калистеника: присед, отжимание и тяга",
    "fullbody",
    [G.squat, G.push, G.pull, G.hip, G.core],
    "calisthenics",
  ),
  strength(
    "calisthenics.fullbody.b",
    "Калистеника: выпады и тяга",
    "fullbody",
    [G.lunge, G.push, G.verticalPull, G.hip, G.core],
    "calisthenics",
  ),
  strength(
    "calisthenics.lower.a",
    "Калистеника: нижняя часть тела",
    "lower",
    [G.squat, G.hip, G.calves, G.core],
    "calisthenics",
  ),
  strength(
    "calisthenics.upper.a",
    "Калистеника: отжимания и тяга",
    "upper",
    [G.push, G.pull, G.core],
    "calisthenics",
  ),
];

// Support metadata is explicit: singleton groups prevent guessed substitutions between asanas.
export const PLANNER_SUPPORT_GROUPS: readonly PlannerExerciseGroup[] = [
  {
    key: "shoulder_circle",
    pattern: "shoulder_circumduction",
    focus: "mobility",
    primary: ["shoulders"],
    metric: "reps",
    variants: ["mobility.shoulder_circle.standing"],
  },
  {
    key: "hip_circle",
    pattern: "hip_circumduction",
    focus: "mobility",
    primary: ["glutes", "hip_flexors"],
    metric: "reps",
    variants: ["mobility.hip_circle.standing"],
  },
  {
    key: "spinal_mobility",
    pattern: "spinal_flexion_extension",
    focus: "mobility",
    primary: ["back"],
    metric: "reps",
    variants: ["mobility.spinal_flexion_extension.quadruped"],
  },
  {
    key: "thoracic_rotation",
    pattern: "thoracic_rotation",
    focus: "mobility",
    primary: ["back"],
    metric: "reps",
    variants: ["mobility.thoracic_rotation.side_lying"],
  },
  {
    key: "pelvic_tilt",
    pattern: "pelvic_tilt",
    focus: "mobility",
    primary: ["lower_back"],
    metric: "reps",
    variants: ["mobility.pelvic_tilt.supine"],
  },
  {
    key: "ankle_mobility",
    pattern: "ankle_dorsiflexion",
    focus: "mobility",
    primary: ["calves"],
    metric: "reps",
    variants: ["mobility.ankle_dorsiflexion.knee_to_wall"],
  },
  {
    key: "wall_slide",
    pattern: "shoulder_flexion",
    focus: "mobility",
    primary: ["shoulders"],
    metric: "reps",
    variants: ["mobility.shoulder_flexion.wall_slide", "mobility.shoulder_flexion.dowel_overhead"],
  },
  {
    key: "wrist_circle",
    pattern: "wrist_circumduction",
    focus: "mobility",
    primary: ["forearms"],
    metric: "reps",
    variants: ["mobility.wrist.standing_circle"],
  },
  {
    key: "wrist_rock",
    pattern: "wrist_extension",
    focus: "mobility",
    primary: ["forearms"],
    metric: "reps",
    variants: ["mobility.wrist.quadruped_rock"],
  },
  {
    key: "half_kneeling_rock",
    pattern: "hip_flexion_extension",
    focus: "mobility",
    primary: ["hip_flexors", "hamstrings"],
    metric: "reps",
    variants: ["mobility.half_kneeling_rock.forward_back"],
  },
  {
    key: "ankle_circle",
    pattern: "ankle_circumduction",
    focus: "mobility",
    primary: ["calves", "feet"],
    metric: "reps",
    variants: ["mobility.ankle_circle.seated"],
  },
  {
    key: "adductor_mobility",
    pattern: "hip_abduction_flexion",
    focus: "mobility",
    primary: ["adductors"],
    metric: "reps",
    variants: ["mobility.adductor.quadruped_rock_back"],
  },
  {
    key: "forearm_rotation",
    pattern: "forearm_pronation_supination",
    focus: "mobility",
    primary: ["forearms"],
    metric: "reps",
    variants: ["mobility.forearm_rotation.seated"],
  },
  {
    key: "hamstring_stretch",
    pattern: "hip_flexion",
    focus: "stretch",
    primary: ["hamstrings"],
    metric: "time",
    variants: [
      "stretch.hamstring.supine_hand_supported",
      "stretch.hamstring.seated_chair",
      "stretch.hamstring.supine_strap",
    ],
  },
  {
    key: "quad_stretch",
    pattern: "knee_flexion",
    focus: "stretch",
    primary: ["quads"],
    metric: "time",
    variants: ["stretch.quadriceps.side_lying", "stretch.quadriceps.standing_supported"],
  },
  {
    key: "hip_stretch",
    pattern: "hip_extension",
    focus: "stretch",
    primary: ["hip_flexors"],
    metric: "time",
    variants: ["stretch.hip_flexor.half_kneeling", "stretch.hip_flexor.standing_split"],
  },
  {
    key: "glute_stretch",
    pattern: "hip_external_rotation",
    focus: "stretch",
    primary: ["glutes"],
    metric: "time",
    variants: ["stretch.gluteal.supine_figure_four", "stretch.gluteal.seated_figure_four"],
  },
  {
    key: "calf_stretch",
    pattern: "ankle_dorsiflexion",
    focus: "stretch",
    primary: ["calves"],
    metric: "time",
    variants: [
      "stretch.calf.wall_straight_knee",
      "stretch.calf.wall_bent_knee",
      "stretch.calf.seated_strap",
    ],
  },
  {
    key: "shoulder_stretch",
    pattern: "shoulder_horizontal_adduction",
    focus: "stretch",
    primary: ["shoulders"],
    metric: "time",
    variants: ["stretch.posterior_shoulder.cross_body"],
  },
  {
    key: "back_stretch",
    pattern: "shoulder_flexion",
    focus: "stretch",
    primary: ["back"],
    metric: "time",
    variants: ["stretch.latissimus.standing_wall", "stretch.latissimus.kneeling_bench"],
  },
  {
    key: "side_stretch",
    pattern: "trunk_lateral_flexion",
    focus: "stretch",
    primary: ["obliques"],
    metric: "time",
    variants: ["stretch.side_body.standing"],
  },
  {
    key: "chest_stretch",
    pattern: "shoulder_horizontal_abduction",
    focus: "stretch",
    primary: ["chest"],
    metric: "time",
    variants: ["stretch.pectoral.wall_single_arm", "stretch.pectoral.doorway_single_arm"],
  },
  {
    key: "wrist_stretch",
    pattern: "wrist_extension",
    focus: "stretch",
    primary: ["forearms"],
    metric: "time",
    variants: ["stretch.wrist_flexor.hand_assisted"],
  },
  {
    key: "mountain",
    pattern: "standing_alignment",
    focus: "balance",
    primary: ["feet", "quads"],
    metric: "time",
    variants: ["yoga.mountain.standing"],
  },
  {
    key: "forward_fold",
    pattern: "standing_forward_fold",
    focus: "stretch",
    primary: ["hamstrings"],
    metric: "time",
    variants: ["yoga.forward_fold.standing"],
  },
  {
    key: "half_lift",
    pattern: "standing_half_forward_fold",
    focus: "mobility",
    primary: ["back"],
    metric: "time",
    variants: ["yoga.half_lift.standing"],
  },
  {
    key: "low_lunge",
    pattern: "kneeling_lunge",
    focus: "stretch",
    primary: ["hip_flexors"],
    metric: "time",
    variants: ["yoga.low_lunge.knee_down"],
  },
  {
    key: "child",
    pattern: "kneeling_forward_fold",
    focus: "stretch",
    primary: ["back"],
    metric: "time",
    variants: ["yoga.child.standard"],
  },
  {
    key: "staff",
    pattern: "seated_alignment",
    focus: "loading",
    primary: ["abs", "lower_back"],
    metric: "time",
    variants: ["yoga.staff.seated"],
  },
  {
    key: "easy_twist",
    pattern: "seated_trunk_rotation",
    focus: "mobility",
    primary: ["back"],
    metric: "time",
    variants: ["yoga.easy_twist.seated"],
  },
  {
    key: "reclined_twist",
    pattern: "supine_trunk_rotation",
    focus: "mobility",
    primary: ["back"],
    metric: "time",
    variants: ["yoga.reclined_twist.bent_knees"],
  },
  {
    key: "happy_baby",
    pattern: "supine_hip_flexion_abduction",
    focus: "stretch",
    primary: ["adductors", "glutes"],
    metric: "time",
    variants: ["yoga.happy_baby.standard"],
  },
  {
    key: "sphinx",
    pattern: "prone_spinal_extension",
    focus: "mobility",
    primary: ["back"],
    metric: "time",
    variants: ["yoga.sphinx.standard"],
  },
  {
    key: "bound_angle",
    pattern: "seated_hip_abduction",
    focus: "stretch",
    primary: ["adductors"],
    metric: "time",
    variants: ["yoga.bound_angle.seated"],
  },
  {
    key: "easy_seat",
    pattern: "seated_alignment",
    focus: "relaxation",
    primary: [],
    metric: "time",
    variants: ["yoga.easy_seat.standard"],
  },
  {
    key: "corpse",
    pattern: "supine_rest",
    focus: "relaxation",
    primary: [],
    metric: "time",
    variants: ["yoga.corpse.supine", "yoga.legs_up_wall.standard"],
  },
  {
    key: "warrior_one",
    pattern: "standing_lunge",
    focus: "balance",
    primary: ["quads", "glutes"],
    metric: "time",
    variants: ["yoga.warrior_one.standard", "yoga.warrior_two.standard"],
  },
  {
    key: "tree",
    pattern: "standing_balance",
    focus: "balance",
    primary: ["feet", "glutes"],
    metric: "time",
    variants: ["yoga.tree.wall_supported"],
  },
  {
    key: "bridge",
    pattern: "supine_hip_extension",
    focus: "loading",
    primary: ["glutes"],
    metric: "time",
    variants: ["yoga.bridge.standard"],
  },
  {
    key: "puppy",
    pattern: "kneeling_shoulder_flexion",
    focus: "stretch",
    primary: ["back", "shoulders"],
    metric: "time",
    variants: ["yoga.puppy.standard"],
  },
  {
    key: "gate",
    pattern: "kneeling_lateral_extension",
    focus: "stretch",
    primary: ["obliques"],
    metric: "time",
    variants: ["yoga.gate.kneeling"],
  },
];

function support(
  id: string,
  title: string,
  direction: "stretch" | "mobility" | "yoga",
  keys: string[],
): PlannerLibraryTemplate {
  return {
    id,
    title,
    direction,
    contexts: places,
    kind: "support",
    wholeSequence: true,
    slots: keys.map((key, index) => {
      const group = PLANNER_SUPPORT_GROUPS.find((entry) => entry.key === key);
      if (!group) throw new Error(`Unknown planner support group: ${key}`);
      return {
        key: `${key}_${index}`,
        group,
        anchor: true,
        target: group.metric === "time" ? (group.focus === "relaxation" ? 60 : 30) : 8,
        restSeconds: 0,
        phase: index === 0 ? "warmup" : index === keys.length - 1 ? "cooldown" : "main",
      };
    }),
  };
}

export const PLANNER_SUPPORT_TEMPLATES: readonly PlannerLibraryTemplate[] = [
  support("stretch.lower", "Растяжка: ноги", "stretch", [
    "hip_circle",
    "hamstring_stretch",
    "quad_stretch",
    "glute_stretch",
    "hip_stretch",
    "calf_stretch",
    "side_stretch",
  ]),
  support("stretch.upper", "Растяжка: верх", "stretch", [
    "shoulder_circle",
    "shoulder_stretch",
    "chest_stretch",
    "back_stretch",
    "side_stretch",
    "wrist_stretch",
    "easy_seat",
  ]),
  support("stretch.general", "Растяжка: всё тело", "stretch", [
    "shoulder_circle",
    "chest_stretch",
    "hamstring_stretch",
    "hip_stretch",
    "glute_stretch",
    "back_stretch",
    "calf_stretch",
    "easy_seat",
  ]),
  support("stretch.floor", "Растяжка на полу", "stretch", [
    "pelvic_tilt",
    "hamstring_stretch",
    "quad_stretch",
    "glute_stretch",
    "hip_stretch",
    "side_stretch",
    "easy_seat",
  ]),
  support("mobility.general", "Мобильность: общий комплекс", "mobility", [
    "shoulder_circle",
    "hip_circle",
    "spinal_mobility",
    "thoracic_rotation",
    "pelvic_tilt",
    "adductor_mobility",
    "ankle_circle",
  ]),
  support("mobility.upper", "Мобильность: плечи и спина", "mobility", [
    "shoulder_circle",
    "wall_slide",
    "spinal_mobility",
    "thoracic_rotation",
    "forearm_rotation",
    "wrist_circle",
  ]),
  support("mobility.lower", "Мобильность: таз и голеностоп", "mobility", [
    "hip_circle",
    "pelvic_tilt",
    "adductor_mobility",
    "ankle_mobility",
    "ankle_circle",
  ]),
  support("mobility.standing", "Мобильность стоя", "mobility", [
    "shoulder_circle",
    "wall_slide",
    "hip_circle",
    "wrist_circle",
    "forearm_rotation",
    "ankle_circle",
  ]),
  support("mobility.floor", "Мобильность: спина, таз и запястья на полу", "mobility", [
    "shoulder_circle",
    "hip_circle",
    "wrist_rock",
    "spinal_mobility",
    "adductor_mobility",
    "half_kneeling_rock",
    "thoracic_rotation",
    "pelvic_tilt",
  ]),
  support("yoga.floor", "Йога: спокойная последовательность", "yoga", [
    "easy_seat",
    "child",
    "sphinx",
    "bound_angle",
    "easy_twist",
    "reclined_twist",
    "corpse",
  ]),
  support("yoga.general", "Йога: от стояния к отдыху", "yoga", [
    "mountain",
    "forward_fold",
    "half_lift",
    "low_lunge",
    "child",
    "staff",
    "easy_twist",
    "happy_baby",
    "corpse",
  ]),
  support("yoga.standing", "Йога: устойчивость и баланс", "yoga", [
    "mountain",
    "tree",
    "warrior_one",
    "forward_fold",
    "half_lift",
    "child",
    "corpse",
  ]),
  support("yoga.gentle", "Йога: мягкий комплекс на полу", "yoga", [
    "easy_seat",
    "puppy",
    "gate",
    "child",
    "bound_angle",
    "reclined_twist",
    "corpse",
  ]),
  support("yoga.active", "Йога: последовательность с работой ног", "yoga", [
    "mountain",
    "warrior_one",
    "low_lunge",
    "child",
    "bridge",
    "happy_baby",
    "corpse",
  ]),
];

export const PLANNER_ALL_GROUPS: readonly PlannerExerciseGroup[] = [
  ...Object.values(PLANNER_LOADING_GROUPS),
  ...PLANNER_SUPPORT_GROUPS,
];
