import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { trials } from "../db/schema";
import type { ProductAccess } from "../../shared/access";
import { DomainError } from "./errors";
type Reader = Pick<ReturnType<typeof getDb>, "select">;
export async function readProductAccess(
  owner: string,
  reader: Reader = getDb(),
): Promise<ProductAccess> {
  const [row] = await reader
    .select({
      startsAt: trials.startsAt,
      endsAt: trials.endsAt,
      used: trials.used,
      reserved: sql<number>`(select count(*)::integer from ai_reply_reservations r where r.user_id=${trials.userId} and r.status='reserved' and r.expires_at>clock_timestamp())`,
      limit: trials.limit,
      now: sql<Date>`clock_timestamp()`,
    })
    .from(trials)
    .where(eq(trials.userId, owner));
  if (!row) throw new DomainError("TRIAL_NOT_FOUND", 404, "Данные доступа не найдены.");
  const now = new Date(row.now);
  const active = now >= row.startsAt && now < row.endsAt;
  return {
    mode: active ? "trial" : "archive",
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    serverNow: now.toISOString(),
    remainingReplies: active ? Math.max(0, row.limit - row.used - row.reserved) : 0,
    paymentsAvailable: false,
  };
}
export async function assertProductAccess(owner: string, reader: Reader = getDb()) {
  if ((await readProductAccess(owner, reader)).mode !== "trial")
    throw new DomainError(
      "PRODUCT_ACCESS_EXPIRED",
      403,
      "Пробный доступ закончился. История, прогресс и данные аккаунта остаются доступны в архиве.",
    );
}
