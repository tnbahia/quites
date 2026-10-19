import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary } from '../web/js/summary.js';
import { settlementPlan, pairKey } from '../web/js/settle.js';
import { demoState } from '../web/js/demo.js';

const NOW = new Date('2026-10-19T12:00:00Z');

test('buildSummary descreve total, despesas e transferências do grupo de exemplo', () => {
  const s = buildSummary(demoState(), NOW);
  assert.equal(s.title, 'Fim de semana na serra');
  assert.equal(s.subtitle, '19 de outubro de 2026');
  assert.match(s.totalText, /^436,70\s€$/u);
  assert.equal(s.countsText, '4 despesas · 5 pessoas');
  assert.equal(s.expenses.length, 4);
  assert.equal(s.modeNote, null);

  const [alojamento, jantar, supermercado, gasolina] = s.expenses;
  assert.equal(alojamento.description, 'Alojamento');
  assert.equal(alojamento.detail, 'Pago por Ana · divide por todos (5)');
  assert.match(alojamento.shareText, /^48,00\s€ a cada um$/u);
  assert.match(jantar.shareText, /^17,10\s€ a cada um$/u);
  assert.equal(supermercado.detail, 'Pago por Carla · divide por 4 pessoas: Ana, Bruno, Carla, Diogo');
  assert.match(supermercado.shareText, /^15,80\s€ a cada um$/u);
  assert.equal(gasolina.detail, 'Pago por Diogo · divide por 2 pessoas: Diogo, Eva');

  assert.equal(s.transferGroups.length, 1);
  assert.equal(s.transferGroups[0].title, null);
  assert.deepEqual(s.transferGroups[0].items.map((t) => t.text.replace(/\s/gu, ' ')), [
    'Eva paga 89,10 € a Ana',
    'Diogo paga 56,90 € a Ana',
    'Carla paga 13,10 € a Ana',
    'Carla paga 4,60 € a Bruno',
  ]);
  assert.ok(s.transferGroups[0].items.every((t) => t.paid === false));
});

test('buildSummary marca as transferências já pagas e usa "≈" quando não divide exato', () => {
  const state = demoState();
  const first = settlementPlan(state).transfers[0];
  state.paid[pairKey(first)] = true;
  state.expenses.push({ id: 'x', description: 'Café', amountCents: 1000, paidBy: 'p1', participants: ['p1', 'p2', 'p5'] });
  const paidCount = (summary) => summary.transferGroups.flatMap((g) => g.items).filter((t) => t.paid).length;
  assert.equal(paidCount(buildSummary(demoState(), NOW)), 0);
  const s = buildSummary(state, NOW);
  assert.equal(paidCount(s), 0); // a dívida da Eva mudou, a marca já não se aplica
  assert.match(s.expenses.at(-1).shareText, /^≈ 3,33\s€ a cada um$/u);
  assert.equal(s.expenses.at(-1).detail, 'Pago por Ana · divide por 3 pessoas: Ana, Bruno, Eva');

  // sem alterar nada, a marca mantém-se
  const unchanged = demoState();
  unchanged.paid[pairKey(first)] = true;
  assert.equal(paidCount(buildSummary(unchanged, NOW)), 1);
});

test('buildSummary no modo central explica quem centraliza e conta uma só pessoa', () => {
  const state = { ...demoState(), mode: 'central', central: 'p2' };
  const s = buildSummary(state, NOW);
  assert.match(s.modeNote, /^Tudo passa por Bruno/);
  assert.deepEqual(s.transferGroups.map((g) => g.title), ['Pagam a Bruno', 'Recebem de Bruno']);
  const [pay, receive] = s.transferGroups;
  assert.ok(pay.items.every((t) => t.text.endsWith('a Bruno')));
  assert.ok(receive.items.every((t) => t.text.startsWith('Bruno paga')));
  assert.match(pay.totalText, /^[\d\s,]+€$/u);
  assert.equal(pay.items.length + receive.items.length, 4);
  const single = buildSummary({ ...state, expenses: [{ id: 'e', description: 'Um', amountCents: 100, paidBy: 'p1', participants: ['p1'] }] }, NOW);
  assert.equal(single.countsText, '1 despesa · 5 pessoas');
});

test('buildSummary sem nome de grupo usa um título por omissão', () => {
  assert.equal(buildSummary({ ...demoState(), name: '' }, NOW).title, 'Acerto de contas');
});
