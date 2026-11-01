import type { Difficulty } from './types';

/** Domains des CSA Mainline Exam Blueprints (Stand Januar 2026, Quelle: nowlearning KB0011554). */
export interface BlueprintDomain {
  key: string;
  name: string;
  weight: number; // Prozent der Prüfungsfragen
  subtopics: string[];
}

export const BLUEPRINT: BlueprintDomain[] = [
  {
    key: 'platform_navigation',
    name: 'Platform Overview and Navigation',
    weight: 7,
    subtopics: ['ServiceNow Platform overview', 'Platform capabilities and services', 'The ServiceNow Instance', 'Next Experience Unified Navigation'],
  },
  {
    key: 'instance_configuration',
    name: 'Instance Configuration',
    weight: 10,
    subtopics: ['Installing applications and plugins', 'Personalizing/customizing the instance', 'Common user interfaces in the Platform'],
  },
  {
    key: 'collaboration',
    name: 'Configuring Applications for Collaboration',
    weight: 20,
    subtopics: [
      'Lists, Filters, and Tags',
      'List and Form anatomy',
      'Form Configuration',
      'Form templates and saving options',
      'Advanced Form Configuration',
      'Task Management',
      'Visual Task Boards (VTBs)',
      'Visualizations, Dashboards, and Platform Analytics',
      'Notifications',
    ],
  },
  {
    key: 'self_service',
    name: 'Self Service & Automation',
    weight: 20,
    subtopics: ['Knowledge Management', 'Service Catalog', 'Workflow Studio', 'Virtual Agent'],
  },
  {
    key: 'database_security',
    name: 'Database Management and Platform Security',
    weight: 30,
    subtopics: ['Data Schema', 'Application/Access Control', 'Importing Data', 'CMDB and CSDM', 'Security Center', 'Shared Responsibility Model'],
  },
  {
    key: 'migration_integration',
    name: 'Data Migration and Integration',
    weight: 13,
    subtopics: ['UI Policies', 'Business Rules', 'System update sets', 'Scripting in ServiceNow'],
  },
];

export const DOMAIN_NAME = (key: string) => BLUEPRINT.find((d) => d.key === key)?.name ?? key;

/** Fragenanzahl pro Domain nach Blueprint-Gewichtung, auf total verteilt (Rundungsfehler ausgeglichen). */
export function planExam(blueprint: BlueprintDomain[], total: number, weights?: Record<string, number>) {
  const resolved = blueprint.map((d) => ({ key: d.key, name: d.name, weight: weights?.[d.key] ?? d.weight }));
  const weightSum = resolved.reduce((s, d) => s + d.weight, 0);
  const raw = resolved.map((d) => ({ ...d, exact: weightSum > 0 ? (d.weight / weightSum) * total : 0 }));
  const counts = raw.map((d) => ({ key: d.key, name: d.name, count: Math.floor(d.exact) }));
  const used = counts.reduce((s, c) => s + c.count, 0);
  const byRemainder = raw
    .map((d, i) => ({ i, frac: d.exact - Math.floor(d.exact) }))
    .sort((a, b) => b.frac - a.frac);
  let left = total - used;
  for (const r of byRemainder) {
    if (left <= 0) break;
    counts[r.i].count += 1;
    left -= 1;
  }
  return counts;
}

export function difficultyLabel(d: Difficulty) {
  return { easy: 'leicht', medium: 'mittel', hard: 'schwer' }[d];
}
