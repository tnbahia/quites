import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NORMAL, LABREGO, t, setLabrego, isLabrego } from '../web/js/texts.js';
import { buildSummary } from '../web/js/summary.js';
import { demoState } from '../web/js/demo.js';
import { addPerson, emptyState } from '../web/js/state.js';

afterEach(() => setLabrego(false));

test('o modo labrego tem exatamente as mesmas chaves e formas que o normal', () => {
  assert.deepEqual(Object.keys(LABREGO).sort(), Object.keys(NORMAL).sort());
  for (const key of Object.keys(NORMAL)) {
    const a = NORMAL[key];
    const b = LABREGO[key];
    assert.equal(typeof b, typeof a, `${key}: tipo diferente`);
    if (typeof a === 'function') assert.equal(b.length, a.length, `${key}: número de argumentos diferente`);
    if (Array.isArray(a)) assert.equal(b.length, a.length, `${key}: tamanho da lista diferente`);
  }
});

test('as funções de texto devolvem sempre texto, nos dois modos', () => {
  const samples = { removeName: ['Ana'], splitSome: [2, 5], expenseSub: ['Ana', 'todos'], transferMany: [3], progress: [1, 3],
    groupInstructionHeader: ['Pagam a Ana', '10 €'], confirmRemovePerson: ['Ana'], confirmRemoveExpense: ['Jantar'],
    shareTooBig: ['nota'], linkCopied: ['nota'], linkSummary: ['Grupo', 2, 3], confirmReplaceLink: ['x'], linkLoaded: ['x'],
    errDuplicate: ['Ana'], groupPay: ['Ana'], groupReceive: ['Ana'], shareEach: ['1 €'], shareEachApprox: ['1 €'],
    whoAllCount: [5], whoList: [2, 'Ana, Bruno'], countPeople: [1], countExpenses: [4], modeNote: ['Ana'],
    imgGroupTotal: ['1 €'], imgMadeWith: ['hoje'] };
  for (const on of [false, true]) {
    setLabrego(on);
    for (const [key, value] of Object.entries(NORMAL)) {
      if (typeof value !== 'function') continue;
      assert.ok(key in samples, `falta um exemplo para ${key}`);
      const out = t(key, ...samples[key]);
      assert.equal(typeof out, 'string');
      assert.ok(!out.includes('undefined'), `${key}: ${out}`);
    }
  }
});

test('o modo labrego muda mesmo os textos (e nunca fica igual em tudo)', () => {
  const same = Object.keys(NORMAL).filter((key) => typeof NORMAL[key] === 'string' && NORMAL[key] === LABREGO[key]);
  const strings = Object.keys(NORMAL).filter((key) => typeof NORMAL[key] === 'string');
  assert.ok(same.length < strings.length / 2, `demasiados textos iguais: ${same.join(', ')}`);
});

test('o texto fixo do index.html coincide com o modo normal', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  let found = 0;
  for (const [, key, text] of html.matchAll(/data-t="(\w+)"[^>]*>([^<]*)</g)) {
    found++;
    assert.equal(text.trim(), NORMAL[key], `index.html: data-t="${key}"`);
  }
  assert.ok(found > 20, 'devia haver mais de 20 textos marcados');
  for (const [, text, key] of html.matchAll(/placeholder="([^"]*)"[^>]*data-t-ph="(\w+)"/g)) {
    assert.equal(text, NORMAL[key], `index.html: data-t-ph="${key}"`);
  }
  for (const [, text, key] of html.matchAll(/aria-label="([^"]*)"[^>]*data-t-label="(\w+)"/g)) {
    assert.equal(text, NORMAL[key], `index.html: data-t-label="${key}"`);
  }
  for (const [, key] of html.matchAll(/data-t(?:-ph|-label)?="(\w+)"/g)) assert.ok(key in NORMAL && key in LABREGO, `chave desconhecida: ${key}`);
});

test('resumo, exemplo e erros seguem o modo ativo', () => {
  assert.equal(isLabrego(), false);
  setLabrego(true);
  assert.equal(isLabrego(), true);
  const demo = demoState();
  assert.equal(demo.name, LABREGO.demoName);
  assert.deepEqual(demo.people.map((p) => p.name), LABREGO.demoPeople);
  const s = buildSummary(demo, new Date('2026-10-19T12:00:00Z'));
  assert.ok(s.transferGroups[0].items[0].text.includes(LABREGO.pays));
  assert.equal(s.countsText, '4 gastos · 5 gajos');
  assert.equal(addPerson(emptyState(), '').error, LABREGO.errNeedName);
  setLabrego(false);
  assert.equal(addPerson(emptyState(), '').error, NORMAL.errNeedName);
});
