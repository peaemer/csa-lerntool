import { useEffect, useMemo, useState } from 'react';
import { FiltersBar } from '../components/FiltersBar';
import { BLUEPRINT } from '../domain/blueprint';
import { filterQuestions } from '../domain/scoring';
import { isDue } from '../domain/scoring';
import { statusCounts } from '../domain/stats';
import { LearnView } from '../views/LearnView';
import { WeaknessView } from '../views/WeaknessView';
import { ExamView } from '../views/ExamView';
import { TasksView } from '../views/TasksView';
import { StatsView } from '../views/StatsView';
import { ContentView } from '../views/ContentView';
import { useStore } from './store';

const TABS = [
  { key: 'learn', label: 'Lernmodus' },
  { key: 'exam', label: 'Prüfungssimulation' },
  { key: 'weakness', label: 'Schwächen-Training' },
  { key: 'tasks', label: 'Praxisaufgaben' },
  { key: 'stats', label: 'Statistik' },
  { key: 'content', label: 'Inhalte & Import' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const TAB_STORAGE_KEY = 'csa-lerntool.tab';

const SYNC_TEXT: Record<string, string> = {
  local: 'Lernstand: lokal',
  synced: 'Lernstand: synchron',
  pending: 'Lernstand: Übertragung …',
  offline: 'Lernstand: Server nicht erreichbar',
  error: 'Lernstand: Sync-Fehler',
  conflict: 'Lernstand: Konflikt',
};

function SyncBadge({ store, onOpen }: { store: ReturnType<typeof useStore>; onOpen: () => void }) {
  const status = store.sync.status;
  return (
    <button
      className={`badge ${status === 'synced' ? 'ok' : status === 'conflict' || status === 'error' ? 'bad' : status === 'local' ? '' : 'warn'}`}
      onClick={onOpen}
      title="Lernstand synchronisieren – Einstellungen im Bereich Inhalte & Import"
    >
      {SYNC_TEXT[status] ?? 'Lernstand'}
    </button>
  );
}

export function App() {
  const store = useStore();
  const [tab, setTab] = useState<TabKey>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(TAB_STORAGE_KEY) : null;
    return TABS.some((t) => t.key === saved) ? (saved as TabKey) : 'learn';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = store.state.settings.theme;
  }, [store.state.settings.theme]);

  const patchSettings = (patch: Partial<typeof store.state.settings>) =>
    store.mutate((draft) => {
      draft.settings = { ...draft.settings, ...patch };
    });

  const filtered = useMemo(
    () =>
      filterQuestions(store.questions, store.state, {
        topic: store.state.settings.filterTopic,
        difficulty: store.state.settings.filterDifficulty,
        status: store.state.settings.filterStatus,
      }),
    [store.questions, store.state]
  );

  const now = Date.now();
  const dueCount = Object.values(store.state.answers).filter((rec) => isDue(rec, now)).length;
  const counts = statusCounts(store.questions, store.state);

  if (!store.ready) {
    return (
      <div className="wrap">
        <div className="card">
          <h2>Lernfortschritt wird geladen …</h2>
          <p className="muted">Daten werden aus IndexedDB gelesen.</p>
        </div>
      </div>
    );
  }

  const withFilters = tab === 'learn' || tab === 'weakness';

  return (
    <div className="wrap">
      <header className="bar">
        <h1>CSA-Lerntool · ServiceNow</h1>
        <nav className="tabs">
          {TABS.map((item) => (
            <button
              key={item.key}
              className={tab === item.key ? 'active' : ''}
              onClick={() => {
                setTab(item.key);
                try {
                  localStorage.setItem(TAB_STORAGE_KEY, item.key);
                } catch {
                  /* Speicher nicht verfügbar – Reiter bleibt nur für diese Sitzung gesetzt */
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <span className="muted">
          {store.questions.length} Fragen · {store.tasks.length} Aufgaben · {dueCount} fällig
        </span>
        <SyncBadge store={store} onOpen={() => setTab('content')} />
        <button
          className="ghost"
          onClick={() => patchSettings({ theme: store.state.settings.theme === 'dark' ? 'light' : 'dark' })}
        >
          {store.state.settings.theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
        </button>
      </header>

      <main>
        {withFilters ? (
          <FiltersBar settings={store.state.settings} onChange={patchSettings} showStatus={tab === 'learn'} />
        ) : null}

        {tab === 'learn' ? (
          <LearnView store={store} pool={filtered} />
        ) : tab === 'exam' ? (
          <ExamView store={store} />
        ) : tab === 'weakness' ? (
          <WeaknessView store={store} />
        ) : tab === 'tasks' ? (
          <TasksView store={store} />
        ) : tab === 'stats' ? (
          <StatsView store={store} />
        ) : (
          <ContentView store={store} />
        )}
      </main>

      <footer className="card">
        <p className="muted">
          Fragenstatus: {counts.new} neu · {counts.learning} in Arbeit · {counts.wrong} falsch beantwortet ·{' '}
          {counts.mastered} gemeistert.
          Inhalte in <code>data/questions/</code> und <code>data/tasks/</code>; alle Angaben ohne Gewähr,
          Unsicherheiten sind mit „Inhalt prüfen“ markiert.
        </p>
        <p className="muted">
          Blueprint-Gewichte:{' '}
          {BLUEPRINT.map((d) => `${d.weight} % ${d.name}`).join(' · ')}
        </p>
      </footer>
    </div>
  );
}
