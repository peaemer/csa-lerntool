// Einmalige Aktion: ergänzt bei multiple-Fragen ohne "correctCount" die Anzahl der
// richtigen Antworten (data/questions/*.json). Textbasiert, damit die Formatierung bleibt.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BOM = new RegExp('^' + String.fromCharCode(0xfeff));
const dir = 'data/questions';
let total = 0;

for (const name of readdirSync(dir)) {
  if (!name.endsWith('.json')) continue;
  const path = join(dir, name);
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw.replace(BOM, ''));
  const needed = new Map(
    data
      .filter((q) => q.type === 'multiple' && !Number.isInteger(q.correctCount))
      .map((q) => [q.id, q.correct.length])
  );
  if (!needed.size) continue;

  let currentId = '';
  const out = [];
  for (const line of raw.split('\n')) {
    const idMatch = line.match(/"id":\s*"(q-[A-Za-z0-9_-]+)"/);
    if (idMatch) currentId = idMatch[1];
    out.push(line);
    const correctMatch = line.match(/^(\s*)"correct":\s*\[[^\]]*\],\s*$/);
    if (correctMatch && needed.has(currentId)) {
      out.push(`${correctMatch[1]}"correctCount": ${needed.get(currentId)},`);
      needed.delete(currentId);
      total++;
    }
  }
  if (needed.size) console.log(`  [HINWEIS] ${name}: keine Zeile gefunden für ${[...needed.keys()].join(', ')}`);
  const result = out.join('\n');
  JSON.parse(result.replace(BOM, '')); // Selbsttest: Ergebnis muss gültiges JSON sein
  writeFileSync(path, result, 'utf8');
}
console.log('correctCount ergänzt:', total);
