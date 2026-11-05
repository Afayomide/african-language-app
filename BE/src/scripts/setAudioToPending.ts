import "dotenv/config";
import { and, gte, lt, ne } from "drizzle-orm";
import { db, pool } from "../infrastructure/db/drizzle/client.js";
import { voiceAudioSubmissions } from "../infrastructure/db/drizzle/schema.js";

const CONFIRM_VALUE = "set-audio-to-pending";

function getLocalDayWindow() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end };
}

async function main() {
  const execute = process.argv.includes("--execute");
  if (execute && process.env.SET_AUDIO_PENDING_CONFIRM !== CONFIRM_VALUE) {
    throw new Error(
      `Refusing to execute. Set SET_AUDIO_PENDING_CONFIRM=${CONFIRM_VALUE} and pass --execute.`
    );
  }

  const { start, end } = getLocalDayWindow();
  const dateFilter = and(
    gte(voiceAudioSubmissions.createdAt, start),
    lt(voiceAudioSubmissions.createdAt, end)
  );
  const rows = await db
    .select({
      id: voiceAudioSubmissions.id,
      status: voiceAudioSubmissions.status
    })
    .from(voiceAudioSubmissions)
    .where(dateFilter);

  console.log("[SET_AUDIO_TO_PENDING] target", {
    date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`,
    start: start.toISOString(),
    end: end.toISOString(),
    dryRun: !execute,
    totalToday: rows.length,
    statuses: rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.status] = (counts[row.status] || 0) + 1;
      return counts;
    }, {})
  });

  if (!execute) {
    console.log(
      `[SET_AUDIO_TO_PENDING] dry run only. To execute: SET_AUDIO_PENDING_CONFIRM=${CONFIRM_VALUE} ` +
        "node --enable-source-maps --import tsx src/scripts/setAudioToPending.ts --execute"
    );
    return;
  }

  const updated = await db
    .update(voiceAudioSubmissions)
    .set({
      status: "pending",
      rejectionReason: "",
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: new Date()
    })
    .where(and(dateFilter, ne(voiceAudioSubmissions.status, "pending")))
    .returning({ id: voiceAudioSubmissions.id });

  console.log("[SET_AUDIO_TO_PENDING] updated", { count: updated.length });
}

main()
  .catch((error) => {
    console.error("[SET_AUDIO_TO_PENDING] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
