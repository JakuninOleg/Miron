import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { DomainError } from "./errors";
import { ACCOUNT_EXPORT_FIELDS } from "./account-export-fields";

// Public catalog and authentication secrets are deliberately outside this personal-data export.
const personalTables: [string, string[]][] = [
  ["profiles", ["user_id"]],
  ["ai_trials", ["user_id"]],
  ["equipment_profiles", ["id"]],
  ["profile_resources", ["id"]],
  ["plans", ["id"]],
  ["workouts", ["id"]],
  ["workout_steps", ["id"]],
  ["workout_resources", ["id"]],
  ["recorded_sets", ["id"]],
  ["xp_events", ["id"]],
  ["daily_xp", ["day"]],
  ["workout_builder_inventories", ["place"]],
  ["workout_builder_inventory_resources", ["place", "resource_type_id"]],
  ["custom_workout_templates", ["id"]],
  ["custom_workout_template_steps", ["template_id", "ordinal"]],
  ["workout_planner_preferences", ["user_id"]],
  ["workout_planner_programs", ["revision"]],
  ["calendar_entries", ["id"]],
  ["journey_reads", ["chapter_id"]],
  ["communication_memory", ["scope"]],
  ["nutrition_profiles", ["user_id"]],
  ["nutrition_days", ["date"]],
  ["workout_commands", ["operation_id"]],
  ["workout_builder_commands", ["operation_id"]],
  ["workout_planner_commands", ["operation_id"]],
  ["ai_reply_reservations", ["id"]],
];
export async function exportAccountData(owner: string) {
  return getDb().transaction(
    async (tx) => {
      const principal = await tx.execute<{
        id: string;
        name: string;
        email: string;
        created_at: Date;
      }>(sql`select id,name,email,created_at from users where id=${owner} and status='active'`);
      if (!principal.rows[0])
        throw new DomainError("ACCOUNT_UNAVAILABLE", 403, "Аккаунт недоступен.");
      const data: Record<string, Record<string, unknown>[]> = {};
      let bytes = 0;
      for (const [table, keys] of personalTables) {
        const rows: Record<string, unknown>[] = [];
        for (let offset = 0; ; offset += 50) {
          const page = await tx.execute<Record<string, unknown>>(
            sql`select ${sql.join(
              ACCOUNT_EXPORT_FIELDS[table].map((column) => sql.identifier(column)),
              sql`, `,
            )} from ${sql.identifier(table)} where user_id=${owner} order by ${sql.join(
              keys.map((key) => sql.identifier(key)),
              sql`, `,
            )} limit 50 offset ${offset}`,
          );
          bytes += Buffer.byteLength(JSON.stringify(page.rows));
          if (bytes > 16 * 1024 * 1024 || rows.length + page.rows.length > 10_000)
            throw new DomainError(
              "EXPORT_TOO_LARGE",
              413,
              "Архив слишком велик для одного запроса. Нужен экспорт частями; неполный файл не создан.",
            );
          rows.push(...page.rows);
          if (page.rows.length < 50) break;
        }
        data[table] = rows;
      }
      const chat: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += 50) {
        const page = await tx.execute<
          Record<string, unknown>
        >(sql`select operation_id,companion,created_at,finished_at,
        case when user_deleted_at is null then text else null end as user_text,
        case when assistant_deleted_at is null then result else null end as assistant_reply,
        usage,status,error_code
        from assistant_turns where user_id=${owner} and (user_deleted_at is null or assistant_deleted_at is null)
        order by created_at,operation_id limit 50 offset ${offset}`);
        bytes += Buffer.byteLength(JSON.stringify(page.rows));
        if (bytes > 16 * 1024 * 1024 || chat.length + page.rows.length > 10_000)
          throw new DomainError(
            "EXPORT_TOO_LARGE",
            413,
            "Архив переписки слишком велик для одного запроса. Неполный файл не создан.",
          );
        chat.push(...page.rows);
        if (page.rows.length < 50) break;
      }
      const providers = await tx.execute<{ provider_id: string; account_id: string }>(
        sql`select provider_id,account_id from auth_accounts where user_id=${owner} order by provider_id,account_id`,
      );
      return {
        version: "miron-account-v1",
        scope:
          "Saved account content, visible chat, usage and operation metadata. Authentication secrets, abuse controls and internal replay payloads are excluded; deleted content is not reconstructed from ledgers.",
        exportedAt: new Date().toISOString(),
        account: principal.rows[0],
        providers: providers.rows,
        data,
        chat,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
