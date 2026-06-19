"use client";

import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  Cloud,
  Copy,
  Download,
  History,
  Home,
  ListChecks,
  LogIn,
  LogOut,
  Minus,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  TimerReset,
  Trash2,
  X
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActiveRun,
  DeletedRunTombstone,
  DraftRun,
  EMPTY_DATA,
  EMPTY_STATS,
  Per36Key,
  RatingKey,
  Run,
  RunStats,
  Session,
  StatKey,
  STORAGE_KEY,
  TrackerData,
  buildSessionSummary,
  createId,
  createSession,
  formatClock,
  formatDate,
  formatDateTime,
  formatDuration,
  formatExportDate,
  getAdvancedStats,
  getPer36Stats,
  getSessionTotals,
  getSessionsInDateRange,
  ratingLabels,
  statLabels,
  statValidation,
  touchRun,
  touchSession
} from "@/lib/basketball";
import { createDeletedRunTombstone, normalizeTrackerData, syncTrackerData } from "@/lib/cloudSync";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type View = "home" | "session" | "timer" | "entry" | "history" | "export";

const statOrder: StatKey[] = [
  "twoMade",
  "twoAttempt",
  "threeMade",
  "threeAttempt",
  "rebounds",
  "assists",
  "steals",
  "blocks",
  "turnovers",
  "fouls"
];

const ratingOrder: RatingKey[] = ["offense", "defense", "energy", "physicality", "shotConfidence"];

const per36Labels: Record<Per36Key, string> = {
  points: "PTS",
  rebounds: "REB",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  turnovers: "TOV",
  fouls: "FOUL"
};

function readStoredData(): TrackerData {
  if (typeof window === "undefined") {
    return EMPTY_DATA;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_DATA;
    }

    const parsed = JSON.parse(raw) as TrackerData;
    if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
      return EMPTY_DATA;
    }

    return normalizeTrackerData({
      ...EMPTY_DATA,
      ...parsed,
      sessions: parsed.sessions.map((session) => ({
        ...session,
        review: {
          offense: session.review?.offense ?? 3,
          defense: session.review?.defense ?? 3,
          energy: session.review?.energy ?? 3,
          physicality: session.review?.physicality ?? 3,
          shotConfidence: session.review?.shotConfidence ?? 3,
          didWell: session.review?.didWell ?? "",
          improve: session.review?.improve ?? "",
          notes: session.review?.notes ?? ""
        },
        runs: Array.isArray(session.runs) ? session.runs : []
      })),
      activeRun: parsed.activeRun ?? null,
      draftRun: parsed.draftRun ?? null,
      activeSessionId: parsed.activeSessionId ?? null,
      deletedRuns: parsed.deletedRuns ?? [],
      lastSyncedAt: parsed.lastSyncedAt ?? null
    });
  } catch {
    return EMPTY_DATA;
  }
}

function writeStoredData(data: TrackerData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the selection-based copy path when browser permission is denied.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function secondsSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
}

function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
}) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

function IconButton({
  label,
  children,
  variant = "ghost",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button aria-label={label} title={label} className={`icon-button icon-button-${variant}`} {...props}>
      {children}
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <Sparkles size={22} aria-hidden="true" />
      <div>
        <p>{title}</p>
        <span>{body}</span>
      </div>
    </div>
  );
}

function formatSyncTime(value: string | null) {
  if (!value) {
    return "Never synced";
  }

  return `Last sync ${formatDateTime(value)}`;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionCard({
  title,
  action,
  children
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="section-card">
      <div className="section-title">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stepper({
  label,
  value,
  onChange,
  min = 0
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return (
    <label className="stepper">
      <span>{label}</span>
      <div>
        <IconButton label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, safeValue - 1))}>
          <Minus size={17} aria-hidden="true" />
        </IconButton>
        <input
          inputMode="numeric"
          min={min}
          type="number"
          value={safeValue}
          onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))}
        />
        <IconButton label={`Increase ${label}`} onClick={() => onChange(safeValue + 1)}>
          <Plus size={17} aria-hidden="true" />
        </IconButton>
      </div>
    </label>
  );
}

function RatingField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rating-field">
      <span>{label}</span>
      <div role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            className={rating === value ? "selected" : ""}
            aria-pressed={rating === value}
            onClick={() => onChange(rating)}
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );
}

function AppHeader({
  title,
  subtitle,
  onBack
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
}) {
  return (
    <header className="app-header">
      <div>
        {onBack ? (
          <IconButton label="Back" onClick={onBack}>
            <ChevronLeft size={20} aria-hidden="true" />
          </IconButton>
        ) : (
          <div className="brand-mark" aria-hidden="true">
            <Activity size={19} />
          </div>
        )}
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ view, setView }: { view: View; setView: (view: View) => void }) {
  const items: Array<{ view: View; label: string; icon: React.ReactNode }> = [
    { view: "home", label: "Home", icon: <Home size={19} aria-hidden="true" /> },
    { view: "history", label: "History", icon: <History size={19} aria-hidden="true" /> },
    { view: "export", label: "Export", icon: <Download size={19} aria-hidden="true" /> }
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => (
        <button
          key={item.view}
          type="button"
          aria-current={view === item.view ? "page" : undefined}
          onClick={() => setView(item.view)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function HomeScreen({
  data,
  activeSession,
  cloudUser,
  syncConfigured,
  syncStatus,
  syncMessage,
  syncEmail,
  onSyncEmailChange,
  onSendMagicLink,
  onSignOut,
  onManualSync,
  onCreateSession,
  onContinueSession,
  onResumeTimer,
  onResumeEntry,
  onOpenSession,
  setView
}: {
  data: TrackerData;
  activeSession: Session | undefined;
  cloudUser: User | null;
  syncConfigured: boolean;
  syncStatus: "idle" | "syncing" | "error" | "sent";
  syncMessage: string;
  syncEmail: string;
  onSyncEmailChange: (email: string) => void;
  onSendMagicLink: () => void;
  onSignOut: () => void;
  onManualSync: () => void;
  onCreateSession: () => void;
  onContinueSession: () => void;
  onResumeTimer: () => void;
  onResumeEntry: () => void;
  onOpenSession: (sessionId: string) => void;
  setView: (view: View) => void;
}) {
  const sessions = [...data.sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  const latest = sessions.slice(0, 3);
  const allTotals = data.sessions.reduce(
    (acc, session) => {
      const totals = getSessionTotals(session);
      acc.seconds += totals.seconds;
      acc.points += totals.points;
      acc.runs += session.runs.length;
      return acc;
    },
    { seconds: 0, points: 0, runs: 0 }
  );

  return (
    <>
      <AppHeader title="Pickup Tracker" subtitle="Local stats for every run" />
      <main className="screen home-screen">
        <section className="hero-card">
          <div>
            <p>Today</p>
            <h2>{activeSession ? "Session in progress" : "Ready for next run"}</h2>
            <span>
              {activeSession
                ? `${activeSession.runs.length} saved run${activeSession.runs.length === 1 ? "" : "s"}`
                : "Start a session, time your run, then enter the box score."}
            </span>
          </div>
          {data.activeRun ? (
            <Button onClick={onResumeTimer}>
              <Clock3 size={18} aria-hidden="true" />
              Active timer
            </Button>
          ) : data.draftRun ? (
            <Button onClick={onResumeEntry}>
              <Pencil size={18} aria-hidden="true" />
              Finish entry
            </Button>
          ) : activeSession ? (
            <Button onClick={onContinueSession}>
              <Play size={18} aria-hidden="true" />
              Continue
            </Button>
          ) : (
            <Button onClick={onCreateSession}>
              <Plus size={18} aria-hidden="true" />
              New session
            </Button>
          )}
        </section>

        <CloudSyncCard
          user={cloudUser}
          configured={syncConfigured}
          status={syncStatus}
          message={syncMessage}
          email={syncEmail}
          lastSyncedAt={data.lastSyncedAt}
          onEmailChange={onSyncEmailChange}
          onSendMagicLink={onSendMagicLink}
          onSignOut={onSignOut}
          onManualSync={onManualSync}
        />

        <section className="quick-grid">
          <StatTile label="Sessions" value={data.sessions.length} />
          <StatTile label="Runs" value={allTotals.runs} />
          <StatTile label="Minutes" value={Math.round(allTotals.seconds / 60)} />
          <StatTile label="Points" value={allTotals.points} />
        </section>

        <SectionCard
          title="Recent sessions"
          action={
            <Button variant="ghost" onClick={() => setView("history")}>
              View all
            </Button>
          }
        >
          {latest.length === 0 ? (
            <EmptyState title="No sessions yet" body="Your first pickup day will appear here." />
          ) : (
            <div className="session-list">
              {latest.map((session) => (
                <SessionRow key={session.id} session={session} onOpen={() => onOpenSession(session.id)} />
              ))}
            </div>
          )}
        </SectionCard>
      </main>
    </>
  );
}

function CloudSyncCard({
  user,
  configured,
  status,
  message,
  email,
  lastSyncedAt,
  onEmailChange,
  onSendMagicLink,
  onSignOut,
  onManualSync
}: {
  user: User | null;
  configured: boolean;
  status: "idle" | "syncing" | "error" | "sent";
  message: string;
  email: string;
  lastSyncedAt: string | null;
  onEmailChange: (email: string) => void;
  onSendMagicLink: () => void;
  onSignOut: () => void;
  onManualSync: () => void;
}) {
  if (!configured) {
    return (
      <section className="sync-card">
        <div className="sync-heading">
          <Cloud size={20} aria-hidden="true" />
          <div>
            <strong>Cloud sync not configured</strong>
            <span>Add Supabase env vars to sync phone and desktop.</span>
          </div>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="sync-card">
        <div className="sync-heading">
          <Cloud size={20} aria-hidden="true" />
          <div>
            <strong>Sync across devices</strong>
            <span>Email magic link keeps phone and desktop together.</span>
          </div>
        </div>
        <div className="sync-login">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
          />
          <Button onClick={onSendMagicLink} disabled={!email || status === "syncing"}>
            <LogIn size={18} aria-hidden="true" />
            Send link
          </Button>
        </div>
        {message ? <p className={`sync-message ${status === "error" ? "sync-message-error" : ""}`}>{message}</p> : null}
      </section>
    );
  }

  return (
    <section className="sync-card">
      <div className="sync-heading">
        <Cloud size={20} aria-hidden="true" />
        <div>
          <strong>Cloud sync on</strong>
          <span>{user.email ?? "Signed in"} - {formatSyncTime(lastSyncedAt)}</span>
        </div>
      </div>
      <div className="sync-actions">
        <Button variant="secondary" onClick={onManualSync} disabled={status === "syncing"}>
          <RefreshCw size={18} aria-hidden="true" />
          {status === "syncing" ? "Syncing" : "Sync now"}
        </Button>
        <Button variant="ghost" onClick={onSignOut}>
          <LogOut size={18} aria-hidden="true" />
          Sign out
        </Button>
      </div>
      {message ? <p className={`sync-message ${status === "error" ? "sync-message-error" : ""}`}>{message}</p> : null}
    </section>
  );
}

function SessionRow({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const totals = getSessionTotals(session);

  return (
    <button type="button" className="session-row" onClick={onOpen}>
      <div>
        <strong>{formatDate(session.startedAt)}</strong>
        <span>
          {session.endedAt ? "Finished" : "Active"} - {session.runs.length} run
          {session.runs.length === 1 ? "" : "s"}
        </span>
      </div>
      <div>
        <strong>{totals.points}</strong>
        <span>{formatDuration(totals.seconds)}</span>
      </div>
    </button>
  );
}

function SessionScreen({
  session,
  isActive,
  hasBlockingRun,
  copied,
  onBack,
  onStartRun,
  onCopy,
  onFinishSession,
  onUpdateReview,
  onEditRun,
  onDeleteRun
}: {
  session: Session;
  isActive: boolean;
  hasBlockingRun: boolean;
  copied: boolean;
  onBack: () => void;
  onStartRun: () => void;
  onCopy: () => void;
  onFinishSession: () => void;
  onUpdateReview: (review: Session["review"]) => void;
  onEditRun: (run: Run) => void;
  onDeleteRun: (runId: string) => void;
}) {
  const totals = getSessionTotals(session);
  const advanced = getAdvancedStats(totals);
  const per36 = getPer36Stats(totals);

  return (
    <>
      <AppHeader title="Session" subtitle={formatDate(session.startedAt)} onBack={onBack} />
      <main className="screen session-screen">
        <section className="score-card">
          <div>
            <span>Total playing time</span>
            <strong>{formatClock(totals.seconds)}</strong>
          </div>
          <div className="score-card-actions">
            {isActive ? (
              <Button onClick={onStartRun} disabled={hasBlockingRun}>
                <Play size={18} aria-hidden="true" />
                Start run
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onCopy}>
              {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </section>

        <SectionCard title="Box score">
          <div className="box-grid">
            <StatTile label="PTS" value={totals.points} />
            <StatTile label="FGM" value={totals.fieldGoalsMade} />
            <StatTile label="FGA" value={totals.fieldGoalsAttempted} />
            <StatTile label="REB" value={totals.rebounds} />
            <StatTile label="AST" value={totals.assists} />
            <StatTile label="STL" value={totals.steals} />
            <StatTile label="BLK" value={totals.blocks} />
            <StatTile label="TOV" value={totals.turnovers} />
            <StatTile label="FOUL" value={totals.fouls} />
          </div>
        </SectionCard>

        <SectionCard title="Advanced stats">
          <div className="advanced-grid">
            <StatTile label="FG%" value={advanced.fg} />
            <StatTile label="2P%" value={advanced.twoP} />
            <StatTile label="3P%" value={advanced.threeP} />
            <StatTile label="eFG%" value={advanced.efg} />
            <StatTile label="AST/TOV" value={advanced.astTov} />
            <StatTile label="Stocks" value={advanced.stocks} />
          </div>
        </SectionCard>

        <SectionCard title="Per 36">
          <div className="per36-grid">
            {Object.entries(per36).map(([key, value]) => (
              <StatTile key={key} label={per36Labels[key as Per36Key]} value={value} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Runs">
          {session.runs.length === 0 ? (
            <EmptyState title="No saved runs" body="Start a run timer when you step onto the court." />
          ) : (
            <div className="run-list">
              {session.runs.map((run, index) => (
                <RunRow
                  key={run.id}
                  run={run}
                  index={index}
                  onEdit={() => onEditRun(run)}
                  onDelete={() => onDeleteRun(run.id)}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SelfReview review={session.review} onChange={onUpdateReview} />

        {isActive ? (
          <Button variant="secondary" className="wide-button" onClick={onFinishSession} disabled={hasBlockingRun}>
            <Shield size={18} aria-hidden="true" />
            Finish session
          </Button>
        ) : null}
      </main>
    </>
  );
}

function RunRow({
  run,
  index,
  onEdit,
  onDelete
}: {
  run: Run;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const points = run.stats.twoMade * 2 + run.stats.threeMade * 3;

  return (
    <div className="run-row">
      <div>
        <strong>Run {index + 1}</strong>
        <span>
          {formatDuration(run.durationSeconds)} - {formatDateTime(run.startedAt)}
        </span>
      </div>
      <div className="run-row-stats">
        <span>{points} PTS</span>
        <span>{run.stats.rebounds} REB</span>
        <span>{run.stats.assists} AST</span>
      </div>
      <div className="run-actions">
        <IconButton label="Edit run" onClick={onEdit}>
          <Pencil size={17} aria-hidden="true" />
        </IconButton>
        <IconButton label="Delete run" variant="danger" onClick={onDelete}>
          <Trash2 size={17} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}

function SelfReview({
  review,
  onChange
}: {
  review: Session["review"];
  onChange: (review: Session["review"]) => void;
}) {
  return (
    <SectionCard title="Self-review">
      <div className="review-grid">
        {ratingOrder.map((key) => (
          <RatingField
            key={key}
            label={ratingLabels[key]}
            value={review[key]}
            onChange={(value) => onChange({ ...review, [key]: value })}
          />
        ))}
      </div>
      <label className="text-field">
        <span>One thing I did well</span>
        <textarea
          value={review.didWell}
          rows={3}
          onChange={(event) => onChange({ ...review, didWell: event.target.value })}
        />
      </label>
      <label className="text-field">
        <span>One thing to improve</span>
        <textarea
          value={review.improve}
          rows={3}
          onChange={(event) => onChange({ ...review, improve: event.target.value })}
        />
      </label>
      <label className="text-field">
        <span>General notes</span>
        <textarea
          value={review.notes}
          rows={4}
          onChange={(event) => onChange({ ...review, notes: event.target.value })}
        />
      </label>
    </SectionCard>
  );
}

function TimerScreen({
  activeRun,
  onEnd,
  onCancel
}: {
  activeRun: ActiveRun;
  onEnd: () => void;
  onCancel: () => void;
}) {
  const [elapsed, setElapsed] = useState(() => secondsSince(activeRun.startedAt));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed(secondsSince(activeRun.startedAt));
    }, 500);

    return () => window.clearInterval(timer);
  }, [activeRun.startedAt]);

  return (
    <>
      <AppHeader title="Active run" subtitle="Timer is saved locally" />
      <main className="screen timer-screen">
        <section className="timer-card">
          <Clock3 size={30} aria-hidden="true" />
          <span>On court</span>
          <strong>{formatClock(elapsed)}</strong>
          <p>Started {formatDateTime(activeRun.startedAt)}</p>
        </section>
        <div className="timer-actions">
          <Button variant="success" onClick={onEnd}>
            <Check size={18} aria-hidden="true" />
            End run
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            <X size={18} aria-hidden="true" />
            Cancel
          </Button>
        </div>
      </main>
    </>
  );
}

function RunEntryScreen({
  draftRun,
  initialStats,
  editingRun,
  onSave,
  onCancel
}: {
  draftRun: DraftRun | null;
  initialStats: RunStats;
  editingRun: Run | null;
  onSave: (stats: RunStats) => void;
  onCancel: () => void;
}) {
  const [stats, setStats] = useState<RunStats>(initialStats);
  const errors = statValidation(stats);
  const duration = editingRun?.durationSeconds ?? draftRun?.durationSeconds ?? 0;

  useEffect(() => {
    setStats(initialStats);
  }, [initialStats]);

  function updateStat(key: StatKey, value: number) {
    setStats((current) => {
      const next = { ...current, [key]: Math.max(0, Math.floor(value)) };

      if (key === "twoMade" && next.twoMade > next.twoAttempt) {
        next.twoAttempt = next.twoMade;
      }

      if (key === "threeMade" && next.threeMade > next.threeAttempt) {
        next.threeAttempt = next.threeMade;
      }

      return next;
    });
  }

  return (
    <>
      <AppHeader
        title={editingRun ? "Edit run" : "Run entry"}
        subtitle={`${formatDuration(duration)} playing time`}
        onBack={onCancel}
      />
      <main className="screen entry-screen">
        <section className="entry-summary">
          <TimerReset size={22} aria-hidden="true" />
          <div>
            <span>{editingRun ? "Adjust the saved run" : "Timer stopped"}</span>
            <strong>{formatClock(duration)}</strong>
          </div>
        </section>

        <section className="stepper-grid">
          {statOrder.map((key) => (
            <Stepper key={key} label={statLabels[key]} value={stats[key]} onChange={(value) => updateStat(key, value)} />
          ))}
        </section>

        {errors.length > 0 ? (
          <div className="validation-panel" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}

        <div className="entry-actions">
          <Button onClick={() => onSave(stats)} disabled={errors.length > 0}>
            <Save size={18} aria-hidden="true" />
            Save run
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </main>
    </>
  );
}

function HistoryScreen({
  sessions,
  onOpenSession
}: {
  sessions: Session[];
  onOpenSession: (sessionId: string) => void;
}) {
  const ordered = [...sessions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  return (
    <>
      <AppHeader title="History" subtitle={`${ordered.length} saved session${ordered.length === 1 ? "" : "s"}`} />
      <main className="screen history-screen">
        {ordered.length === 0 ? (
          <EmptyState title="Nothing here yet" body="Finished and active sessions will show up here." />
        ) : (
          <div className="session-list">
            {ordered.map((session) => (
              <SessionRow key={session.id} session={session} onOpen={() => onOpenSession(session.id)} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function ExportScreen({ sessions }: { sessions: Session[] }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedSessions = useMemo(
    () => getSessionsInDateRange(sessions, startDate, endDate),
    [endDate, sessions, startDate]
  );
  const jsonPayload = useMemo(
    () =>
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          startDate: startDate || null,
          endDate: endDate || null,
          sessions: selectedSessions
        },
        null,
        2
      ),
    [endDate, selectedSessions, startDate]
  );

  function downloadJson() {
    const blob = new Blob([jsonPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pickup-sessions-${startDate || "all"}-${endDate || "all"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyJson() {
    await copyTextToClipboard(jsonPayload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <>
      <AppHeader title="Export" subtitle="JSON backup by date range" />
      <main className="screen export-screen">
        <SectionCard title="Date range">
          <div className="date-grid">
            <label className="text-input">
              <span>Start</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="text-input">
              <span>End</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <div className="export-summary">
            <ListChecks size={20} aria-hidden="true" />
            <span>
              {selectedSessions.length} session{selectedSessions.length === 1 ? "" : "s"} selected
            </span>
          </div>
          <div className="export-actions">
            <Button onClick={downloadJson}>
              <Download size={18} aria-hidden="true" />
              Download JSON
            </Button>
            <Button variant="secondary" onClick={copyJson} disabled={selectedSessions.length === 0}>
              {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
              {copied ? "Copied" : "Copy JSON"}
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Preview">
          <pre className="json-preview">{jsonPayload}</pre>
        </SectionCard>
      </main>
    </>
  );
}

export function BasketTrackerApp() {
  const [data, setData] = useState<TrackerData>(EMPTY_DATA);
  const [hydrated, setHydrated] = useState(false);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [syncEmail, setSyncEmail] = useState("");
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error" | "sent">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncDirty, setSyncDirty] = useState(false);
  const [view, setView] = useState<View>("home");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [editingRun, setEditingRun] = useState<Run | null>(null);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const syncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const stored = readStoredData();
    setData(stored);
    setHydrated(true);

    if (stored.activeRun) {
      setSelectedSessionId(stored.activeRun.sessionId);
      setView("timer");
    } else if (stored.draftRun) {
      setSelectedSessionId(stored.draftRun.sessionId);
      setView("entry");
    } else if (stored.activeSessionId) {
      setSelectedSessionId(stored.activeSessionId);
      setView("session");
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data: authData }) => {
      setCloudUser(authData.session?.user ?? null);
      setSyncDirty(Boolean(authData.session?.user));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCloudUser(session?.user ?? null);
      setSyncDirty(Boolean(session?.user));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    writeStoredData(data);
  }, [data, hydrated]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  const activeSession = data.sessions.find((session) => session.id === data.activeSessionId);
  const selectedSession =
    data.sessions.find((session) => session.id === selectedSessionId) ?? activeSession ?? data.sessions[0];

  const runSync = useCallback(
    async (nextData?: TrackerData) => {
      if (!cloudUser || !supabase) {
        return;
      }

      setSyncStatus("syncing");
      setSyncMessage("Syncing local and cloud data...");

      try {
        const result = await syncTrackerData(nextData ?? data, cloudUser);
        setData(result.data);
        setSyncDirty(false);
        setSyncStatus("idle");
        setSyncMessage(
          `Synced ${result.pushedSessions} sessions, ${result.pushedRuns} runs${result.pushedDeletedRuns ? `, ${result.pushedDeletedRuns} deletions` : ""}.`
        );
      } catch (error) {
        setSyncStatus("error");
        setSyncMessage(error instanceof Error ? error.message : "Sync failed. Your local data is still saved.");
      }
    },
    [cloudUser, data]
  );

  useEffect(() => {
    if (!hydrated || !cloudUser || !syncDirty) {
      return;
    }

    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      runSync();
    }, 1200);

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [cloudUser, hydrated, runSync, syncDirty]);

  function updateTracker(updater: (current: TrackerData) => TrackerData, shouldSync = true) {
    setData((current) => {
      const next = normalizeTrackerData(updater(current));
      return next;
    });

    if (shouldSync) {
      setSyncDirty(true);
    }
  }

  function replaceSession(sessionId: string, updater: (session: Session) => Session) {
    updateTracker((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.id === sessionId ? touchSession(updater(session)) : session
      )
    }));
  }

  function startSession() {
    const session = createSession();
    updateTracker((current) => ({
      ...current,
      sessions: [session, ...current.sessions],
      activeSessionId: session.id
    }));
    setSelectedSessionId(session.id);
    setView("session");
  }

  function openSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setEditingRun(null);
    setView("session");
  }

  function startRun() {
    const sessionId = selectedSession?.id ?? data.activeSessionId;
    if (!sessionId) {
      return;
    }

    const activeRun: ActiveRun = {
      id: createId("run"),
      sessionId,
      startedAt: new Date().toISOString()
    };

    updateTracker((current) => ({ ...current, activeRun, draftRun: null }), false);
    setSelectedSessionId(sessionId);
    setView("timer");
  }

  function endRun() {
    if (!data.activeRun) {
      return;
    }

    const endedAt = new Date().toISOString();
    const draftRun: DraftRun = {
      id: data.activeRun.id,
      sessionId: data.activeRun.sessionId,
      startedAt: data.activeRun.startedAt,
      endedAt,
      durationSeconds: secondsSince(data.activeRun.startedAt)
    };

    updateTracker((current) => ({ ...current, activeRun: null, draftRun }), false);
    setSelectedSessionId(draftRun.sessionId);
    setEditingRun(null);
    setView("entry");
  }

  function cancelActiveRun() {
    if (!window.confirm("Cancel this active run timer? The timer will be discarded.")) {
      return;
    }

    const sessionId = data.activeRun?.sessionId ?? selectedSessionId;
    updateTracker((current) => ({ ...current, activeRun: null }), false);
    setSelectedSessionId(sessionId);
    setView("session");
  }

  function saveRun(stats: RunStats) {
    if (editingRun && selectedSessionId) {
      replaceSession(selectedSessionId, (session) => ({
        ...session,
        runs: session.runs.map((run) => (run.id === editingRun.id ? touchRun({ ...run, stats }) : run))
      }));
      setEditingRun(null);
      setView("session");
      return;
    }

    if (!data.draftRun) {
      return;
    }

    const run: Run = {
      id: data.draftRun.id,
      startedAt: data.draftRun.startedAt,
      endedAt: data.draftRun.endedAt,
      durationSeconds: data.draftRun.durationSeconds,
      stats,
      updatedAt: new Date().toISOString()
    };

    updateTracker((current) => ({
      ...current,
      draftRun: null,
      sessions: current.sessions.map((session) =>
        session.id === data.draftRun?.sessionId ? touchSession({ ...session, runs: [...session.runs, run] }) : session
      )
    }));
    setSelectedSessionId(data.draftRun.sessionId);
    setView("session");
  }

  function cancelRunEntry() {
    if (editingRun) {
      setEditingRun(null);
      setView("session");
      return;
    }

    if (!window.confirm("Discard this run entry? The timed run will not be saved.")) {
      return;
    }

    const sessionId = data.draftRun?.sessionId ?? selectedSessionId;
    updateTracker((current) => ({ ...current, draftRun: null }), false);
    setSelectedSessionId(sessionId);
    setView("session");
  }

  function editRun(run: Run) {
    setEditingRun(run);
    setView("entry");
  }

  function deleteRun(runId: string) {
    if (!selectedSessionId || !window.confirm("Delete this run? This cannot be undone.")) {
      return;
    }

    updateTracker((current) => {
      let tombstone: DeletedRunTombstone | null = null;
      const sessions = current.sessions.map((session) => {
        if (session.id !== selectedSessionId) {
          return session;
        }

        const run = session.runs.find((candidate) => candidate.id === runId);
        if (run) {
          tombstone = createDeletedRunTombstone(run, session.id);
        }

        return touchSession({
          ...session,
          runs: session.runs.filter((candidate) => candidate.id !== runId)
        });
      });

      return {
        ...current,
        sessions,
        deletedRuns: tombstone ? [...(current.deletedRuns ?? []), tombstone] : current.deletedRuns
      };
    });
  }

  function finishSession() {
    if (!selectedSessionId || !window.confirm("Finish this session and move it to history?")) {
      return;
    }

    replaceSession(selectedSessionId, (session) => ({
      ...session,
      endedAt: new Date().toISOString()
    }));
    updateTracker((current) => ({
      ...current,
      activeSessionId: current.activeSessionId === selectedSessionId ? null : current.activeSessionId
    }), false);
  }

  function updateReview(sessionId: string, review: Session["review"]) {
    replaceSession(sessionId, (session) => ({ ...session, review }));
  }

  async function copySessionSummary(session: Session) {
    await copyTextToClipboard(buildSessionSummary(session));
    setCopiedSessionId(session.id);
    window.setTimeout(() => setCopiedSessionId(null), 1200);
  }

  async function sendMagicLink() {
    if (!supabase || !syncEmail) {
      return;
    }

    setSyncStatus("syncing");
    setSyncMessage("Sending magic link...");

    const { error } = await supabase.auth.signInWithOtp({
      email: syncEmail,
      options: {
        emailRedirectTo: window.location.origin
      }
    });

    if (error) {
      setSyncStatus("error");
      setSyncMessage(error.message);
      return;
    }

    setSyncStatus("sent");
    setSyncMessage("Magic link sent. Open it on this device to sign in.");
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setCloudUser(null);
    setSyncStatus("idle");
    setSyncMessage("Signed out. Local data stays on this device.");
  }

  if (!hydrated) {
    return (
      <div className="app-shell">
        <div className="loading-card">
          <Activity size={24} aria-hidden="true" />
          <span>Loading tracker</span>
        </div>
      </div>
    );
  }

  const showBottomNav = view === "home" || view === "history" || view === "export";

  return (
    <div className="app-shell">
      {view === "home" ? (
        <HomeScreen
          data={data}
          activeSession={activeSession}
          cloudUser={cloudUser}
          syncConfigured={isSupabaseConfigured}
          syncStatus={syncStatus}
          syncMessage={syncMessage}
          syncEmail={syncEmail}
          onSyncEmailChange={setSyncEmail}
          onSendMagicLink={sendMagicLink}
          onSignOut={signOut}
          onManualSync={() => runSync()}
          onCreateSession={startSession}
          onContinueSession={() => {
            if (activeSession) {
              openSession(activeSession.id);
            }
          }}
          onResumeTimer={() => setView("timer")}
          onResumeEntry={() => {
            setSelectedSessionId(data.draftRun?.sessionId ?? null);
            setEditingRun(null);
            setView("entry");
          }}
          onOpenSession={openSession}
          setView={setView}
        />
      ) : null}

      {view === "session" && selectedSession ? (
        <SessionScreen
          session={selectedSession}
          isActive={selectedSession.id === data.activeSessionId && !selectedSession.endedAt}
          hasBlockingRun={Boolean(data.activeRun || data.draftRun)}
          copied={copiedSessionId === selectedSession.id}
          onBack={() => setView("home")}
          onStartRun={startRun}
          onCopy={() => copySessionSummary(selectedSession)}
          onFinishSession={finishSession}
          onUpdateReview={(review) => updateReview(selectedSession.id, review)}
          onEditRun={editRun}
          onDeleteRun={deleteRun}
        />
      ) : null}

      {view === "timer" && data.activeRun ? (
        <TimerScreen activeRun={data.activeRun} onEnd={endRun} onCancel={cancelActiveRun} />
      ) : null}

      {view === "entry" ? (
        <RunEntryScreen
          draftRun={data.draftRun}
          editingRun={editingRun}
          initialStats={editingRun?.stats ?? EMPTY_STATS}
          onSave={saveRun}
          onCancel={cancelRunEntry}
        />
      ) : null}

      {view === "history" ? <HistoryScreen sessions={data.sessions} onOpenSession={openSession} /> : null}

      {view === "export" ? <ExportScreen sessions={data.sessions} /> : null}

      {showBottomNav ? <BottomNav view={view} setView={setView} /> : null}

      <div className="desktop-frame" aria-hidden="true">
        <BarChart3 size={18} />
        <span>Built for the phone in your gym bag</span>
        <CalendarDays size={18} />
      </div>
    </div>
  );
}
