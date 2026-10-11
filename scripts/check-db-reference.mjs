import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const snapshot = JSON.parse(await readFile("docs/reference/db-reference.json", "utf8"));
const exerciseById = new Map(snapshot.exercises.map((exercise) => [exercise.id, exercise]));
const activeGraphs = snapshot.skillGraphs ?? [];
const historicalGraphs = snapshot.historicalSkillGraphs ?? [];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
assert(snapshot.exercises.length === 300, "Expected the complete 300-variant semantic snapshot");
assert(activeGraphs.length === 7, "Expected exactly seven active skill graphs");
assert(
  activeGraphs.every((graph) => graph.revision === 2 && graph.status === "draft"),
  "Active graphs must contain only draft V2 revisions",
);
assert(
  new Set(activeGraphs.map((graph) => graph.code)).size === activeGraphs.length,
  "Active graph selector contains duplicate codes/history",
);
assert(
  historicalGraphs.length === 14 && snapshot.stats.skillGraphRevisions === 21,
  "Physical graph revisions must distinguish seven active and fourteen historical rows",
);
assert(
  !historicalGraphs.some((graph) => activeGraphs.some((active) => active.id === graph.id)),
  "An active graph revision also appears in historicalSkillGraphs",
);
for (const [field, value] of [
  ["activeSkillGraphs", activeGraphs.length],
  ["historicalSkillGraphRevisions", historicalGraphs.length],
  ["activeSkillGraphNodes", activeGraphs.reduce((sum, graph) => sum + graph.nodes.length, 0)],
  ["activeSkillGraphEdges", activeGraphs.reduce((sum, graph) => sum + graph.edges.length, 0)],
  [
    "skillGraphNodes",
    [...activeGraphs, ...historicalGraphs].reduce((sum, graph) => sum + graph.nodes.length, 0),
  ],
  [
    "skillGraphEdges",
    [...activeGraphs, ...historicalGraphs].reduce((sum, graph) => sum + graph.edges.length, 0),
  ],
]) {
  assert(snapshot.stats[field] === value, `Graph statistic ${field} does not match the snapshot`);
}
const activeGraphVariantIds = new Set(
  activeGraphs.flatMap((graph) => graph.nodes.map((node) => node.variantId)),
);
for (const graph of activeGraphs) {
  const outgoingNodeIds = new Set(graph.edges.map((edge) => edge.from));
  const targets = graph.nodes.filter((node) => !outgoingNodeIds.has(node.id));
  assert(targets.length > 0, `${graph.code}: graph has no terminal skill target`);
  for (const target of targets) {
    const exercise = exerciseById.get(target.variantId);
    assert(
      exercise?.editorial.skillDemand?.kind === "movement" &&
        exercise.editorial.execution.assignmentGate === "skill_review",
      `${graph.code}:${target.id}: terminal target is not an actual gated movement`,
    );
  }
}
for (const exercise of snapshot.exercises) {
  const demand = exercise.editorial?.skillDemand;
  assert(
    demand &&
      ["none", "preparation", "movement"].includes(demand.kind) &&
      typeof demand.requiresPriorSkill === "boolean" &&
      typeof demand.rationale === "string" &&
      demand.rationale.trim().length > 0,
    `${exercise.id}: missing explicit semantic skill demand/rationale`,
  );
  if (demand.kind === "none") {
    assert(!demand.requiresPriorSkill, `${exercise.id}: ordinary exercise requires a prior skill`);
    assert(
      exercise.editorial.execution.assignmentGate === "standard_review",
      `${exercise.id}: ordinary exercise is incorrectly gated by skill`,
    );
  }
  if (demand.kind === "movement") {
    assert(
      activeGraphVariantIds.has(exercise.id),
      `${exercise.id}: actual skill lacks an active graph`,
    );
    assert(
      exercise.editorial.execution.assignmentGate === "skill_review",
      `${exercise.id}: actual skill lacks skill_review`,
    );
  }
  if (demand.kind === "preparation") {
    const hasMovementPath = activeGraphs.some((graph) => {
      const starts = graph.nodes.filter((node) => node.variantId === exercise.id);
      const visited = new Set(starts.map((node) => node.id));
      const queue = starts.map((node) => node.id);
      while (queue.length) {
        const from = queue.shift();
        for (const edge of graph.edges.filter((candidate) => candidate.from === from)) {
          const node = graph.nodes.find((candidate) => candidate.id === edge.to);
          if (exerciseById.get(node?.variantId)?.editorial.skillDemand.kind === "movement")
            return true;
          if (!visited.has(edge.to)) {
            visited.add(edge.to);
            queue.push(edge.to);
          }
        }
      }
      return false;
    });
    assert(
      hasMovementPath,
      `${exercise.id}: preparation has no explicit path to an actual movement`,
    );
  }
}
const ordinaryAdvanced = snapshot.exercises.filter(
  (exercise) =>
    exercise.editorial.difficulty === "advanced" && exercise.editorial.skillDemand.kind === "none",
);
for (const exercise of snapshot.exercises.filter((item) =>
  /strength\.(?:leg_press\.|squat\.barbell_front$|nordic_curl\.|reverse_nordic\.)/.test(item.id),
)) {
  assert(
    exercise.editorial.skillDemand.kind === "none" &&
      exercise.editorial.execution.assignmentGate === "standard_review",
    `${exercise.id}: leg press/front squat/Nordic should keep ordinary expert review`,
  );
}
for (const id of [
  "strength.squat.barbell_front",
  "strength.leg_press.single_leg_machine",
  "strength.nordic_curl.eccentric",
  "strength.nordic_curl.full",
]) {
  assert(
    ordinaryAdvanced.some((exercise) => exercise.id === id),
    `${id}: advanced difficulty must survive independently of standard_review`,
  );
}
const lowRingTransition = exerciseById.get("strength.muscle_up_transition.low_rings");
assert(
  lowRingTransition?.editorial.workoutRoles.includes("skill") &&
    lowRingTransition.editorial.skillDemand.kind === "preparation" &&
    !lowRingTransition.editorial.skillDemand.requiresPriorSkill &&
    lowRingTransition.editorial.execution.assignmentGate === "standard_review",
  "Low-ring transition must remain skill practice without a prior-skill gate",
);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1740, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const equal = async (selector, expected, label) => {
  const count = await page.locator(selector).count();
  if (count !== expected)
    throw new Error(`${label}: ${count}, expected ${expected}. ${errors.join("; ")}`);
};
const firstExercise = async () => {
  const name = await page.locator("#exercise-rows .exercise-name").first().innerText();
  const exercise = snapshot.exercises.find((candidate) => candidate.displayNameRu === name);
  if (!exercise) throw new Error(`First result has no snapshot variant: ${name}`);
  return exercise;
};
const firstPrimary = async (group, label) => {
  const exercise = await firstExercise();
  if (!exercise.muscles.some((muscle) => muscle.group === group && muscle.role === "primary"))
    throw new Error(`${label}: first result ${exercise.id} has no primary ${group}`);
  return exercise;
};
try {
  await page.goto(
    process.argv[2] ?? pathToFileURL(resolve("docs/reference/miron-database.html")).href,
  );
  await page.getByRole("heading", { name: "Как устроена база данных" }).waitFor();
  await equal("#map .node", 15, "Catalogue diagram nodes");
  await page.screenshot({ path: "artifacts/screenshots/database-erd.png", fullPage: true });
  await page
    .getByRole("button", { name: `Вся база · ${snapshot.tables.length} таблиц`, exact: true })
    .click();
  await equal("#map .node", snapshot.tables.length, "Physical tables");
  await equal("#map .edge", snapshot.foreignKeys.length, "Foreign keys");
  await equal("#map .group-caption", 7, "Physical diagram domain captions");
  const skillCaption = page.locator("#map .group-caption").filter({ hasText: "Графы навыков" });
  if ((await skillCaption.getAttribute("x")) !== "1250")
    throw new Error("Skills domain caption is missing or over the wrong column");
  await page.locator('#map [data-table="media_assets"]').click();
  if (!(await page.locator("#details").innerText()).includes("0..1 родитель"))
    throw new Error("Nullable media FK missing");
  await page.locator('#map [data-table="variant_revision_muscles"]').click();
  if (!(await page.locator("#details").innerText()).includes("muscle_groups"))
    throw new Error("Muscle FK missing");
  await page.locator('#map [data-table="skill_graph_edges"]').click();
  if (!(await page.locator("#details").innerText()).includes("skill_graph_nodes"))
    throw new Error("Scoped skill node FK missing");
  const svg = await page.evaluate(() => window.makeFullSvg());
  await writeFile("docs/reference/miron-erd.svg", svg, "utf8");
  await page.getByRole("tab", { name: "Упражнения", exact: true }).click();
  if (page.url().startsWith("http")) {
    for (const file of ["exercises.csv", "catalog-semantic-qa.csv"]) {
      const response = await page.request.head(new URL(file, page.url()).href);
      assert(
        response.status() === 200 && response.headers()["content-type"]?.startsWith("text/csv"),
        `${file}: reference download is unavailable or has the wrong content type`,
      );
    }
  }
  await equal("#exercise-rows .exercise-name", 300, "Catalogue variants");
  await page.screenshot({ path: "artifacts/screenshots/exercise-table.png" });
  for (const d of ["strength", "calisthenics", "yoga", "stretch", "mobility"]) {
    await page.locator("#discipline").selectOption(d);
    await equal(
      "#exercise-rows .exercise-name",
      snapshot.exercises.filter((e) => e.directions.includes(d)).length,
      `Direction ${d}`,
    );
  }
  await page.locator("#discipline").selectOption("");
  for (const c of ["home", "gym", "outdoor", "workout_park"]) {
    await page.locator("#context").selectOption(c);
    await equal(
      "#exercise-rows .exercise-name",
      snapshot.exercises.filter((e) => e.contexts.includes(c)).length,
      `Context ${c}`,
    );
  }
  await page.locator("#context").selectOption("");
  await page.locator("#search").fill("молотки");
  if (
    !(await page
      .locator("#exercise-rows .exercise-name")
      .allTextContents()
      .then((names) => names.includes("Молот")))
  )
    throw new Error("Russian aliases missing");
  await page.locator("#search").fill("молот");
  if ((await page.locator("#exercise-rows .exercise-name").first().innerText()) !== "Молот")
    throw new Error("Exact short-name match did not rank first");
  await page.locator("#search").fill("пресс дома");
  if (!(await page.locator("#exercise-rows").textContent()).includes("strength.plank.forearm"))
    throw new Error("Multi-token muscle + context search failed");
  const homeAbs = await firstPrimary("abs", "Primary focus ranking for пресс дома");
  if (!homeAbs.contexts.includes("home")) throw new Error("Home abs result lacks home context");
  await page.locator("#search").fill("бицепс");
  await firstPrimary("biceps", "Primary focus ranking for бицепс");
  const secondaryBiceps = snapshot.exercises.find((exercise) =>
    exercise.muscles.some((muscle) => muscle.group === "biceps" && muscle.role === "secondary"),
  );
  if (
    !secondaryBiceps ||
    !(await page.locator("#exercise-rows").textContent()).includes(secondaryBiceps.id)
  )
    throw new Error("Primary ranking hid secondary muscle participation from search");
  for (const [query, muscle] of [
    ["банка", "biceps"],
    ["попа", "glutes"],
    ["грудные", "chest"],
    ["широчайшие", "back"],
  ]) {
    await page.locator("#search").fill(query);
    await firstPrimary(muscle, `Muscle alias ranking for ${query}`);
  }
  await page.locator("#search").fill("");
  for (const [selector, field, value] of [
    ["#workout-role", "workoutRoles", "main"],
    ["#purpose", "purposes", "skill"],
  ]) {
    await page.locator(selector).selectOption(value);
    await equal(
      "#exercise-rows .exercise-name",
      snapshot.exercises.filter((exercise) => exercise.editorial[field].includes(value)).length,
      `Editorial ${field} filter`,
    );
    await page.locator(selector).selectOption("");
  }
  await page.locator("#canonical").selectOption("true");
  await equal(
    "#exercise-rows .exercise-name",
    snapshot.exercises.filter((exercise) => exercise.editorial.canonical).length,
    "Canonical editorial cards",
  );
  await page.locator("#canonical").selectOption("");
  await equal(
    '[data-skill-gate="skill_review"]',
    snapshot.exercises.filter(
      (exercise) => exercise.editorial.execution.assignmentGate === "skill_review",
    ).length,
    "Manual skill gate visibility",
  );
  await equal(
    '#exercise-rows [data-skill-gate="standard_review"]',
    snapshot.exercises.filter(
      (exercise) => exercise.editorial.execution.assignmentGate === "standard_review",
    ).length,
    "Standard expert review visibility",
  );
  for (const [selector, predicate, value] of [
    ["#difficulty", (exercise) => exercise.editorial.difficulty === "advanced", "advanced"],
    [
      "#skill-kind",
      (exercise) => exercise.editorial.skillDemand.kind === "preparation",
      "preparation",
    ],
    [
      "#assignment-gate",
      (exercise) => exercise.editorial.execution.assignmentGate === "standard_review",
      "standard_review",
    ],
  ]) {
    await page.locator(selector).selectOption(value);
    await equal(
      "#exercise-rows .exercise-name",
      snapshot.exercises.filter(predicate).length,
      `${selector} independent filter`,
    );
    await page.locator(selector).selectOption("");
  }
  await page.locator("#difficulty").selectOption("advanced");
  await page.locator("#assignment-gate").selectOption("standard_review");
  await page.locator("#skill-kind").selectOption("none");
  await equal(
    "#exercise-rows .exercise-name",
    ordinaryAdvanced.length,
    "Advanced ordinary exercise intersection",
  );
  for (const exercise of ordinaryAdvanced) {
    const row = page.locator(`#exercise-rows tr[data-variant="${exercise.id}"]`);
    assert((await row.count()) === 1, `${exercise.id}: advanced standard-review row is missing`);
    assert(
      (await row.locator('[data-difficulty="advanced"]').count()) === 1,
      `${exercise.id}: difficulty is not visible`,
    );
    assert(
      (await row.locator('[data-skill-kind="none"]').count()) === 1,
      `${exercise.id}: ordinary skill nature is not visible`,
    );
    assert(
      (await row.locator('[data-prior-skill="false"]').count()) === 1,
      `${exercise.id}: prior skill is not visible`,
    );
  }
  await page.locator("#difficulty").selectOption("");
  await page.locator("#assignment-gate").selectOption("");
  await page.locator("#skill-kind").selectOption("");
  await page.locator("#workout-role").selectOption("skill");
  const transitionRow = page.locator(`#exercise-rows tr[data-variant="${lowRingTransition.id}"]`);
  assert(
    (await transitionRow.count()) === 1,
    "Skill role incorrectly hides preparation without a prior skill",
  );
  await transitionRow.locator("summary").click();
  assert(
    (await transitionRow.locator("[data-skill-rationale]").innerText()).includes(
      lowRingTransition.editorial.skillDemand.rationale,
    ),
    "Skill-demand rationale is not readable in the card",
  );
  await transitionRow.locator("summary").click();
  await page.locator("#workout-role").selectOption("");
  await page.locator("#muscle").selectOption("triceps");
  const bench = "strength.horizontal_press.barbell_bench";
  if ((await page.locator("#exercise-rows").textContent()).includes(bench))
    throw new Error("Chest bench misclassified as primary triceps");
  await page.locator("#muscle-role").selectOption("any");
  if (!(await page.locator("#exercise-rows").textContent()).includes(bench))
    throw new Error("Bench secondary triceps participation missing");
  await page.locator("#muscle").selectOption("");
  await page.locator("#resource").selectOption("parallel_bars");
  if (
    !(await page
      .locator("#exercise-rows")
      .innerText()
      .then((t) => t.includes("Брусья")))
  )
    throw new Error("Resource filter failed");
  await page.locator("#resource").selectOption("");
  await page.getByRole("tab", { name: "Навыки", exact: true }).click();
  await equal("#skill-graph option", 7, "Only seven active graph options");
  const historyText = await page.locator("#skill-history").innerText();
  assert(
    historyText.includes("Активные графы: 7") &&
      historyText.includes("Исторических ревизий: 14") &&
      historyText.includes("физических ревизий в БД: 21"),
    "Graph history and active counts are not clearly separated",
  );
  if (!snapshot.skillGraphs?.length) throw new Error("Expected actual draft skill graphs");
  for (const graph of snapshot.skillGraphs) {
    await page.locator("#skill-graph").selectOption(graph.code);
    await equal("#skill-map .skill-node", graph.nodes.length, `Skill ${graph.code} nodes`);
    await equal(
      "#skill-map .skill-edge.prerequisite",
      graph.edges.filter((edge) => edge.kind === "prerequisite").length,
      `Skill ${graph.code} prerequisites`,
    );
    await equal(
      "#skill-map .skill-edge.preparation",
      graph.edges.filter((edge) => edge.kind === "preparation").length,
      `Skill ${graph.code} preparation`,
    );
  }
  const proofGraph =
    snapshot.skillGraphs.find((graph) => graph.code === "calisthenics.front_lever") ??
    snapshot.skillGraphs[0];
  await page.locator("#skill-graph").selectOption(proofGraph.code);
  await page.locator("#skill-map .skill-node").last().focus();
  await page.keyboard.press("Enter");
  if (!(await page.locator("#skill-details").innerText()).includes("ручная проверка тренером"))
    throw new Error("Skill manual assessment semantics missing");
  await page.screenshot({ path: "artifacts/screenshots/skill-graphs.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/screenshots/skill-graphs-mobile.png", fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
    throw new Error("Mobile skill viewport overflow");
  await page.getByRole("tab", { name: "Упражнения", exact: true }).click();
  await page.locator("#search").fill("молотки");
  await page.screenshot({
    path: "artifacts/screenshots/exercise-table-mobile.png",
    fullPage: true,
  });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
    throw new Error("Mobile viewport overflow");
  for (const exercise of [
    lowRingTransition,
    ordinaryAdvanced.find((candidate) => candidate.id === "strength.squat.barbell_front"),
  ]) {
    assert(exercise, "Expected a semantic mobile regression card");
    await page.locator("#search").fill(exercise.id);
    await equal("#exercise-rows .exercise-name", 1, `Mobile semantic card ${exercise.id}`);
    const row = page.locator(`#exercise-rows tr[data-variant="${exercise.id}"]`);
    await row.locator("summary").click();
    const rationale = row.locator("[data-skill-rationale]");
    const classification = await row.locator(".detail-classification").innerText();
    assert(
      classification.includes("Сложность:") &&
        classification.includes("Предварительный навык: не требуется") &&
        classification.includes("Экспертная проверка карточки"),
      `${exercise.id}: mobile card does not show its independent semantic classification`,
    );
    assert(
      (await rationale.innerText()).includes(exercise.editorial.skillDemand.rationale),
      `${exercise.id}: mobile semantic rationale is missing`,
    );
    await row.locator(".exercise-name").scrollIntoViewIfNeeded();
    const bounds = await rationale.boundingBox();
    assert(
      bounds && bounds.width <= 350,
      `${exercise.id}: mobile details exceed readable column width`,
    );
    assert(
      !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)),
      `${exercise.id}: open mobile semantic details overflow the page`,
    );
    await page.screenshot({
      path: `artifacts/screenshots/semantic-${exercise.editorial.skillDemand.kind}-mobile.png`,
    });
  }
  await page.getByRole("tab", { name: "Схема данных", exact: true }).click();
  await page.getByRole("button", { name: "AI-доступ", exact: true }).click();
  await equal("#map .node", 3, "AI group");
  if (errors.length) throw new Error(errors.join("; "));
  await page.setContent(
    '<!doctype html><html lang="ru"><body style="margin:0">' + svg + "</body></html>",
  );
  await page.setViewportSize({ width: 1850, height: 1580 });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: "docs/reference/miron-erd.png", fullPage: true });
  console.log(
    `Verified ${snapshot.tables.length} tables/${snapshot.foreignKeys.length} FK, 300 rows, aliases, token search, independent difficulty/skill demand/gate filters, ${ordinaryAdvanced.length} advanced standard-review exercises, seven active V2 skill graphs and separate history, primary/secondary muscles, resources and 390px layout. Saved SVG/PNG/screenshots.`,
  );
} finally {
  await browser.close();
}
