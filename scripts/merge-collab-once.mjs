// Einmalige Aktion: die vier nur in checkpoints/collab_original_recovered.json vorhandenen
// Collaboration-Fragen an data/questions/collaboration.json anhängen (q-collab-023b -> q-collab-032).
import { readFileSync, writeFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

const target = 'data/questions/collaboration.json';
const current = readJson(target);
const recovered = readJson('checkpoints/collab_original_recovered.json');
const known = new Set(current.map((q) => q.id));

const wanted = ['q-collab-023b', 'q-collab-029', 'q-collab-030', 'q-collab-031'];
const add = recovered.filter((q) => wanted.includes(q.id)).map((q) => ({ ...q }));
if (add.length !== wanted.length) throw new Error(`erwartet ${wanted.length}, gefunden ${add.length}`);

for (const q of add) {
  if (known.has(q.id)) throw new Error(`${q.id} existiert bereits`);
}

// Umbenennung, damit keine ID mit der früheren Fassung kollidiert und die Nummerlücke gefüllt ist.
add.find((q) => q.id === 'q-collab-023b').id = 'q-collab-032';

// Sprachliche Glättung (Einheitsstil der Datei: „Wähle genau …“, „Wahr/Falsch“, keine Tippfehler).
const clean = (text) =>
  text
    .replace(/Wählen Sie genau 2 Antworten\./g, 'Wähle genau zwei Antworten.')
    .replace(/Wählen Sie genau 3 Antworten\./g, 'Wähle genau drei Antworten.')
    .replace(/Wählen Sie genau zwei Antworten\./g, 'Wähle genau zwei Antworten.')
    .replace(/kontabezogene/g, 'datensatzbezogene')
    .replace(/\s+/g, ' ')
    .trim();

for (const q of add) {
  q.question = clean(q.question);
  q.explanation = clean(q.explanation);
  if (q.type === 'boolean' && Array.isArray(q.options)) {
    q.options = q.options.map((o) => ({ ...o, text: o.text === 'Richtig' ? 'Wahr' : o.text }));
  }
  if (q.type === 'multiple' && !q.correctCount) q.correctCount = q.correct.length;
}

// An die Datei-ENDS-Position: Notifications-Fragen hinter die übrigen, Visual Task Boards dort,
// wo das Unterthema in der Datei sonst steht (vor den Notification-Fragen).
const ordered = [...current];
const vtb = add.find((q) => q.subtopic === 'Visual Task Boards');
const rest = add.filter((q) => q !== vtb);
if (vtb) {
  let index = -1;
  ordered.forEach((q, i) => {
    if (q.subtopic === 'Visual Task Boards') index = i;
  });
  ordered.splice(index + 1, 0, vtb);
}
ordered.push(...rest);

// Serialisierung im Stil der vorhandenen Datei (2 Leerzeichen, Optionen und correct inline).
const j = (value) => JSON.stringify(value);
const block = (q) => {
  const lines = ['  {'];
  const fields = [
    ['id', j(q.id)],
    ['type', j(q.type)],
    ['topic', j(q.topic)],
    ['difficulty', j(q.difficulty)],
    ['subtopic', j(q.subtopic)],
    ['question', j(q.question)],
  ];
  for (const [key, value] of fields) lines.push(`    ${j(key)}: ${value},`);
  if (q.options) {
    lines.push('    "options": [');
    lines.push(q.options.map((o) => `      { "id": ${j(o.id)}, "text": ${j(o.text)} }`).join(',\n'));
    lines.push('    ],');
  }
  lines.push(`    "correct": [${q.correct.map(j).join(', ')}],`);
  if (q.correctCount !== undefined) lines.push(`    "correctCount": ${q.correctCount},`);
  lines.push(`    "explanation": ${j(q.explanation)},`);
  lines.push(`    "docsReference": ${j(q.docsReference)},`);
  lines.push(`    "needsReview": ${q.needsReview === true}`);
  lines.push('  }');
  return lines.join('\n');
};

const json = `[\n${ordered.map(block).join(',\n')}\n]\n`;
JSON.parse(json); // Selbsttest: muss gültiges JSON ergeben
writeFileSync(target, json, 'utf8');
console.log(`gespeichert: ${ordered.length} Fragen (neu: ${add.map((q) => q.id).join(', ')})`);
