#!/usr/bin/env node
// Validiert /data/questions/*.json und /data/tasks/*.json gegen das Schema (npm run validate).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] ?? process.cwd();
const TOPICS = new Set([
  'platform_navigation',
  'instance_configuration',
  'collaboration',
  'self_service',
  'database_security',
  'migration_integration',
]);

// Platzhalter-Pools, die in src/domain/taskgen.ts global definiert sind (müssen nicht pro Aufgabe wiederholt werden).
const GLOBAL_POOLS = new Set(['table', 'role', 'group', 'field', 'condition', 'app', 'user']);

let errors = 0;
const seen = new Set();
const counts = {};

function fail(file, msg) {
  console.log(`  [FEHLER] ${file}: ${msg}`);
  errors++;
}

function checkQuestion(file, q) {
  if (!q.id || !TOPICS.has(q.topic)) fail(file, `topic "${q.topic}" unbekannt (${q.id})`);
  if (!['single', 'multiple', 'boolean'].includes(q.type)) fail(file, `type "${q.type}" (${q.id})`);
  if (!q.explanation || !q.docsReference) fail(file, `explanation/docsReference fehlt (${q.id})`);
  const options = q.options ?? [];
  if (q.type !== 'boolean' && options.length < 4) fail(file, `zu wenige Optionen (${q.id})`);
  const ids = new Set(options.map((o) => o.id));
  if (!Array.isArray(q.correct) || q.correct.length === 0) fail(file, `correct leer (${q.id})`);
  for (const c of q.correct) if (!ids.has(c)) fail(file, `correct "${c}" nicht in options (${q.id})`);
  if (q.type === 'multiple' && q.correctCount && q.correct.length !== q.correctCount) {
    fail(file, `correctCount ${q.correctCount} != ${q.correct.length} (${q.id})`);
  }
  if (q.correct.length !== new Set(q.correct).size) fail(file, `correct dupliziert (${q.id})`);
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) fail(file, `difficulty "${q.difficulty}" (${q.id})`);
  if (seen.has(q.id)) fail(file, `doppelte ID ${q.id}`);
  seen.add(q.id);
  counts[q.topic] = (counts[q.topic] ?? 0) + 1;
}

function checkTask(file, t) {
  if (!t.id || !TOPICS.has(t.area)) fail(file, `area "${t.area}" unbekannt (${t.id})`);
  if (!['beginner', 'advanced', 'exam'].includes(t.difficulty)) fail(file, `difficulty "${t.difficulty}" (${t.id})`);
  if (!Array.isArray(t.requirements) || t.requirements.length < 3) fail(file, `Checkliste < 3 (${t.id})`);
  if (!Array.isArray(t.hints) || t.hints.length < 3) fail(file, `hints < 3 Stufen (${t.id})`);
  if (!t.solution) fail(file, `solution fehlt (${t.id})`);
  if (!Array.isArray(t.commonMistakes) || t.commonMistakes.length === 0) fail(file, `commonMistakes leer (${t.id})`);
  if (!t.examRelevance) fail(file, `examRelevance fehlt (${t.id})`);
  const text = [t.title, t.scenario, ...(t.requirements ?? []), ...(t.hints ?? []), t.solution].join(' ');
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    if (!t.variables?.[m[1]] && !GLOBAL_POOLS.has(m[1])) fail(file, `Platzhalter {${m[1]}} ohne Pool (${t.id})`);
  }
  if (t.comprehensionQuestions && (!Array.isArray(t.comprehensionQuestions) || t.comprehensionQuestions.some((c) => !c.question || !c.answer))) {
    fail(file, `comprehensionQuestions unvollständig (${t.id})`);
  }
  if (seen.has(t.id)) fail(file, `doppelte ID ${t.id}`);
  seen.add(t.id);
  counts[t.area] = (counts[t.area] ?? 0) + 1;
}

for (const dir of ['data/questions', 'data/tasks']) {
  const abs = join(ROOT, dir);
  let files = [];
  try {
    files = readdirSync(abs);
  } catch {
    console.log(`kein Ordner ${dir}`);
    continue;
  }
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    const raw = JSON.parse(readFileSync(join(abs, f), 'utf8'));
    const items = Array.isArray(raw) ? raw : [raw];
    for (const item of items) (dir.includes('questions') ? checkQuestion : checkTask)(f, item);
    console.log(`${dir}/${f}: ${items.length}`);
  }
}

console.log('Verteilung:', counts);
console.log(errors === 0 ? 'OK' : `${errors} Fehler`);
process.exit(errors ? 1 : 0);
