export type QuestionType = 'single' | 'multiple' | 'boolean';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface QuestionOption {
  id: string;
  text: string;
}

/** Schema einer Frage in /data/questions/*.json (siehe README für das vollständige Feld). */
export interface Question {
  id: string;
  type: QuestionType;
  /** Domain-Key des Exam-Blueprints, z. B. "database_security" */
  topic: string;
  difficulty: Difficulty;
  question: string;
  /** Nur bei single/multiple. Bei boolean weglassen (wird automatisch erzeugt). */
  options?: QuestionOption[];
  /** ids der richtigen Antworten; bei boolean: [option.id] */
  correct: string[];
  /** Anzahl der zu wählenden Antworten bei multiple (wird in der Prüfung angezeigt) */
  correctCount?: number;
  explanation: string;
  docsReference: string;
  subtopic?: string;
  needsReview?: boolean;
}

export type TaskDifficulty = 'beginner' | 'advanced' | 'exam';

export interface Task {
  id: string;
  title: string;
  /** Area-Key, passend zum Blueprint (z. B. "database_security") */
  area: string;
  difficulty: TaskDifficulty;
  estimatedMinutes: number;
  scenario: string;
  /** Checkliste zum Abhaken in der PDI */
  requirements: string[];
  /** 3 gestaffelte Hinweis-Stufen */
  hints: string[];
  /** Klickpfad + Musterlösung */
  solution: string;
  commonMistakes: string[];
  examRelevance: string;
  comprehensionQuestions?: { question: string; answer: string }[];
  /** Platzhalter-Pools: {table}, {role}, {field}, {condition}, {app} */
  variables?: Record<string, string[]>;
}

export interface ResolvedTask extends Task {
  /** Aufgelöste Platzhalter-Werte, z. B. table: 'u_laptop' */
  values: Record<string, string>;
  /** Stabiler Hash aus Task-ID + konkreten Werten -> verhindert Doppelung */
  variantKey: string;
}

export interface AnswerRecord {
  questionId: string;
  topic: string;
  difficulty: Difficulty;
  /** Leitner-Box 1..5 (1 = häufigste Wiederholung) */
  box: number;
  correctCount: number;
  wrongCount: number;
  firstSeen: number;
  lastSeen: number;
  /** Zeitstempel der letzten Antwort: 0 falsch / 1 richtig */
  history: number[];
  /** true, wenn die Frage als "markiert" (Review-Flag) in der Prüfung gilt */
  flagged?: boolean;
}

export interface AttemptRecord {
  id: string;
  mode: 'learn' | 'exam' | 'weakness';
  timestamp: number;
  questionId: string;
  topic: string;
  difficulty: Difficulty;
  correct: boolean;
  durationMs: number;
  /** ids der gegebenen Antworten (inshuffled-Reihenfolge) */
  answer: string[];
}

export interface ExamResult {
  id: string;
  timestamp: number;
  mode: 'exam';
  durationMs: number;
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  /** Auswertung pro Blueprint-Domain */
  perTopic: Record<string, { asked: number; correct: number; percent: number }>;
  flagged: string[];
}

export interface Settings {
  theme: 'light' | 'dark';
  shuffleAnswers: boolean;
  examMinutes: number;
  examQuestions: number;
  weights: Record<string, number>;
  filterTopic: string | null;
  filterDifficulty: Difficulty | null;
  filterStatus: 'all' | 'new' | 'learning' | 'wrong' | 'mastered';
}

export interface AppState {
  answers: Record<string, AnswerRecord>;
  attempts: AttemptRecord[];
  examResults: ExamResult[];
  taskStatus: Record<string, 'open' | 'working' | 'done'>;
  taskNotes: Record<string, string>;
  taskChecks: Record<string, Record<number, boolean>>;
  seenTaskVariants: string[];
  settings: Settings;
  userQuestions: Question[];
  userTasks: Task[];
}
