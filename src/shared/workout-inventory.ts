import type { CatalogContext, CatalogDirection } from "./catalog-taxonomy";
import type { BuilderInventory, BuilderResourceOption } from "./workout-builder";

type InventoryResources = BuilderInventory["resources"];
export type EquipmentArt =
  | "dumbbell"
  | "kettlebell"
  | "barbell"
  | "band"
  | "bench"
  | "mat"
  | "block"
  | "strap"
  | "bolster"
  | "blanket"
  | "roller"
  | "rings"
  | "pullup"
  | "parallettes"
  | "vest"
  | "belt"
  | "backpack";
export interface InventoryCard {
  id: string;
  name: string;
  art: EquipmentArt;
  quantity: number;
  codes: string[];
  family?: string;
  directions: CatalogDirection[];
}

const strength: CatalogDirection[] = ["strength"];
const calisthenics: CatalogDirection[] = ["calisthenics"];
const gentle: CatalogDirection[] = ["yoga", "stretch", "mobility"];
export const inventoryCards: InventoryCard[] = [
  {
    id: "dumbbell-single",
    name: "Гантель",
    art: "dumbbell",
    quantity: 1,
    codes: ["dumbbell"],
    family: "dumbbell",
    directions: strength,
  },
  {
    id: "dumbbell-pair",
    name: "Гантели",
    art: "dumbbell",
    quantity: 2,
    codes: ["dumbbell"],
    family: "dumbbell",
    directions: strength,
  },
  {
    id: "kettlebell-single",
    name: "Гиря",
    art: "kettlebell",
    quantity: 1,
    codes: ["kettlebell"],
    family: "kettlebell",
    directions: strength,
  },
  {
    id: "kettlebell-pair",
    name: "Гири",
    art: "kettlebell",
    quantity: 2,
    codes: ["kettlebell"],
    family: "kettlebell",
    directions: strength,
  },
  {
    id: "barbell",
    name: "Штанга с блинами",
    art: "barbell",
    quantity: 1,
    codes: ["barbell", "barbell_with_plates_and_collars", "plates"],
    directions: strength,
  },
  {
    id: "band",
    name: "Резинки",
    art: "band",
    quantity: 1,
    codes: ["resistance_band", "assistance_band"],
    directions: ["strength", "calisthenics", "stretch", "mobility"],
  },
  {
    id: "bench",
    name: "Скамья",
    art: "bench",
    quantity: 1,
    codes: ["bench", "stable_bench", "stable_flat_bench"],
    directions: strength,
  },
  {
    id: "mat",
    name: "Коврик",
    art: "mat",
    quantity: 1,
    codes: ["mat"],
    directions: ["strength", "calisthenics", ...gentle],
  },
  {
    id: "block",
    name: "Блоки для йоги",
    art: "block",
    quantity: 2,
    codes: ["yoga_block"],
    directions: ["yoga"],
  },
  {
    id: "yoga-strap",
    name: "Ремень для йоги",
    art: "strap",
    quantity: 1,
    codes: ["yoga_strap"],
    directions: ["yoga"],
  },
  {
    id: "stretch-strap",
    name: "Ремень для растяжки",
    art: "strap",
    quantity: 1,
    codes: ["stretch_strap"],
    directions: ["stretch", "mobility"],
  },
  {
    id: "bolster",
    name: "Болстер",
    art: "bolster",
    quantity: 1,
    codes: ["bolster"],
    directions: ["yoga"],
  },
  {
    id: "blanket",
    name: "Плед",
    art: "blanket",
    quantity: 1,
    codes: ["blanket"],
    directions: ["yoga"],
  },
  {
    id: "roller",
    name: "Массажный ролл",
    art: "roller",
    quantity: 1,
    codes: ["foam_roller"],
    directions: ["stretch", "mobility"],
  },
  {
    id: "pullup",
    name: "Турник",
    art: "pullup",
    quantity: 1,
    codes: ["pull_up_bar", "verified_secure_bar_mounting"],
    directions: ["strength", "calisthenics"],
  },
  {
    id: "rings",
    name: "Кольца",
    art: "rings",
    quantity: 2,
    codes: ["gymnastic_rings", "verified_secure_ring_anchor"],
    directions: calisthenics,
  },
  {
    id: "parallettes",
    name: "Паралетсы",
    art: "parallettes",
    quantity: 2,
    codes: ["parallettes", "verified_stable_parallettes"],
    directions: calisthenics,
  },
  {
    id: "bars",
    name: "Брусья",
    art: "parallettes",
    quantity: 1,
    codes: ["parallel_bars"],
    directions: calisthenics,
  },
  {
    id: "vest",
    name: "Жилет-утяжелитель",
    art: "vest",
    quantity: 1,
    codes: ["weighted_vest"],
    directions: calisthenics,
  },
  {
    id: "belt",
    name: "Пояс для отягощений",
    art: "belt",
    quantity: 1,
    codes: ["dip_belt"],
    directions: calisthenics,
  },
  {
    id: "backpack",
    name: "Рюкзак с грузом",
    art: "backpack",
    quantity: 1,
    codes: ["backpack"],
    directions: calisthenics,
  },
];

export function asksForInventory(place: CatalogContext, direction: CatalogDirection): boolean {
  return (
    place !== "gym" &&
    (place === "home" || direction === "calisthenics" || gentle.includes(direction))
  );
}

export function cardSelected(card: InventoryCard, resources: InventoryResources): boolean {
  const resource = resources.find((item) => item.code === card.codes[0]);
  return Boolean(
    resource && (card.family ? Math.min(resource.quantity, 2) === card.quantity : true),
  );
}

export function relevantInventoryCards(
  direction: CatalogDirection,
  place: CatalogContext,
  options: BuilderResourceOption[],
  selected: InventoryResources,
): InventoryCard[] {
  const available = new Set(options.map((item) => item.code));
  return inventoryCards.filter((card) => {
    if (!card.directions.includes(direction) || !available.has(card.codes[0])) return false;
    if (place !== "home" && card.id === "bench") return false;
    if (!card.family || cardSelected(card, selected)) return true;
    return !inventoryCards.some(
      (other) => other.family === card.family && cardSelected(other, selected),
    );
  });
}

export function toggleInventoryCard(
  selected: InventoryResources,
  card: InventoryCard,
  options: BuilderResourceOption[],
): InventoryResources {
  const retained = selected.filter((item) => !card.codes.includes(item.code));
  if (cardSelected(card, selected)) return retained;
  const types = new Map(options.map((item) => [item.code, item]));
  return [
    ...retained,
    ...card.codes
      .filter((code) => types.has(code))
      .map((code) => ({
        code,
        quantity: code === card.codes[0] ? card.quantity : 1,
        isStable: types.get(code)!.requiresConfirmation ? false : null,
      })),
  ];
}

// Product assumption: a normally equipped gym, not every possible catalog resource.
export const STANDARD_GYM_CODES = [
  "dumbbell",
  "kettlebell",
  "barbell",
  "barbell_with_plates_and_collars",
  "plates",
  "ez_bar",
  "ez_bar_with_plates_and_collars",
  "bench",
  "stable_bench",
  "stable_flat_bench",
  "stable_bench_with_backrest",
  "secured_stable_bench",
  "secured_stable_exercise_bench",
  "squat_rack_with_safeties",
  "bench_press_station_with_safeties",
  "incline_bench_press_station_with_safeties",
  "cable_station",
  "cable_station_with_handle",
  "dual_cable_station_with_handles",
  "high_cable_station_with_rope",
  "high_cable_station_with_bar",
  "high_cable_station_with_handle",
  "low_cable_station_with_bar",
  "low_cable_station_with_ankle_cuff",
  "ankle_cuff",
  "seated_cable_row_station_with_handle",
  "lat_pulldown_machine_with_bar",
  "lat_pulldown_machine_with_neutral_handle",
  "chest_press_machine",
  "leg_press_machine",
  "leg_extension_machine",
  "seated_leg_curl_machine",
  "hip_abduction_machine",
  "assisted_pull_up_machine",
  "assisted_dip_machine",
  "smith_machine",
  "reverse_pec_deck_machine",
  "seated_row_machine",
  "back_extension_bench",
  "preacher_bench",
  "machine_integrated_seat_and_backrest",
  "machine_integrated_seat_and_foot_support",
  "machine_integrated_seat_and_pads",
  "machine_integrated_seat_and_platform",
  "machine_integrated_seat_and_thigh_pad",
  "machine_integrated_support",
  "verified_stable_exercise_machine",
  "pull_up_bar",
  "verified_secure_bar_mounting",
  "parallel_bars",
  "mat",
  "load_pad",
] as const;

export function standardGymResources(options: BuilderResourceOption[]): InventoryResources {
  const codes = new Set<string>(STANDARD_GYM_CODES);
  return options
    .filter((item) => codes.has(item.code))
    .map((item) => ({
      code: item.code,
      quantity: item.code === "dumbbell" || item.code === "kettlebell" ? 2 : 1,
      isStable: item.requiresConfirmation ? true : null,
    }));
}
