import type { ResolvedTask, Task } from './types';
import { hashString, pick, shuffle, type Rng } from './rng';

/** Globale Platzhalter-Pools; Aufgaben mit eigenen `variables` überschreiben diese. */
export const GLOBAL_POOLS: Record<string, string[]> = {
  table: ['u_laptop', 'u_hardware', 'u_vendor', 'u_contract', 'u_student', 'u_book', 'u_car', 'u_asset', 'u_network_switch'],
  role: ['itil', 'admin', 'sn_business_unit_manager', 'it_support', 'approver', 'field_agent', 'hr_admin'],
  group: ['Hardware Support', 'Network Team', 'Facilities Team', 'L1 Support', 'Change Approver Group'],
  field: ['u_purchase_date', 'u_vendor_rating', 'u_budget_code', 'u_room_number', 'u_serial_number', 'u_warranty_end'],
  condition: ['state = new', 'active true', 'u_priority 1', 'u_assigned_group nicht leer', 'u_requester in der Gruppe', 'company = Acme'],
  app: ['incident', 'problem', 'change', 'sc_task', 'hr_snapshot', 'uh_bundle'],
  user: ['Jobt Eitel', 'Fokko Semmekost', 'Abe Clsing', 'Donald Drick'],
};

const PLACEHOLDER_KEYS = ['table', 'role', 'group', 'field', 'condition', 'app', 'user'];

/** Platzhalter {table}, {role}, {field}, {condition}, {app}, {user} ersetzen. */
export function renderTemplate(text: string, values: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}

function variantKeyOf(task: Task, values: Record<string, string>) {
  const parts = PLACEHOLDER_KEYS.map((k) => values[k] ?? '').join('/');
  return `${task.id}:${hashString(parts)}`;
}

export function resolveVariables(task: Task, rng: Rng, seenKeys: string[] = []) {
  const values: Record<string, string> = {};
  for (const key of PLACEHOLDER_KEYS) {
    const pool = task.variables?.[key] ?? GLOBAL_POOLS[key];
    values[key] = pick(pool, rng);
  }
  let variantKey = variantKeyOf(task, values);
  // Variante schon gespielt? Bis zu 20 Mal neu würfeln; wenn alle durch sind, bewusst zulassen.
  for (let i = 0; i < 20 && seenKeys.includes(variantKey); i++) {
    for (const key of PLACEHOLDER_KEYS) values[key] = pick(task.variables?.[key] ?? GLOBAL_POOLS[key], rng);
    variantKey = variantKeyOf(task, values);
  }
  return { values, variantKey };
}

/** Aufgabe inkl. Platzhalterauflösung; Texte werden über renderTaskText aufgelöst. */
export function buildTask(task: Task, rng: Rng, seenKeys: string[] = []): ResolvedTask {
  const { values, variantKey } = resolveVariables(task, rng, seenKeys);
  return { ...task, values, variantKey };
}

export function renderTaskText(text: string, values: Record<string, string>) {
  return renderTemplate(text, values);
}

export function applyTaskFilters(tasks: Task[], filters: { area?: string | null; difficulty?: string | null }) {
  return tasks.filter((t) => {
    if (filters.area && t.area !== filters.area) return false;
    if (filters.difficulty && t.difficulty !== filters.difficulty) return false;
    return true;
  });
}

function variantCount(task: Task) {
  if (!task.variables) return Infinity;
  return Object.values(task.variables).reduce((s, p) => s * p.length, 1);
}

/**
 * Zufallsaufgabe: keine Wiederholung derselben Variante, bis alle Varianten des Filters durch sind.
 * Schwache Bereiche (weakAreas) werden über ihre Gewichtung mehrfach in den Lostopf aufgenommen.
 * Gibt null zurück, wenn alle Varianten durch sind.
 */
export function nextTask(
  tasks: Task[],
  rng: Rng,
  seenKeys: string[],
  weakAreas: string[] = [],
  status?: Record<string, 'open' | 'working' | 'done'>
) {
  const pool = tasks.filter((t) => status?.[t.id] !== 'done');
  if (pool.length === 0) return null;

  const candidates = pool.filter((t) => seenKeys.filter((k) => k.startsWith(`${t.id}:`)).length < variantCount(t));
  if (candidates.length === 0) return null; // alle Varianten dieses Filters sind durch
  const base = candidates;

  const weighted: Task[] = [];
  for (const t of base) {
    const boost = weakAreas.includes(t.area) ? 3 : 1;
    for (let i = 0; i < boost; i++) weighted.push(t);
  }
  return buildTask(shuffle(weighted, rng)[0], rng, seenKeys);
}
