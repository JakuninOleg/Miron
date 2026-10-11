import type { CatalogSkillDemand } from "../../shared/catalog-taxonomy";

// This is the finite editorial policy for the active catalogue, not a clinical admission rule.
export const VALID_SKILL_GRAPH_CODES = [
  "calisthenics.l_sit",
  "calisthenics.handstand_wall_path",
  "calisthenics.planche",
  "calisthenics.front_lever",
  "calisthenics.back_lever_rotation",
  "calisthenics.ring_muscle_up",
  "calisthenics.bar_muscle_up",
] as const;

export type ValidSkillGraphCode = (typeof VALID_SKILL_GRAPH_CODES)[number];

export interface CatalogSkillPolicyEntry {
  kind: CatalogSkillDemand["kind"];
  allowedGraphCodes: readonly ValidSkillGraphCode[];
}

// Stable IDs prevent a display-name change or fabricated graph from changing skill admission.
export const CATALOG_SKILL_POLICY: Readonly<Record<string, CatalogSkillPolicyEntry>> = {
  "strength.squat.bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.squat.goblet_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.squat.barbell_back": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.split_squat.bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.lunge.reverse_bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.step_up.bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.glute_bridge.bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.hip_thrust.dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.romanian_deadlift.dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.romanian_deadlift.barbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.deadlift.kettlebell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.calf_raise.standing_bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.push_up.floor": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.push_up.wall": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.push_up.incline": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.push_up.knees": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.horizontal_press.dumbbell_floor": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.horizontal_press.dumbbell_bench": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.horizontal_press.barbell_bench": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.overhead_press.dumbbell_standing": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.overhead_press.dumbbell_seated": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.lateral_raise.dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.row.single_arm_dumbbell_supported": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.row.barbell_bent_over": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.vertical_pull.lat_pulldown": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.row.seated_cable": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pull_up.assisted_machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pull_up.fixed_bar": {
    kind: "none",
    allowedGraphCodes: ["calisthenics.l_sit", "calisthenics.bar_muscle_up"],
  },
  "strength.inverted_row.fixed_bar": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.biceps_curl.dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.biceps_curl.hammer_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.triceps_extension.cable_rope": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.leg_press.machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.knee_extension.machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.knee_flexion.seated_machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.horizontal_press.machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.dead_bug.alternating": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.bird_dog.alternating": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.plank.forearm": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.side_plank.knees": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.squat.goblet_kettlebell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.squat.barbell_front": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.squat.box_bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.wall_sit.bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.split_squat.dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.split_squat.bulgarian_bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.split_squat.bulgarian_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.lunge.forward_bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.lunge.reverse_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.lunge.walking_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.lunge.lateral_bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.step_up.dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.glute_bridge.single_leg_bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.glute_bridge.dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.hip_thrust.barbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.romanian_deadlift.single_leg_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.deadlift.barbell_conventional": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.deadlift.barbell_sumo": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.knee_flexion.lying_machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.calf_raise.single_leg_bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.calf_raise.standing_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.calf_raise.seated_machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.hip_abduction.seated_machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.hip_abduction.standing_cable": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.donkey_kick.quadruped": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.horizontal_press.barbell_incline": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.horizontal_press.dumbbell_incline": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.chest_fly.dumbbell_bench": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.chest_fly.standing_cable": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.chest_fly.pec_deck": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.horizontal_press.barbell_close_grip": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.push_up.diamond": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.push_up.decline": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.push_up.resistance_band": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.dip.parallel_bars": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.dip.assisted_machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.overhead_press.barbell_standing": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.overhead_press.machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.overhead_press.resistance_band": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.lateral_raise.single_arm_cable": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.front_raise.dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.rear_delt_fly.dumbbell_bent_over": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.rear_delt_fly.machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.row.dumbbell_bent_over": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.row.chest_supported_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.row.machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.row.resistance_band": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.vertical_pull.neutral_lat_pulldown": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.vertical_pull.single_arm_cable": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.straight_arm_pulldown.cable": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pull_up.chin_up": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pull_up.neutral_grip": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pull_up.assistance_band": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pull_up.eccentric": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.inverted_row.suspension_trainer": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.band_pull_apart.standing": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.face_pull.cable_rope": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.face_pull.resistance_band": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.shrug.dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.biceps_curl.barbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.biceps_curl.ez_bar": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.biceps_curl.preacher_ez": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.biceps_curl.incline_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.biceps_curl.concentration_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.biceps_curl.cable": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.biceps_curl.resistance_band": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.triceps_extension.dumbbell_overhead": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.triceps_extension.lying_ez": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.triceps_extension.resistance_band_pushdown": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.triceps_extension.dumbbell_kickback": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.crunch.floor": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.reverse_crunch.floor": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.leg_raise.supine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.hanging_knee_raise.fixed_bar": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.mountain_climber.alternating": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.side_plank.feet": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.plank.high": {
    kind: "none",
    allowedGraphCodes: ["calisthenics.planche"],
  },
  "strength.pallof_press.cable": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.farmer_carry.dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.back_extension.roman_chair": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.calf.wall_straight_knee": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.calf.wall_bent_knee": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.quadriceps.standing_supported": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.hamstring.supine_strap": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.hip_flexor.half_kneeling": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.gluteal.supine_figure_four": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.adductor.seated_butterfly": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.adductor.standing_side_lunge": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.pectoral.doorway_single_arm": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.posterior_shoulder.cross_body": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.triceps.overhead": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.latissimus.kneeling_bench": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.spinal_flexion_extension.quadruped": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.thoracic_rotation.side_lying": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.hip_rotation.seated_90_90": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.ankle_dorsiflexion.knee_to_wall": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.shoulder_flexion.wall_slide": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.wrist.quadruped_rock": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.mountain.standing": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.tree.wall_supported": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.chair.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.warrior_one.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.warrior_two.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.triangle.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.child.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.downward_dog.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.cobra.low": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.sphinx.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.bridge.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.bound_angle.seated": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.easy_seat.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.corpse.supine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.hamstring.seated_chair": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.hamstring.standing_step": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.hamstring.supine_hand_supported": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.quadriceps.side_lying": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.hip_flexor.standing_split": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.gluteal.seated_figure_four": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.adductor.kneeling_frog": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.pectoral.wall_single_arm": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.pectoral.supine_roller": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.biceps.wall_straight_arm": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.wrist_flexor.hand_assisted": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.wrist_extensor.hand_assisted": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.neck.seated_side_tilt": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.neck.seated_diagonal": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.latissimus.standing_wall": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.side_body.standing": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.lower_back.knees_to_chest": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "stretch.calf.seated_strap": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.shoulder_circle.standing": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.shoulder_flexion.dowel_overhead": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.hip_circle.standing": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.adductor.quadruped_rock_back": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.ankle_circle.seated": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.toes.seated_flex_extend": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.wrist.standing_circle": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.forearm_rotation.seated": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.neck_rotation.seated": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.neck_side_bend.seated": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.thoracic_extension.foam_roller": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.pelvic_tilt.supine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.half_kneeling_rock.forward_back": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "mobility.scapula.wall_glide": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.forward_fold.standing": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.half_lift.standing": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.staff.seated": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.seated_forward_fold.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.head_to_knee.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.low_lunge.knee_down": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.high_lunge.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.side_angle.forearm_on_thigh": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.reverse_warrior.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.reclined_twist.bent_knees": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.happy_baby.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.legs_up_wall.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.puppy.standard": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.easy_twist.seated": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.locust.low": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "yoga.gate.kneeling": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.hollow.tuck_hold": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.hollow.full_hold": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.hollow.rock": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.arch.hold": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.arch.rock": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.compression_raise.seated_single_leg": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.l_sit"],
  },
  "strength.compression_raise.seated_double_leg": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.l_sit"],
  },
  "strength.hanging_leg_raise.straight_legs": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.hanging_leg_raise.strict_toes_to_bar": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.leg_raise.parallel_bars": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.dead_hang.passive_bar": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.dead_hang.active_bar": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.scapular_pull_up.fixed_bar": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pull_up.chin_over_bar_hold": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.inverted_row.gymnastic_rings": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.inverted_row.rings_feet_elevated": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pull_up.gymnastic_rings": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pull_up.strict_chest_to_bar": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.bar_muscle_up"],
  },
  "strength.pull_up.explosive_bar": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.bar_muscle_up"],
  },
  "strength.pull_up.l_sit_bar": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.l_sit"],
  },
  "strength.pull_up.archer_bar": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pull_up.commando_bar": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.false_grip_hang.feet_supported_rings": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.ring_muscle_up"],
  },
  "strength.pull_up.false_grip_rings": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.ring_muscle_up"],
  },
  "strength.scapular_push_up.floor": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.planche"],
  },
  "strength.push_up.archer": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.push_up.pseudo_planche": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.planche"],
  },
  "strength.push_up.gymnastic_rings": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.push_up.rings_incline": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.push_up.explosive": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pike_push_up.floor": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.pike_push_up.feet_elevated": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.dip.straight_bar": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.bar_muscle_up"],
  },
  "strength.dip.rings_feet_supported": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.ring_muscle_up"],
  },
  "strength.dip.strict_rings": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.ring_muscle_up"],
  },
  "strength.support_hold.parallel_bars": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.l_sit"],
  },
  "strength.support_hold.rings_feet_supported": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.ring_muscle_up"],
  },
  "strength.support_hold.gymnastic_rings": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.l_sit", "calisthenics.ring_muscle_up"],
  },
  "strength.planche_lean.floor": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.planche"],
  },
  "strength.planche.tuck_parallettes": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.planche"],
  },
  "strength.handstand.elevated_l_support": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.wall_walk.standard": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.handstand.chest_to_wall_hold": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.handstand.back_to_wall_hold": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.handstand.wall_float": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.handstand.wall_kick_up": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.handstand.freestanding_kick_up": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.handstand.freestanding_hold": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.handstand_push_up.wall_eccentric": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.handstand_push_up.strict_wall": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.handstand_wall_path"],
  },
  "strength.l_sit.tuck_parallettes": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.l_sit"],
  },
  "strength.l_sit.one_leg_parallettes": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.l_sit"],
  },
  "strength.l_sit.full_parallettes": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.l_sit"],
  },
  "strength.l_sit.full_floor": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.l_sit"],
  },
  "strength.l_sit.tuck_rings": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.l_sit"],
  },
  "strength.l_sit.full_rings": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.l_sit"],
  },
  "strength.front_lever.tuck_hold": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.front_lever"],
  },
  "strength.front_lever.tuck_eccentric": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.front_lever"],
  },
  "strength.front_lever.open_tuck_hold": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.front_lever"],
  },
  "strength.front_lever.open_tuck_eccentric": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.front_lever"],
  },
  "strength.front_lever.straddle_hold": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.front_lever"],
  },
  "strength.front_lever.straddle_eccentric": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.front_lever"],
  },
  "strength.front_lever.full_hold": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.front_lever"],
  },
  "strength.front_lever.full_eccentric": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.front_lever"],
  },
  "strength.back_lever.tuck_hold": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.back_lever_rotation"],
  },
  "strength.back_lever.open_tuck_hold": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.back_lever_rotation"],
  },
  "strength.skin_the_cat.feet_supported_rings": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.back_lever_rotation"],
  },
  "strength.skin_the_cat.strict_rings": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.back_lever_rotation"],
  },
  "strength.inverted_row.false_grip_rings": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.ring_muscle_up"],
  },
  "strength.muscle_up_transition.low_rings": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.ring_muscle_up"],
  },
  "strength.muscle_up.feet_supported_low_rings": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.ring_muscle_up"],
  },
  "strength.muscle_up.band_assisted_rings": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.ring_muscle_up"],
  },
  "strength.muscle_up.strict_rings": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.ring_muscle_up"],
  },
  "strength.muscle_up_transition.low_bar": {
    kind: "preparation",
    allowedGraphCodes: ["calisthenics.bar_muscle_up"],
  },
  "strength.muscle_up.band_assisted_bar": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.bar_muscle_up"],
  },
  "strength.muscle_up.strict_bar": {
    kind: "movement",
    allowedGraphCodes: ["calisthenics.bar_muscle_up"],
  },
  "strength.pistol_squat.hand_supported": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pistol_squat.to_box": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pistol_squat.eccentric": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.pistol_squat.full": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.shrimp_squat.hand_supported": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.shrimp_squat.to_padded_support": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.shrimp_squat.full": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.nordic_curl.band_assisted": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.nordic_curl.eccentric": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.nordic_curl.full": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.reverse_nordic.bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.knee_flexion.sliding_bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.hamstring_walkout.floor": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.step_down.bodyweight": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.leg_press.single_leg_machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.knee_extension.single_leg_machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.knee_flexion.single_leg_seated_machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.calf_raise.leg_press_machine": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.horizontal_press.single_arm_cable_standing": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.overhead_press.single_arm_kettlebell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.triceps_extension.single_arm_cable": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.biceps_curl.reverse_barbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.wrist_curl.seated_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
  "strength.suitcase_carry.single_dumbbell": {
    kind: "none",
    allowedGraphCodes: [],
  },
};
