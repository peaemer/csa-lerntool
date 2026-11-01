import { describe, expect, it } from 'vitest';
import { importQuestions, importTasks, mergeById, parseCsv } from '../src/domain/importer';

const JSON_QUESTIONS = JSON.stringify([
  {
    id: 'q-new-001',
    type: 'single',
    topic: 'collaboration',
    difficulty: 'easy',
    subtopic: 'Lists, Filters, and Tags',
    question: 'Wo wird die Sortierung einer Liste dauerhaft für alle Ansichten dieses Nutzers gespeichert?',
    options: [
      { id: 'a', text: 'Im Listenkopf über die Sortierpfeile' },
      { id: 'b', text: 'Im Persönlichen Menü unter Defaults' },
      { id: 'c', text: 'In der Tabellen-Konfiguration' },
      { id: 'd', text: 'In einem ACL' },
    ],
    correct: ['a'],
    correctCount: 1,
    explanation: 'Die Sortierpfeile im Listenkopf gelten für alle Ansichten des Nutzers.',
    docsReference: 'Lists v3',
    needsReview: false,
  },
  {
    id: 'q-new-002',
    type: 'multiple',
    topic: 'database_security',
    difficulty: 'hard',
    question: 'Wählen Sie genau zwei Antworten.',
    options: [
      { id: 'a', text: 'ACL-Typ field' },
      { id: 'b', text: 'UI Policy' },
      { id: 'c', text: 'Field Level Security' },
      { id: 'd', text: 'Business Rule' },
    ],
    correct: ['a', 'c'],
    explanation: 'Field-ACLs und Field Level Security regeln den Feldzugriff.',
    docsReference: 'Field Level Security',
    needsReview: true,
  },
]);

describe('Fragen-Import aus JSON', () => {
  it('liest das Format aus data/questions/*.json unverändert', () => {
    const { items, issues } = importQuestions(JSON_QUESTIONS);
    expect(issues).toEqual([]);
    expect(items).toHaveLength(2);
    expect(items[0].options?.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(items[0].subtopic).toBe('Lists, Filters, and Tags');
    expect(items[1].correctCount).toBe(2);
    expect(items[1].needsReview).toBe(true);
    expect(items[1].difficulty).toBe('hard');
  });

  it('ein einzelnes Objekt wird ebenfalls akzeptiert', () => {
    const single = JSON.stringify({ ...JSON.parse(JSON_QUESTIONS).at(0), id: 'q-single-1' });
    const { items, issues } = importQuestions(single);
    expect(issues).toEqual([]);
    expect(items[0].id).toBe('q-single-1');
  });

  it('boolean ohne Optionen bleibt ohne Optionen', () => {
    const { items, issues } = importQuestions(
      JSON.stringify([
        {
          id: 'q-bool-1',
          type: 'boolean',
          topic: 'migration_integration',
          difficulty: 'easy',
          question: 'Ein Update Set kann verworfen werden.',
          correct: ['a'],
          explanation: 'Ja, über Update Sets > Preview and Discard.',
          docsReference: 'Update Sets',
        },
      ])
    );
    expect(issues).toEqual([]);
    expect(items[0].options).toBeUndefined();
    expect(items[0].correct).toEqual(['a']);
  });

  it('options als Zellliste ("A;B;C;D") werden getrennt', () => {
    const first = JSON.parse(JSON_QUESTIONS).at(0) as Record<string, unknown>;
    const { items, issues } = importQuestions(
      JSON.stringify([{ ...first, id: 'q-opts-string', options: 'Antwort A; Antwort B;Antwort C; Antwort D', correct: '2' }])
    );
    expect(issues).toEqual([]);
    expect(items[0].options?.map((o) => o.text)).toEqual(['Antwort A', 'Antwort B', 'Antwort C', 'Antwort D']);
    expect(items[0].correct).toEqual(['b']);
  });

  it('lehnt defekte Einträge mit Grund ab, ohne andere zu verwerfen', () => {
    const payload = JSON.stringify([
      JSON.parse(JSON_QUESTIONS).at(0),
      { ...JSON.parse(JSON_QUESTIONS).at(0), id: 'q-bad-topic', topic: 'irgendwas' },
      { ...JSON.parse(JSON_QUESTIONS).at(0), id: 'q-bad-explanation', explanation: '  ' },
      { ...JSON.parse(JSON_QUESTIONS).at(0), id: 'q-bad-docs', docsReference: '' },
      { ...JSON.parse(JSON_QUESTIONS).at(0), id: 'q-bad-correct', correct: ['z'] },
      { ...JSON.parse(JSON_QUESTIONS).at(0), id: '', question: 'ohne id' },
      { ...JSON.parse(JSON_QUESTIONS).at(0), id: 'q-bad-options', options: [{ id: 'a', text: 'nur eine' }] },
    ]);
    const { items, issues } = importQuestions(payload);
    expect(items.map((q) => q.id)).toEqual(['q-new-001']);
    const reasons = issues.map((i) => `${i.id}: ${i.reason}`).sort();
    expect(reasons).toEqual([
      '(ohne id): Pflichtfeld id fehlt',
      'q-bad-correct: correct ist leer oder verweist auf unbekannte Optionen',
      'q-bad-docs: docsReference fehlt',
      'q-bad-explanation: explanation fehlt',
      'q-bad-options: mindestens zwei Optionen nötig',
      'q-bad-topic: unbekannter topic "irgendwas"',
    ]);
  });
});

describe('Fragen-Import aus CSV', () => {
  const csv = [
    'id,type,topic,difficulty,question,options,correct,explanation,docsReference',
    'q-csv-1,single,self_service,easy,"Wer genehmigt einen Request?",Option A;Option B;Option C;Option D,1,"weil der Approver",Approve/Reject',
    'q-csv-2,multiple,collaboration,medium,Wählen Sie genau zwei.,A;B;C;D,a;c,Erklärung,Tags',
    'q-csv-3,single,platform_navigation,easy,Frage,A;B,1,Erklärung,Doku',
  ].join('\n');

  it('wandelt CSV-Zeilen in Fragen um', () => {
    const { items, issues } = importQuestions(csv);
    expect(items).toHaveLength(3);
    expect(items[0].options?.[3].text).toBe('Option D');
    expect(items[0].correct).toEqual(['a']); // "1" wird auf die erste Option gemappt
    expect(items[1].correct).toEqual(['a', 'c']);
    expect(items[1].correctCount).toBe(2);
    expect(issues).toEqual([]);
  });

  it('CSV-Zeilen werden wie JSON geprüft (unbekanntes topic/type)', () => {
    const bad = [
      'id,type,topic,difficulty,question,options,correct,explanation,docsReference',
      'q-csv-bad-1,single,irgendwas,easy,Frage,A;B;C;D,1,Erklärung,Doku',
      'q-csv-bad-2,signle,self_service,easy,Frage,A;B;C;D,1,Erklärung,Doku',
      'q-csv-bad-3,single,self_service,easy,,A;B;C;D,1,Erklärung,Doku',
    ].join('\n');
    const { items, issues } = importQuestions(bad);
    expect(items).toHaveLength(0);
    expect(issues.map((i) => `${i.id}: ${i.reason}`)).toEqual([
      'q-csv-bad-1: unbekannter topic "irgendwas"',
      'q-csv-bad-2: unbekannter type "signle" (single, multiple oder boolean)',
      'q-csv-bad-3: question fehlt',
    ]);
  });

  it('parseCsv erkennt Semikolon als Trenner in der Kopfzeile', () => {
    const rows = parseCsv('id;question\nq-1;Text mit, Komma');
    expect(rows).toEqual([{ id: 'q-1', question: 'Text mit, Komma' }]);
  });

  it('Semicolon-CSV mit | als Zell-Trenner funktioniert', () => {
    const semicolonCsv = [
      'id;type;topic;difficulty;question;options;correct;explanation;docsReference',
      'q-semi-1;multiple;collaboration;medium;Wählen Sie zwei.;A|B|C|D;a|c;Erklärung mit Komma, hier;Tags',
    ].join('\n');
    const { items, issues } = importQuestions(semicolonCsv);
    expect(issues).toEqual([]);
    expect(items[0].options).toHaveLength(4);
    expect(items[0].correct).toEqual(['a', 'c']);
    expect(items[0].correctCount).toBe(2);
  });

  it('ungetrennte Mehrfachwerte in Semikolon-CSV werden abgelehnt statt verschoben', () => {
    const broken = [
      'id;type;topic;difficulty;question;options;correct;explanation;docsReference',
      'q-broken-1;multiple;collaboration;medium;Frage;A;B;C;a;b;c;Erklärung;Tags',
    ].join('\n');
    const { items, issues } = importQuestions(broken);
    expect(items).toHaveLength(0);
    expect(issues[0].reason).toContain('mehr Spalten als die Kopfzeile');
  });

  it('Kopfzeile mit Komma und Datenzeilen mit Semikolon werden zusammengeführt', () => {
    const mixed = [
      'id,type,topic,difficulty,subtopic,question,options,correct,explanation,docsReference,needsReview',
      'q-mix-1;multiple;self_service;medium;Flow Designer;Welche Bausteine braucht ein Flow?;"Trigger;Conditions;Actions;Reports";"1;2;3";"Trigger, Conditions und Actions sind Pflicht.";Flow Designer;false',
    ].join('\n');
    const { items, issues } = importQuestions(mixed);
    expect(issues).toEqual([]);
    expect(items[0].id).toBe('q-mix-1');
    expect(items[0].subtopic).toBe('Flow Designer');
    expect(items[0].options).toHaveLength(4);
    expect(items[0].correct).toEqual(['a', 'b', 'c']);
    expect(items[0].correctCount).toBe(3);
    expect(items[0].explanation).toBe('Trigger, Conditions und Actions sind Pflicht.');
  });

  it('Zeilen mit zu wenigen Spalten werden mit Hinweis abgelehnt', () => {
    const tooShort = ['id,type,topic,difficulty,question,options,correct,explanation,docsReference', 'q-short-1,single'].join('\n');
    const { items, issues } = importQuestions(tooShort);
    expect(items).toHaveLength(0);
    expect(issues[0].reason).toContain('weniger Spalten als die Kopfzeile');
  });
});

describe('Aufgaben-Import', () => {
  const task = {
    id: 't-neu-001',
    title: 'Tabelle {table} anlegen',
    area: 'database_security',
    difficulty: 'beginner',
    estimatedMinutes: 20,
    scenario: 'Sie brauchen eine eigene Tabelle {table}.',
    requirements: ['Punkt 1', 'Punkt 2', 'Punkt 3'],
    hints: ['Stufe 1', 'Stufe 2', 'Stufe 3'],
    solution: 'Application > Table > New',
    commonMistakes: ['Falsche Basistabelle'],
    examRelevance: 'Table-Convention-Checker',
    comprehensionQuestions: [{ question: 'Was macht der Checker?', answer: 'Er prüft Tabellennamen.' }],
    variables: { table: ['u_test'] },
  };

  it('JSON-Aufgabe inkl. Variablen und Verständnisfragen', () => {
    const { items, issues } = importTasks(JSON.stringify([task]));
    expect(issues).toEqual([]);
    expect(items[0].comprehensionQuestions).toHaveLength(1);
    expect(items[0].variables).toEqual({ table: ['u_test'] });
    expect(items[0].difficulty).toBe('beginner');
  });

  it('unbekannte area und zu kurze Hinweise werden abgelehnt', () => {
    const badArea = importTasks(JSON.stringify([{ ...task, id: 't-x', area: 'nix' }]));
    expect(badArea.items).toHaveLength(0);
    expect(badArea.issues[0].reason).toContain('unbekannte area');

    const shortHints = importTasks(JSON.stringify([{ ...task, id: 't-y', hints: ['nur einer'] }]));
    expect(shortHints.items).toHaveLength(0);
    expect(shortHints.issues[0].reason).toContain('hints');
  });

  it('CSV-Aufgaben mit Semikolon-Listen', () => {
    const csv =
      'id,title,area,difficulty,estimatedMinutes,scenario,requirements,hints,solution,commonMistakes,examRelevance\n' +
      't-csv-1,Aufgabe,database_security,advanced,25,Szenario,R1;R2;R3,H1;H2;H3,Lösung,Fehler,Bezug';
    const { items, issues } = importTasks(csv);
    expect(issues).toEqual([]);
    expect(items[0].requirements).toEqual(['R1', 'R2', 'R3']);
    expect(items[0].hints).toHaveLength(3);
  });

  it('CSV-Aufgaben ohne drei Checklisten-Punkte werden abgelehnt', () => {
    const csv =
      'id,title,area,difficulty,estimatedMinutes,scenario,requirements,hints,solution\n' +
      't-csv-bad-1,Zu kurz,database_security,beginner,15,Szenario,R1;R2,H1;H2;H3,Lösung';
    const { items, issues } = importTasks(csv);
    expect(items).toHaveLength(0);
    expect(issues[0].reason).toContain('requirements brauchen mindestens 3 Punkte');
  });
});

describe('Merge ohne Überschreiben', () => {
  it('bekannte IDs werden übersprungen, Doppelungen in der Liste ebenfalls', () => {
    const existing = [{ id: 'q-1' }];
    const incoming = [{ id: 'q-1' }, { id: 'q-2' }, { id: 'q-2' }];
    const merged = mergeById(existing, incoming);
    expect(merged.items.map((i) => i.id)).toEqual(['q-2']);
    expect(merged.issues.map((i) => i.id)).toEqual(['q-1', 'q-2']);
  });
});
