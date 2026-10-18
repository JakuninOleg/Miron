import { createHash } from "node:crypto";
import { and, asc, count, eq, gte, lte, ne } from "drizzle-orm";
import { z } from "zod";
import {
  validCalendarDate,
  type CalendarEntry,
  type CalendarSnapshot,
} from "../../shared/calendar";
import { getDb } from "../db";
import { builderCommands, calendarEntries, profiles, user } from "../db/schema";
import { DomainError } from "./errors";
import { assertProductAccess } from "./access";
import { readSavedSource, readStartSource } from "./workout-sources";

const dateInput = z.string().refine(validCalendarDate, "Выбери существующую дату.");
const revision = z.number().int().min(1).max(1_000_000);
const base = { operationId: z.uuid(), id: z.uuid() };
const saved = z.strictObject({ source: z.enum(["template", "history"]), id: z.uuid(), revision });
const planner = z.strictObject({
  source: z.literal("planner"),
  dayKey: z.string().min(1).max(80),
  revision,
});
export const calendarCommandInput = z.discriminatedUnion("type", [
  z.strictObject({
    ...base,
    type: z.literal("create"),
    date: dateInput,
    selection: z.union([saved, planner]),
  }),
  z.strictObject({ ...base, type: z.literal("move"), expectedRevision: revision, date: dateInput }),
  z.strictObject({ ...base, type: z.enum(["skip", "cancel"]), expectedRevision: revision }),
]);
function dto(row: typeof calendarEntries.$inferSelect): CalendarEntry {
  return {
    id: row.id,
    revision: row.revision,
    date: row.date,
    timezone: row.timezone,
    status: row.status,
    title: row.snapshot.day.title,
    workoutId: row.workoutId,
  };
}
export async function listCalendar(
  owner: string,
  from: string,
  to: string,
): Promise<CalendarEntry[]> {
  dateInput.parse(from);
  dateInput.parse(to);
  if (from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000)
    throw new DomainError("INVALID_RANGE", 400, "Выбери период до года.");
  return (
    await getDb()
      .select()
      .from(calendarEntries)
      .where(
        and(
          eq(calendarEntries.userId, owner),
          gte(calendarEntries.date, from),
          lte(calendarEntries.date, to),
          ne(calendarEntries.status, "cancelled"),
        ),
      )
      .orderBy(asc(calendarEntries.date))
      .limit(500)
  ).map(dto);
}
export async function applyCalendarCommand(owner: string, raw: unknown): Promise<CalendarEntry> {
  const input = calendarCommandInput.parse(raw);
  const hash = createHash("sha256")
    .update(JSON.stringify({ action: "calendar", input }))
    .digest("hex");
  return getDb().transaction(async (tx) => {
    const [principal] = await tx.select().from(user).where(eq(user.id, owner)).for("update");
    if (principal?.status !== "active")
      throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
    const [replay] = await tx
      .select()
      .from(builderCommands)
      .where(
        and(eq(builderCommands.userId, owner), eq(builderCommands.operationId, input.operationId)),
      );
    if (replay) {
      if (replay.payloadHash !== hash)
        throw new DomainError(
          "OPERATION_REUSED",
          409,
          "Запрос уже использован для другого действия.",
        );
      return replay.result as CalendarEntry;
    }
    let result: typeof calendarEntries.$inferSelect;
    if (input.type === "create" || input.type === "move") await assertProductAccess(owner, tx);
    if (input.type === "create") {
      const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, owner));
      if (!profile?.adultConfirmed || !profile.onboardingCompleted)
        throw new DomainError("ONBOARDING_REQUIRED", 409, "Сначала заполни профиль.");
      const [size] = await tx
        .select({ total: count() })
        .from(calendarEntries)
        .where(and(eq(calendarEntries.userId, owner), eq(calendarEntries.status, "planned")));
      if (size.total >= 200)
        throw new DomainError("CALENDAR_LIMIT", 409, "В расписании уже 200 будущих занятий.");
      let snapshot: CalendarSnapshot;
      if (input.selection.source === "planner") {
        const source = await readStartSource(
          owner,
          {
            operationId: input.operationId,
            expectedProgramRevision: input.selection.revision,
            dayKey: input.selection.dayKey,
          },
          tx,
        );
        snapshot = {
          day: source.day,
          place: source.config.place,
          direction: source.config.direction,
          rewardKind: ["strength", "calisthenics"].includes(source.config.direction)
            ? "main"
            : "support",
        };
      } else {
        const source = await readSavedSource(
          owner,
          { source: input.selection.source, id: input.selection.id },
          tx,
        );
        if (source.revision !== input.selection.revision)
          throw new DomainError("REVISION_CONFLICT", 409, "Состав изменился. Открой его заново.");
        snapshot = {
          day: source.day,
          place: source.place,
          direction: source.direction,
          rewardKind: source.rewardKind,
        };
      }
      const [inserted] = await tx
        .insert(calendarEntries)
        .values({
          id: input.id,
          userId: owner,
          date: input.date,
          timezone: profile.timezone,
          snapshot,
        })
        .onConflictDoNothing()
        .returning();
      if (!inserted)
        throw new DomainError("REVISION_CONFLICT", 409, "Запись уже существует. Обнови календарь.");
      result = inserted;
    } else {
      const [current] = await tx
        .select()
        .from(calendarEntries)
        .where(and(eq(calendarEntries.userId, owner), eq(calendarEntries.id, input.id)));
      if (!current)
        throw new DomainError("SCHEDULE_NOT_FOUND", 404, "Запись календаря не найдена.");
      if (current.revision !== input.expectedRevision)
        throw new DomainError("REVISION_CONFLICT", 409, "Расписание изменилось. Обнови календарь.");
      if (current.status !== "planned")
        throw new DomainError(
          "SCHEDULE_CLOSED",
          409,
          "Можно изменить только запланированное занятие.",
        );
      [result] = await tx
        .update(calendarEntries)
        .set({
          revision: current.revision + 1,
          updatedAt: new Date(),
          ...(input.type === "move"
            ? { date: input.date }
            : { status: input.type === "skip" ? ("skipped" as const) : ("cancelled" as const) }),
        })
        .where(and(eq(calendarEntries.userId, owner), eq(calendarEntries.id, input.id)))
        .returning();
    }
    const receipt = dto(result);
    await tx.insert(builderCommands).values({
      userId: owner,
      operationId: input.operationId,
      payloadHash: hash,
      result: receipt,
    });
    return receipt;
  });
}
