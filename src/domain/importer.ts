import { BLUEPRINT } from './blueprint';
import type { Difficulty, Question, QuestionOption, QuestionType, Task } from './types';

export interface ImportIssue {
  id: string;
  reason: string;
}

export interface ImportResult<T> {
  items: T[];
  issues: ImportIssue[];
}

const QUESTION_TYPES: QuestionType[] = ['single', 'multiple', 'boolean'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const TASK_DIFFICULTIES = ['beginner', 'advanced', 'exam'];

/** JSON (Array oder einzelnes Objekt) oder CSV; erkennt das Format am Anfang. */
function looksLikeJson(text: string) {
  const trimmed = text.trim();
  return trimmed.startsWith('[') || trimmed.startsWith('{');
}

function parseJsonItems(text: string): unknown[] {
  const parsed = JSON.parse(text.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Fragen-Import aus JSON (wie data/questions/*.json) oder CSV.
 * Mehrfachwerte in CSV-Zellen werden mit ';' (oder '|') getrennt.
 */
export function importQuestions(text: string): ImportResult<Question> {
  const items: Question[] = [];
  const issues: ImportIssue[] = [];
  if (!text.trim()) return { items, issues };

  if (looksLikeJson(text)) {
    for (const raw of parseJsonItems(text)) {
      const parsed = questionFromObject(raw, issues);
      if (parsed) items.push(parsed);
    }
    return { items, issues };
  }

  for (const record of csvRecords(text)) {
    const row = record.values;
    const id = (row.id ?? '').trim();
    if (!id) {
      issues.push({ id: '(ohne id)', reason: 'Pflichtfeld id fehlt' });
      continue;
    }
    const hint = columnIssueReason(record.columnIssue);
    if (hint) {
      issues.push({ id, reason: hint });
      continue;
    }
    const parsed = questionFromObject(questionRowFromCsv(row), issues);
    if (parsed) items.push(parsed);
  }
  return { items, issues };
}

/** Aufgaben-Import aus JSON (wie data/tasks/*.json) oder CSV. */
export function importTasks(text: string): ImportResult<Task> {
  const items: Task[] = [];
  const issues: ImportIssue[] = [];
  if (!text.trim()) return { items, issues };

  if (looksLikeJson(text)) {
    for (const raw of parseJsonItems(text)) {
      const parsed = taskFromObject(raw, issues);
      if (parsed) items.push(parsed);
    }
    return { items, issues };
  }

  for (const record of csvRecords(text)) {
    const row = record.values;
    const id = (row.id ?? '').trim();
    if (!id) {
      issues.push({ id: '(ohne id)', reason: 'Pflichtfeld id fehlt' });
      continue;
    }
    const hint = columnIssueReason(record.columnIssue);
    if (hint) {
      issues.push({ id, reason: hint });
      continue;
    }
    const parsed = taskFromObject(taskRowFromCsv(row), issues);
    if (parsed) items.push(parsed);
  }
  return { items, issues };
}

/** CSV-Zeile auf das JSON-Schema einer Frage umbauen (Zelllisten werden zu Arrays). */
function questionRowFromCsv(row: Record<string, string>): Record<string, unknown> {
  const flat = ['id', 'type', 'topic', 'difficulty', 'subtopic', 'question', 'explanation', 'docsReference', 'needsReview'];
  const obj: Record<string, unknown> = {};
  for (const key of flat) if (row[key] !== undefined) obj[key] = row[key];
  if (row.correctCount !== undefined && row.correctCount.trim()) obj.correctCount = Number(row.correctCount);
  if (row.options !== undefined) obj.options = splitList(row.options);
  if (row.correct !== undefined) obj.correct = splitList(row.correct);
  return obj;
}

/** CSV-Zeile auf das JSON-Schema einer Aufgabe umbauen. */
function taskRowFromCsv(row: Record<string, string>): Record<string, unknown> {
  const flat = ['id', 'title', 'area', 'difficulty', 'estimatedMinutes', 'scenario', 'solution', 'examRelevance'];
  const obj: Record<string, unknown> = {};
  for (const key of flat) if (row[key] !== undefined) obj[key] = row[key];
  for (const key of ['requirements', 'hints', 'commonMistakes']) if (row[key] !== undefined) obj[key] = splitList(row[key]);
  return obj;
}

/** Deutsche Meldung für Zeilen, deren Spaltenanzahl nicht zur Kopfzeile passt. */
function columnIssueReason(issue: 'more' | 'few' | null): string | null {
  if (!issue) return null;
  return issue === 'more'
    ? 'mehr Spalten als die Kopfzeile – Mehrfachwerte in einer Zelle mit | trennen oder die Zelle in Anführungszeichen setzen'
    : 'weniger Spalten als die Kopfzeile – Trennzeichen der Zeile passt nicht zur Kopfzeile (Komma in der Kopfzeile, Semikolon in den Daten?)';
}

function questionFromObject(raw: unknown, issues: ImportIssue[]): Question | null {
  const value = (raw ?? {}) as Record<string, unknown>;
  const id = String(value.id ?? '').trim();
  if (!id) {
    issues.push({ id: '(ohne id)', reason: 'Pflichtfeld id fehlt' });
    return null;
  }
  const rawType = String(value.type ?? '').trim();
  if (rawType && !QUESTION_TYPES.includes(rawType as QuestionType)) {
    issues.push({ id, reason: `unbekannter type "${rawType}" (single, multiple oder boolean)` });
    return null;
  }
  const type = (rawType || 'single') as QuestionType;
  const difficulty = DIFFICULTIES.includes(value.difficulty as Difficulty) ? (value.difficulty as Difficulty) : 'medium';
  const questionText = String(value.question ?? '').trim();
  if (!questionText) {
    issues.push({ id, reason: 'question fehlt' });
    return null;
  }
  const options = normalizeOptions(value.options);
  const optionSet = type === 'boolean' && options.length === 0 ? defaultBooleanOptions() : options;
  const correct = normalizeCorrectList(value.correct, optionSet);

  if (type !== 'boolean' && options.length < 2) {
    issues.push({ id, reason: 'mindestens zwei Optionen nötig' });
    return null;
  }
  if (correct.length === 0) {
    issues.push({ id, reason: 'correct ist leer oder verweist auf unbekannte Optionen' });
    return null;
  }
  const unknown = correct.filter((c) => !optionSet.some((o) => o.id === c));
  if (unknown.length > 0) {
    issues.push({ id, reason: `unbekannte Options-ids: ${unknown.join(', ')}` });
    return null;
  }
  if (!String(value.explanation ?? '').trim()) {
    issues.push({ id, reason: 'explanation fehlt' });
    return null;
  }
  if (!String(value.docsReference ?? '').trim()) {
    issues.push({ id, reason: 'docsReference fehlt' });
    return null;
  }
  const topic = String(value.topic ?? '').trim();
  if (!BLUEPRINT.some((d) => d.key === topic)) {
    issues.push({ id, reason: `unbekannter topic "${topic}"` });
    return null;
  }

  const question: Question = {
    id,
    type,
    topic,
    difficulty,
    subtopic: value.subtopic ? String(value.subtopic) : undefined,
    question: questionText,
    options: type === 'boolean' ? (value.options ? optionSet : undefined) : optionSet,
    correct,
    explanation: String(value.explanation).trim(),
    docsReference: String(value.docsReference).trim(),
    needsReview:
      typeof value.needsReview === 'string' ? isTrue(value.needsReview.trim().toLowerCase()) : value.needsReview === true,
  };
  if (type === 'multiple') {
    const declared = Number(value.correctCount);
    question.correctCount = Number.isFinite(declared) && declared > 0 ? declared : correct.length;
  }
  return question;
}

function taskFromObject(raw: unknown, issues: ImportIssue[]): Task | null {
  const value = (raw ?? {}) as Record<string, unknown>;
  const id = String(value.id ?? '').trim();
  if (!id) {
    issues.push({ id: '(ohne id)', reason: 'Pflichtfeld id fehlt' });
    return null;
  }
  const title = String(value.title ?? '').trim();
  const scenario = String(value.scenario ?? '').trim();
  if (!title || !scenario) {
    issues.push({ id, reason: 'title oder scenario fehlt' });
    return null;
  }
  const area = String(value.area ?? '').trim();
  if (!BLUEPRINT.some((d) => d.key === area)) {
    issues.push({ id, reason: `unbekannte area "${area}"` });
    return null;
  }
  const requirements = toStringArray(value.requirements);
  const hints = toStringArray(value.hints);
  if (requirements.length < 3) {
    issues.push({ id, reason: 'requirements brauchen mindestens 3 Punkte' });
    return null;
  }
  if (hints.length < 3) {
    issues.push({ id, reason: 'hints brauchen 3 Stufen' });
    return null;
  }
  const difficulty = TASK_DIFFICULTIES.includes(value.difficulty as Task['difficulty'])
    ? (value.difficulty as Task['difficulty'])
    : 'beginner';

  const comprehension = Array.isArray(value.comprehensionQuestions)
    ? (value.comprehensionQuestions as unknown[])
        .map((entry) => {
          const item = (entry ?? {}) as Record<string, unknown>;
          return { question: String(item.question ?? '').trim(), answer: String(item.answer ?? '').trim() };
        })
        .filter((entry) => entry.question && entry.answer)
    : undefined;

  const variables =
    value.variables && typeof value.variables === 'object'
      ? Object.fromEntries(
          Object.entries(value.variables as Record<string, unknown>).map(([key, pool]) => [
            key,
            Array.isArray(pool) ? pool.map(String) : [String(pool)],
          ])
        )
      : undefined;

  return {
    id,
    title,
    area,
    difficulty,
    estimatedMinutes: Number(value.estimatedMinutes) || 15,
    scenario,
    requirements,
    hints,
    solution: String(value.solution ?? '').trim(),
    commonMistakes: toStringArray(value.commonMistakes),
    examRelevance: String(value.examRelevance ?? '').trim(),
    comprehensionQuestions: comprehension,
    variables,
  };
}

/** boolean-Fragen ohne eigene Optionen: a = Wahr, b = Falsch (identisch zu present.ts). */
function defaultBooleanOptions(): QuestionOption[] {
  return [
    { id: 'a', text: 'Wahr' },
    { id: 'b', text: 'Falsch' },
  ];
}

function normalizeOptions(value: unknown): QuestionOption[] {
  // JSON-direkt als Array von Objekten, als Array von Texten oder als Zellliste ("A;B|C").
  if (typeof value === 'string') return normalizeOptions(splitList(value));
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, i) => {
      if (typeof entry === 'string') return { id: letter(i), text: entry.trim() };
      const item = (entry ?? {}) as Record<string, unknown>;
      const id = String(item.id ?? letter(i));
      const text = String(item.text ?? '').trim();
      return { id, text };
    })
    .filter((option) => option.text.length > 0);
}

function normalizeCorrectList(value: unknown, options: QuestionOption[]): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? splitList(value) : [value];
  const ids = new Set(options.map((o) => o.id));
  return raw
    .map((entry) => normalizeCorrect(String(entry ?? ''), options))
    .filter((id) => ids.has(id));
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? '').trim()).filter((s) => s.length > 0);
  if (typeof value === 'string') return splitList(value);
  return [];
}

export function parseCsv(text: string, delimiter?: string): Record<string, string>[] {
  return csvRecords(text, delimiter).map((row) => row.values);
}

interface CsvRecord {
  values: Record<string, string>;
  /** Zu viele oder zu wenige Spalten entstehen fast immer durch ein falsches Trennzeichen. */
  columnIssue: 'more' | 'few' | null;
}

const CSV_DELIMITERS = [',', ';', '\t'] as const;

function csvRecords(text: string, delimiter?: string): CsvRecord[] {
  const lines = splitLines(text);
  if (lines.length === 0) return [];
  const sep = delimiter ?? bestDelimiter(lines);
  const header = splitRow(lines[0], sep).map((h) => h.trim());
  const records: CsvRecord[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim().length === 0) continue;
    let cells = splitRow(line, sep);
    // Gemischte Trenner (Kopfzeile mit Komma, Datenzeilen mit Semikolon): Zeile neu zerlegen.
    if (!delimiter && cells.length < header.length) {
      const alternative = CSV_DELIMITERS.find((c) => c !== sep && splitRow(line, c).length === header.length);
      if (alternative) cells = splitRow(line, alternative);
    }
    records.push({
      values: Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])),
      columnIssue: cells.length > header.length ? 'more' : cells.length < header.length ? 'few' : null,
    });
  }
  return records;
}

/** Trenner wählen: Kopfzeile enthält ihn und möglichst viele Datenzeilen passen dazu. */
function bestDelimiter(lines: string[]): string {
  const dataLines = lines.slice(1).filter((line) => line.trim().length > 0);
  let best: string = ',';
  let bestScore = -1;
  for (const candidate of CSV_DELIMITERS) {
    const headerCells = splitRow(lines[0], candidate).length;
    if (headerCells < 2) continue;
    const matched = dataLines.length
      ? dataLines.filter((line) => splitRow(line, candidate).length === headerCells).length / dataLines.length
      : 1;
    if (matched > bestScore) {
      bestScore = matched;
      best = candidate;
    }
  }
  return best;
}

/** Zeilenumbrüche außerhalb von Anführungszeichen – Zeilen für die spätere Parsung pro Zeile. */
function splitLines(text: string): string[] {
  const lines: string[] = [];
  let line = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    line += c;
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        line += text[++i]; // verdoppelte Anführungszeichen gehören zum Text
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') line += text[++i];
      lines.push(line.replace(/[\r\n]+$/, ''));
      line = '';
    }
  }
  if (line.length > 0) lines.push(line.replace(/[\r\n]+$/, ''));
  return lines;
}

function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delimiter) {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += c;
  }
  cells.push(cell);
  return cells;
}

function splitList(value: string) {
  return value
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function letter(index: number) {
  return String.fromCharCode(97 + index); // a, b, c ...
}

function normalizeCorrect(value: string, options: QuestionOption[]) {
  const known = new Set(options.map((o) => o.id));
  const raw = value.trim().toLowerCase();
  if (known.has(raw)) return raw;
  const num = Number(raw);
  if (num >= 1 && num <= options.length) return letter(num - 1);
  return raw;
}

function isTrue(value?: string) {
  return value === 'true' || value === '1' || value === 'ja';
}

/** Merge mit ID-Deduplikat: vorhandene Einträge bleiben, neue kommen dazu. */
export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): ImportResult<T> {
  const known = new Set(existing.map((item) => item.id));
  const items: T[] = [];
  const issues: ImportIssue[] = [];
  for (const item of incoming) {
    if (known.has(item.id)) {
      issues.push({ id: item.id, reason: 'ID existiert bereits – importiert wurde nichts überschrieben' });
      continue;
    }
    known.add(item.id);
    items.push(item);
  }
  return { items, issues };
}
