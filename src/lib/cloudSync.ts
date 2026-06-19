import type { User } from "@supabase/supabase-js";
import type { DeletedRunTombstone, Run, RunStats, Session, SessionReview, TrackerData } from "@/lib/basketball";
import { EMPTY_REVIEW, EMPTY_STATS } from "@/lib/basketball";
import { supabase } from "@/lib/supabase";

type SessionRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  review: Partial<SessionReview> | null;
  updated_at: string;
  deleted_at: string | null;
};

type RunRow = {
  id: string;
  session_id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  stats: Partial<RunStats> | null;
  updated_at: string;
  deleted_at: string | null;
};

export type SyncResult = {
  data: TrackerData;
  syncedAt: string;
  pushedSessions: number;
  pushedRuns: number;
  pushedDeletedRuns: number;
};

function isNewer(left: string | null | undefined, right: string | null | undefined) {
  return new Date(left ?? 0).getTime() > new Date(right ?? 0).getTime();
}

function normalizeReview(review: Partial<SessionReview> | null | undefined): SessionReview {
  return {
    ...EMPTY_REVIEW,
    ...(review ?? {})
  };
}

function normalizeStats(stats: Partial<RunStats> | null | undefined): RunStats {
  return {
    ...EMPTY_STATS,
    ...(stats ?? {})
  };
}

export function normalizeTrackerData(data: TrackerData): TrackerData {
  const now = new Date().toISOString();

  return {
    ...data,
    deletedRuns: data.deletedRuns ?? [],
    lastSyncedAt: data.lastSyncedAt ?? null,
    sessions: data.sessions.map((session) => ({
      ...session,
      updatedAt: session.updatedAt ?? now,
      review: normalizeReview(session.review),
      runs: (session.runs ?? []).map((run) => ({
        ...run,
        updatedAt: run.updatedAt ?? session.updatedAt ?? now,
        stats: normalizeStats(run.stats)
      }))
    }))
  };
}

function sessionFromRow(row: SessionRow, runs: Run[]): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    review: normalizeReview(row.review),
    runs,
    updatedAt: row.updated_at
  };
}

function runFromRow(row: RunRow): Run {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    stats: normalizeStats(row.stats),
    updatedAt: row.updated_at
  };
}

function sessionToRow(session: Session, user: User): SessionRow {
  return {
    id: session.id,
    user_id: user.id,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    review: session.review,
    updated_at: session.updatedAt,
    deleted_at: null
  };
}

function runToRow(run: Run, sessionId: string, user: User, deletedAt: string | null = null): RunRow {
  return {
    id: run.id,
    session_id: sessionId,
    user_id: user.id,
    started_at: run.startedAt,
    ended_at: run.endedAt,
    duration_seconds: run.durationSeconds,
    stats: run.stats,
    updated_at: deletedAt ?? run.updatedAt,
    deleted_at: deletedAt
  };
}

function applyRemoteSessionRows(localData: TrackerData, sessionRows: SessionRow[], runRows: RunRow[]) {
  const sessionMap = new Map(localData.sessions.map((session) => [session.id, session]));
  const runRowsBySession = new Map<string, RunRow[]>();
  const deletedRunRows = runRows.filter((row) => row.deleted_at);

  for (const row of runRows.filter((candidate) => !candidate.deleted_at)) {
    const existingRows = runRowsBySession.get(row.session_id) ?? [];
    existingRows.push(row);
    runRowsBySession.set(row.session_id, existingRows);
  }

  for (const row of sessionRows.filter((candidate) => !candidate.deleted_at)) {
    const remoteRuns = (runRowsBySession.get(row.id) ?? []).map(runFromRow);
    const localSession = sessionMap.get(row.id);

    if (!localSession) {
      sessionMap.set(row.id, sessionFromRow(row, remoteRuns));
      continue;
    }

    const runMap = new Map(localSession.runs.map((run) => [run.id, run]));
    for (const remoteRun of remoteRuns) {
      const localRun = runMap.get(remoteRun.id);
      if (!localRun || isNewer(remoteRun.updatedAt, localRun.updatedAt)) {
        runMap.set(remoteRun.id, remoteRun);
      }
    }

    const mergedSession = isNewer(row.updated_at, localSession.updatedAt)
      ? sessionFromRow(row, Array.from(runMap.values()))
      : {
          ...localSession,
          runs: Array.from(runMap.values())
        };

    sessionMap.set(row.id, mergedSession);
  }

  for (const deletedRun of deletedRunRows) {
    const session = sessionMap.get(deletedRun.session_id);
    if (!session) {
      continue;
    }

    const localRun = session.runs.find((run) => run.id === deletedRun.id);
    if (localRun && !isNewer(deletedRun.updated_at, localRun.updatedAt)) {
      continue;
    }

    sessionMap.set(deletedRun.session_id, {
      ...session,
      runs: session.runs.filter((run) => run.id !== deletedRun.id)
    });
  }

  return Array.from(sessionMap.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

export async function syncTrackerData(data: TrackerData, user: User): Promise<SyncResult> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const localData = normalizeTrackerData(data);
  const [{ data: sessionRows, error: sessionsError }, { data: runRows, error: runsError }] = await Promise.all([
    supabase.from("sessions").select("*").eq("user_id", user.id),
    supabase.from("runs").select("*").eq("user_id", user.id)
  ]);

  if (sessionsError) {
    throw sessionsError;
  }

  if (runsError) {
    throw runsError;
  }

  const mergedSessions = applyRemoteSessionRows(
    localData,
    (sessionRows ?? []) as SessionRow[],
    (runRows ?? []) as RunRow[]
  );
  const mergedData: TrackerData = {
    ...localData,
    sessions: mergedSessions
  };

  const sessionPayload = mergedData.sessions.map((session) => sessionToRow(session, user));
  const runPayload = mergedData.sessions.flatMap((session) =>
    session.runs.map((run) => runToRow(run, session.id, user))
  );
  const deletedRunPayload = mergedData.deletedRuns.map((run) => runToRow(run, run.sessionId, user, run.deletedAt));

  if (sessionPayload.length > 0) {
    const { error } = await supabase.from("sessions").upsert(sessionPayload, { onConflict: "id" });
    if (error) {
      throw error;
    }
  }

  if (runPayload.length > 0) {
    const { error } = await supabase.from("runs").upsert(runPayload, { onConflict: "id" });
    if (error) {
      throw error;
    }
  }

  if (deletedRunPayload.length > 0) {
    const { error } = await supabase.from("runs").upsert(deletedRunPayload, { onConflict: "id" });
    if (error) {
      throw error;
    }
  }

  const syncedAt = new Date().toISOString();

  return {
    data: {
      ...mergedData,
      deletedRuns: [],
      lastSyncedAt: syncedAt
    },
    syncedAt,
    pushedSessions: sessionPayload.length,
    pushedRuns: runPayload.length,
    pushedDeletedRuns: deletedRunPayload.length
  };
}

export function createDeletedRunTombstone(run: Run, sessionId: string): DeletedRunTombstone {
  const deletedAt = new Date().toISOString();

  return {
    ...run,
    sessionId,
    updatedAt: deletedAt,
    deletedAt
  };
}
