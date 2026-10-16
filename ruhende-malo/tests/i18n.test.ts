import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES, evidenceText, resultText, translate } from '../app/src/i18n.js';
import { VSZ_ITEMS } from '../srv/construct/vsz.js';

const de = DICTIONARIES.de as Record<string, string>;
const en = DICTIONARIES.en as Record<string, string>;
const read = (path: string) => readFileSync(path, 'utf8');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('language completeness (DE / EN)', () => {
  it('German and English have exactly the same keys', () => {
    expect(Object.keys(de).filter((k) => !(k in en))).toEqual([]);
    expect(Object.keys(en).filter((k) => !(k in de))).toEqual([]);
  });

  it('no empty texts, and every key has the same placeholders in both languages', () => {
    for (const k of Object.keys(de)) {
      expect(de[k].trim().length, `DE ${k}`).toBeGreaterThan(0);
      expect(en[k].trim().length, `EN ${k}`).toBeGreaterThan(0);
      expect(placeholders(en[k]), `placeholders of ${k}`).toBe(placeholders(de[k]));
    }
  });

  it('every literal t(...) key used in the UI exists', () => {
    const missing = new Set<string>();
    for (const file of walk('app/src').filter((f) => /\.(tsx?|ts)$/.test(f) && !f.endsWith('i18n.ts'))) {
      for (const m of read(file).matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!(m[1] in de)) missing.add(`${file}: ${m[1]}`);
    }
    expect([...missing]).toEqual([]);
  });

  it('every backend error code has a translation (err.*)', () => {
    const codes = new Set<string>();
    for (const file of ['srv/process-api.ts', 'srv/construct/service.ts', 'srv/construct/lifecycle-ops.ts']) {
      for (const m of read(file).matchAll(/new ProcessError\(\d{3},[\s\S]*?,\s*'([A-Z_]+)'\s*[,)]/g)) codes.add(m[1]);
    }
    expect(codes.size).toBeGreaterThan(20);
    for (const code of codes) expect(de[`err.${code}`] && en[`err.${code}`], `err.${code}`).toBeTruthy();
    expect(de['err.NETWORK'] && de['err.ERROR']).toBeTruthy();
  });

  it('every lifecycle and switch result code the UI can show has a translation', () => {
    const lifecycle = [...read('srv/domain/lifecycle.ts').matchAll(/blocked\(input,\s*'([A-Z_]+)'/g)].map((m) => m[1]);
    const lifecycleSet = new Set([...lifecycle, 'READY', 'SIMULATED_SUCCESS', 'ALREADY_DONE', 'BUSINESS_STATE_UNKNOWN', 'MALO_NOT_FOUND', 'MALO_NOT_IN_CONSTRUCT', 'STICHTAG_MISMATCH']);
    const sw = ['VSZ_NOT_READY', 'CONSTRUCT_BLOCKED', 'CONSTRUCT_INCOMPLETE', 'NOT_PARTICIPATING', 'RESTSTROM_TARGET', 'CONFLICTING_MAMA', 'TIME_SLICE_CONFLICT', 'INVALID_STATE', 'REACTIVATED', 'WAITING_FOR_MCM', 'NO_CLEARED_MELOS', 'NOT_PLANNED', 'EXCLUDED'];
    for (const code of [...lifecycleSet, ...sw]) {
      const has = (lang: Record<string, string>) => Object.keys(lang).some((k) => k === `res.${code}` || k.startsWith(`res.${code}.`));
      expect(has(de) && has(en), `res.${code}`).toBe(true);
    }
  });

  it('every rule, step, status, state, action, actor, role and vSZ item has a translation', () => {
    const rules = Array.from({ length: 14 }, (_, i) => `V${String(i + 1).padStart(2, '0')}`);
    const need = [
      ...rules.map((r) => `rule.${r}`),
      ...rules.filter((r) => r !== 'V03').map((r) => `rule.${r}.x`), // V03 is a non-blocking notice: title only
      'rule.VSZ', 'rule.VSZ.x',
      ...['PRUEFUNG', 'VSZ', 'PREREQ', 'MEMA', 'MAMA', 'RUHEND', 'UEBERGABE'].map((s) => `step.${s}`),
      ...['NEW', 'DONE', 'READY', 'WAITING', 'DECISION', 'CORRECTION', 'EXCLUDED', 'NOT_PARTICIPATING', 'REACTIVATED'].map((s) => `status.${s}`),
      ...['ok', 'partial', 'act', 'err', 'wait', 'planned', 'todo', 'na', 'now', 'notrun'].map((s) => `state.${s}`),
      ...['SET_DORMANT', 'MAINTAIN_EINSPEISE_MEMA', 'REACTIVATE', 'REMOVE_FROM_CONSTRUCT', 'CORRECT_TRANSITION', 'REVERSE_TRANSITION', 'RESOLVE_ISSUE', 'CONFIRM_VSZ', 'VALIDATE', 'REGISTER_CONSTRUCT', 'SAP_STATE_UPDATE', 'SET_STICHTAG', 'SAP_READ', 'VSZ_SETUP'].map((s) => `act.${s}`),
      ...['PIPELINE', 'DEMO_USER', 'API_CLIENT', 'RESET', 'IMPORT', 'SYSTEM'].map((s) => `actor.${s}`),
      ...['Haushaltsverbrauch', 'Solaranlage', 'Windkraftanlage', 'Marktlokation Reststrom'].map((s) => `role.${s}`),
      ...VSZ_ITEMS.map((v) => `vsz.${v.itemCode}`),
      ...['DONE', 'CHECKED', 'PARTIAL', 'CONFIRMED', 'UNKNOWN', 'MISSING'].map((s) => `vsz.s.${s}`),
      ...[1, 2, 3, 4, 5, 6].flatMap((n) => ['what', 'auto', 'manual', 'out', 'basis'].map((p) => `stage.${n}.${p}`)),
    ];
    expect(need.filter((k) => !(k in de) || !(k in en))).toEqual([]);
  });

  it('every vSZ result key written by the backend exists in both languages', () => {
    const keys = [...read('srv/construct/vsz-setup.ts').matchAll(/'(vsz\.ev\.[A-Za-z_.]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(12);
    for (const k of keys) expect(de[k] && en[k], k).toBeTruthy();
  });

  it('translate(), resultText() and evidenceText() give language-specific text', () => {
    expect(translate('de', 'res.INVALID_OPERATION_SEQUENCE.REACTIVATE')).toContain('ruhende MaLo');
    expect(translate('en', 'res.INVALID_OPERATION_SEQUENCE.REACTIVATE')).toContain('dormant MaLo');
    const tde = (k: string, p?: Record<string, string | number>) => translate('de', k, p);
    const ten = (k: string, p?: Record<string, string | number>) => translate('en', k, p);
    expect(resultText(tde, 'INVALID_OPERATION_SEQUENCE', 'REACTIVATE')).not.toBe(resultText(ten, 'INVALID_OPERATION_SEQUENCE', 'REACTIVATE'));
    expect(resultText(tde, 'V05')).toContain('Gebäuden'); // rule codes fall back to the rule explanation
    const raw = 'i18n:vsz.ev.IMSYS.ok|{"n":4}';
    expect(evidenceText(tde, raw)).toContain('4');
    expect(evidenceText(tde, raw)).not.toBe(evidenceText(ten, raw));
    expect(evidenceText(tde, 'Geprüft im SAP am 14.10.')).toBe('Geprüft im SAP am 14.10.'); // human text stays as typed
  });
});
