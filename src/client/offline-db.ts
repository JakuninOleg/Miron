import Dexie, { type EntityTable } from "dexie";
import type { AccountState, ChatMessage, CommandEnvelope, Workout } from "@/shared/contracts";
export interface CachedState extends AccountState {
  key: string;
  workout: Workout | null;
  messages: ChatMessage[];
  offlineReady: boolean;
}
export interface PendingCommand {
  id: string;
  owner: string;
  workoutId: string;
  envelope: CommandEnvelope;
  createdAt: number;
}
const database = new Dexie("miron-offline-v1") as Dexie & {
  states: EntityTable<CachedState, "key">;
  pending: EntityTable<PendingCommand, "id">;
};
database.version(1).stores({ states: "key", pending: "id,owner" });
database
  .version(2)
  .stores({ states: "key", pending: "id,owner,[owner+createdAt]" })
  .upgrade(async (tx) => {
    await tx
      .table<PendingCommand>("pending")
      .toCollection()
      .modify((item) => {
        item.createdAt ??= item.envelope.expectedRevision;
      });
  });
database
  .version(3)
  .stores({ states: "key", pending: "id,owner,[owner+createdAt]" })
  .upgrade(async (tx) => {
    await tx
      .table<CachedState>("states")
      .toCollection()
      .modify((state) => {
        state.offlineReady ??= false;
      });
  });
export const offlineDb = database;
export function queueOwnerMatches(ownerKey: string, principalId: string | null | undefined) {
  return Boolean(principalId && ownerKey === `user:${principalId}`);
}
export async function ownerCommands(owner: string) {
  const items = await database.pending.where("owner").equals(owner).toArray();
  return items.sort(
    (a, b) =>
      (a.workoutId === b.workoutId
        ? a.envelope.expectedRevision - b.envelope.expectedRevision
        : 0) ||
      a.createdAt - b.createdAt ||
      a.id.localeCompare(b.id),
  );
}
export async function journalCommand(next: CachedState, command: PendingCommand) {
  if (next.key !== command.owner || next.workout?.id !== command.workoutId)
    throw new Error("Аккаунт очереди не совпадает с тренировкой.");
  await database.transaction("rw", database.states, database.pending, async () => {
    const current = await database.states.get(command.owner);
    if (
      current?.workout?.id !== command.workoutId ||
      current.workout.revision !== command.envelope.expectedRevision
    )
      throw new Error("Тренировка изменилась в другом окне. Перезагрузи экран.");
    await database.pending.add(command);
    await database.states.put(next);
  });
}
export async function acknowledgeCommand(
  owner: string,
  id: string,
  workout: Workout,
  progress: AccountState["progress"],
): Promise<{ state: CachedState; pending: number }> {
  return database.transaction("rw", database.states, database.pending, async () => {
    const item = await database.pending.get(id);
    if (item && (item.owner !== owner || item.workoutId !== workout.id))
      throw new Error("Ответ не относится к очереди аккаунта.");
    const current = await database.states.get(owner);
    if (!current) throw new Error("Локальные данные аккаунта отсутствуют.");
    // Another tab can acknowledge the same operation while this request is in flight.
    if (!item)
      return {
        state: current,
        pending: await database.pending.where("owner").equals(owner).count(),
      };
    await database.pending.delete(id);
    const remaining = await database.pending.where("owner").equals(owner).count();
    // A partial ACK cannot rewind later optimistic steps still in the journal.
    const state = remaining === 0 ? { ...current, workout, progress } : current;
    await database.states.put(state);
    return { state, pending: remaining };
  });
}
export async function persistState(next: CachedState): Promise<CachedState> {
  return database.transaction("rw", database.states, database.pending, async () => {
    const current = await database.states.get(next.key);
    const pending = await database.pending.where("owner").equals(next.key).count();
    const saved =
      current && pending ? { ...next, workout: current.workout, progress: current.progress } : next;
    await database.states.put(saved);
    return saved;
  });
}
export async function clearOfflineData() {
  await database.transaction("rw", database.states, database.pending, async () => {
    await database.states.clear();
    await database.pending.clear();
  });
  localStorage.removeItem("miron:account");
  sessionStorage.removeItem("miron:demo");
}

// Session expiry/logout detaches access; unconfirmed work is retained for its owner.
// The authenticated principal must match before that owner's journal can be resumed.
export async function endOfflineSession(ownerKey: string | null) {
  if (ownerKey) {
    await database.transaction("rw", database.states, database.pending, async () => {
      const pending = await database.pending.where("owner").equals(ownerKey).count();
      if (!pending) await database.states.delete(ownerKey);
      else await database.states.update(ownerKey, { messages: [] });
    });
  }
  const active = localStorage.getItem("miron:account");
  if (ownerKey === `user:${active}`) localStorage.removeItem("miron:account");
  sessionStorage.removeItem("miron:demo");
}
