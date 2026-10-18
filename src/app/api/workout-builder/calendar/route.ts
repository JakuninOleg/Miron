import { privateJson, readJson } from "@/server/domain/http";
import { applyCalendarCommand, listCalendar } from "@/server/domain/calendar";
import { builderErrorResponse, requireBuilderOwner } from "../_response";
export async function GET(request: Request) {
  try {
    const owner = await requireBuilderOwner(request);
    const query = new URL(request.url).searchParams;
    return privateJson({
      entries: await listCalendar(owner.id, query.get("from") ?? "", query.get("to") ?? ""),
    });
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
export async function POST(request: Request) {
  try {
    const owner = await requireBuilderOwner(request);
    return privateJson(await applyCalendarCommand(owner.id, await readJson(request)));
  } catch (cause) {
    return builderErrorResponse(cause);
  }
}
