export type StatKey =
  | "twoMade"
  | "twoAttempt"
  | "threeMade"
  | "threeAttempt"
  | "rebounds"
  | "assists"
  | "steals"
  | "blocks"
  | "turnovers"
  | "fouls";

export type RatingKey =
  | "offense"
  | "defense"
  | "energy"
  | "physicality"
  | "shotConfidence";

export type RunStats = Record<StatKey, number>;

export type SessionReview = Record<RatingKey, number> & {
  didWell: string;
  improve: string;
  notes: string;
};

export type Run = {
  id: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  stats: RunStats;
  updatedAt: string;
};

export type DeletedRunTombstone = Run & {
  sessionId: string;
  deletedAt: string;
};

export type DraftRun = {
  id: string;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
};

export type ActiveRun = {
  id: string;
  sessionId: string;
  startedAt: string;
};

export type Session = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  runs: Run[];
  review: SessionReview;
  updatedAt: string;
};

export type TrackerData = {
  version: 1;
  sessions: Session[];
  activeSessionId: string | null;
  activeRun: ActiveRun | null;
  draftRun: DraftRun | null;
  deletedRuns: DeletedRunTombstone[];
  lastSyncedAt: string | null;
};

export type SessionTotals = RunStats & {
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  seconds: number;
  stocks: number;
};

export const STORAGE_KEY = "pickup-tracker:v1";

export const EMPTY_STATS: RunStats = {
  twoMade: 0,
  twoAttempt: 0,
  threeMade: 0,
  threeAttempt: 0,
  rebounds: 0,
  assists: 0,
  steals: 0,
  blocks: 0,
  turnovers: 0,
  fouls: 0
};

export const EMPTY_REVIEW: SessionReview = {
  offense: 3,
  defense: 3,
  energy: 3,
  physicality: 3,
  shotConfidence: 3,
  didWell: "",
  improve: "",
  notes: ""
};

export const EMPTY_DATA: TrackerData = {
  version: 1,
  sessions: [],
  activeSessionId: null,
  activeRun: null,
  draftRun: null,
  deletedRuns: [],
  lastSyncedAt: null
};

export const statLabels: Record<StatKey, string> = {
  twoMade: "2PM",
  twoAttempt: "2PA",
  threeMade: "3PM",
  threeAttempt: "3PA",
  rebounds: "REB",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  turnovers: "TOV",
  fouls: "FOUL"
};

export const ratingLabels: Record<RatingKey, string> = {
  offense: "Offense",
  defense: "Defense",
  energy: "Energy",
  physicality: "Physicality",
  shotConfidence: "Shot confidence"
};

export const per36Keys = [
  "points",
  "rebounds",
  "assists",
  "steals",
  "blocks",
  "turnovers",
  "fouls"
] as const;

export type Per36Key = (typeof per36Keys)[number];

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createSession(): Session {
  const now = new Date().toISOString();

  return {
    id: createId("session"),
    startedAt: now,
    endedAt: null,
    runs: [],
    review: { ...EMPTY_REVIEW },
    updatedAt: now
  };
}

export function touchSession(session: Session, updatedAt = new Date().toISOString()): Session {
  return {
    ...session,
    updatedAt
  };
}

export function touchRun(run: Run, updatedAt = new Date().toISOString()): Run {
  return {
    ...run,
    updatedAt
  };
}

export function createEmptyTotals(): SessionTotals {
  return {
    ...EMPTY_STATS,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    seconds: 0,
    stocks: 0
  };
}

export function getSessionTotals(session: Session): SessionTotals {
  const totals = createEmptyTotals();

  for (const run of session.runs) {
    totals.seconds += run.durationSeconds;
    totals.twoMade += run.stats.twoMade;
    totals.twoAttempt += run.stats.twoAttempt;
    totals.threeMade += run.stats.threeMade;
    totals.threeAttempt += run.stats.threeAttempt;
    totals.rebounds += run.stats.rebounds;
    totals.assists += run.stats.assists;
    totals.steals += run.stats.steals;
    totals.blocks += run.stats.blocks;
    totals.turnovers += run.stats.turnovers;
    totals.fouls += run.stats.fouls;
  }

  totals.points = totals.twoMade * 2 + totals.threeMade * 3;
  totals.fieldGoalsMade = totals.twoMade + totals.threeMade;
  totals.fieldGoalsAttempted = totals.twoAttempt + totals.threeAttempt;
  totals.stocks = totals.steals + totals.blocks;

  return totals;
}

export function statValidation(stats: RunStats) {
  const errors: string[] = [];

  if (stats.twoMade > stats.twoAttempt) {
    errors.push("2PM cannot be greater than 2PA.");
  }

  if (stats.threeMade > stats.threeAttempt) {
    errors.push("3PM cannot be greater than 3PA.");
  }

  return errors;
}

export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

export function formatExportDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function formatPercent(made: number, attempted: number) {
  if (attempted === 0) {
    return "-";
  }

  return `${((made / attempted) * 100).toFixed(1)}%`;
}

export function formatRatio(numerator: number, denominator: number) {
  if (denominator === 0) {
    return "-";
  }

  return (numerator / denominator).toFixed(2);
}

export function formatPer36(value: number, seconds: number) {
  if (seconds === 0) {
    return "-";
  }

  return ((value / (seconds / 60)) * 36).toFixed(1);
}

export function getAdvancedStats(totals: SessionTotals) {
  const efg =
    totals.fieldGoalsAttempted === 0
      ? "-"
      : `${(((totals.fieldGoalsMade + 0.5 * totals.threeMade) / totals.fieldGoalsAttempted) * 100).toFixed(1)}%`;

  return {
    fg: formatPercent(totals.fieldGoalsMade, totals.fieldGoalsAttempted),
    twoP: formatPercent(totals.twoMade, totals.twoAttempt),
    threeP: formatPercent(totals.threeMade, totals.threeAttempt),
    efg,
    astTov: formatRatio(totals.assists, totals.turnovers),
    stocks: totals.stocks.toString()
  };
}

export function getPer36Stats(totals: SessionTotals): Record<Per36Key, string> {
  return {
    points: formatPer36(totals.points, totals.seconds),
    rebounds: formatPer36(totals.rebounds, totals.seconds),
    assists: formatPer36(totals.assists, totals.seconds),
    steals: formatPer36(totals.steals, totals.seconds),
    blocks: formatPer36(totals.blocks, totals.seconds),
    turnovers: formatPer36(totals.turnovers, totals.seconds),
    fouls: formatPer36(totals.fouls, totals.seconds)
  };
}

export function buildSessionSummary(session: Session) {
  const totals = getSessionTotals(session);
  const advanced = getAdvancedStats(totals);
  const per36 = getPer36Stats(totals);

  const runLines = session.runs.map((run, index) => {
    const points = run.stats.twoMade * 2 + run.stats.threeMade * 3;
    return `Run ${index + 1}: ${formatDuration(run.durationSeconds)}, ${points} PTS, ${run.stats.rebounds} REB, ${run.stats.assists} AST, ${run.stats.steals} STL, ${run.stats.blocks} BLK, ${run.stats.turnovers} TOV, ${run.stats.fouls} FOUL`;
  });

  return [
    `Pickup basketball session - ${formatDate(session.startedAt)}`,
    `Playing time: ${formatDuration(totals.seconds)} across ${session.runs.length} run${session.runs.length === 1 ? "" : "s"}`,
    `Box score: ${totals.points} PTS, ${totals.fieldGoalsMade}/${totals.fieldGoalsAttempted} FG, ${totals.twoMade}/${totals.twoAttempt} 2P, ${totals.threeMade}/${totals.threeAttempt} 3P, ${totals.rebounds} REB, ${totals.assists} AST, ${totals.steals} STL, ${totals.blocks} BLK, ${totals.turnovers} TOV, ${totals.fouls} FOUL`,
    `Advanced: FG% ${advanced.fg}, 2P% ${advanced.twoP}, 3P% ${advanced.threeP}, eFG% ${advanced.efg}, AST/TOV ${advanced.astTov}, Stocks ${advanced.stocks}`,
    `Per 36: ${per36.points} PTS, ${per36.rebounds} REB, ${per36.assists} AST, ${per36.steals} STL, ${per36.blocks} BLK, ${per36.turnovers} TOV, ${per36.fouls} FOUL`,
    `Self-review: offense ${session.review.offense}/5, defense ${session.review.defense}/5, energy ${session.review.energy}/5, physicality ${session.review.physicality}/5, shot confidence ${session.review.shotConfidence}/5`,
    session.review.didWell ? `Did well: ${session.review.didWell}` : "Did well: -",
    session.review.improve ? `Improve: ${session.review.improve}` : "Improve: -",
    session.review.notes ? `Notes: ${session.review.notes}` : "Notes: -",
    runLines.length > 0 ? `Runs:\n${runLines.join("\n")}` : "Runs: none yet"
  ].join("\n");
}

export function getSessionsInDateRange(sessions: Session[], startDate: string, endDate: string) {
  return sessions.filter((session) => {
    const day = formatExportDate(session.startedAt);
    const isAfterStart = !startDate || day >= startDate;
    const isBeforeEnd = !endDate || day <= endDate;
    return isAfterStart && isBeforeEnd;
  });
}
