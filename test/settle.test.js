import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitEvenly, computeBalances, minimalTransfers, centralTransfers, groupTransfers, parseMoney, formatMoney, totalCents,
} from '../web/js/settle.js';

// Reproduz um caso real de 15 pessoas e 6 despesas (319,69 €), com nomes fictícios.
// A folha de cálculo original dava 24,04 € a quase toda a gente e 14 transferências.
const NAMES = ['Ana', 'Bruno', 'Carla', 'Diogo', 'Eva', 'Filipe', 'Gaia', 'Hugo', 'Inês', 'João', 'Kika', 'Luís', 'Marta', 'Nuno', 'Olga'];
const people = NAMES.map((name, i) => ({ id: `p${i}`, name }));
const id = (name) => people.find((p) => p.name === name).id;
const everyone = people.map((p) => p.id);
const without = (...names) => everyone.filter((x) => !names.map(id).includes(x));
const expenses = [
  { id: 'e1', description: 'Prenda', amountCents: 10000, paidBy: id('Diogo'), participants: without('Luís') },
  { id: 'e2', description: 'Compras', amountCents: 9000, paidBy: id('Nuno'), participants: without('Marta', 'Olga') },
  { id: 'e3', description: 'Álbum', amountCents: 4869, paidBy: id('Nuno'), participants: without('Marta', 'Olga') },
  { id: 'e4', description: 'Bolo', amountCents: 2600, paidBy: id('João'), participants: without('Marta', 'Olga') },
  { id: 'e5', description: 'Flores', amountCents: 3500, paidBy: id('João'), participants: without('Marta', 'Olga') },
  { id: 'e6', description: 'Balões', amountCents: 2000, paidBy: id('Inês'), participants: without('Marta', 'Olga') },
];

test('splitEvenly reparte tudo e dá os cêntimos que sobram aos primeiros', () => {
  const shares = splitEvenly(1000, ['a', 'b', 'c']);
  assert.deepEqual([...shares], [['a', 334], ['b', 333], ['c', 333]]);
  assert.equal(splitEvenly(10000, Array.from({ length: 14 }, (_, i) => i)).size, 14);
  assert.equal(splitEvenly(5, []).size, 0);
});

test('a soma dos saldos é sempre zero', () => {
  const balances = computeBalances(people, expenses);
  assert.equal(balances.reduce((s, b) => s + b.balanceCents, 0), 0);
  assert.equal(balances.reduce((s, b) => s + b.paidCents, 0), totalCents(expenses));
  assert.equal(balances.reduce((s, b) => s + b.shareCents, 0), totalCents(expenses));
});

test('os saldos batem com a folha de cálculo original', () => {
  const byName = Object.fromEntries(computeBalances(people, expenses).map((b) => [b.name, b]));
  // A folha trabalhava com frações de cêntimo; aqui cada despesa arredonda, por isso
  // aceitamos até 1 cêntimo de diferença por despesa.
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= expenses.length, `${actual} vs ${expected}`);
  near(byName.Eva.balanceCents, -2404);
  near(byName.Nuno.balanceCents, 11465);
  near(byName.Diogo.balanceCents, 7596);
  near(byName.João.balanceCents, 3696);
  near(byName.Inês.balanceCents, -404);
  near(byName.Marta.balanceCents, -714);
  near(byName.Olga.balanceCents, -714);
  near(byName.Luís.balanceCents, -1690);
});

test('minimalTransfers liquida todos os saldos com no máximo n-1 transferências', () => {
  const balances = computeBalances(people, expenses);
  const transfers = minimalTransfers(balances);
  assert.ok(transfers.length <= 14);
  const net = new Map(balances.map((b) => [b.id, b.balanceCents]));
  for (const t of transfers) {
    assert.ok(t.amountCents > 0);
    assert.notEqual(t.from, t.to);
    net.set(t.from, net.get(t.from) + t.amountCents);
    net.set(t.to, net.get(t.to) - t.amountCents);
  }
  assert.ok([...net.values()].every((v) => v === 0));
});

test('minimalTransfers junta valores iguais numa só transferência', () => {
  const balances = [
    { id: 'a', balanceCents: -500 },
    { id: 'b', balanceCents: -300 },
    { id: 'c', balanceCents: 300 },
    { id: 'd', balanceCents: 500 },
  ];
  assert.deepEqual(minimalTransfers(balances), [
    { from: 'a', to: 'd', amountCents: 500 },
    { from: 'b', to: 'c', amountCents: 300 },
  ]);
});

test('minimalTransfers não gera nada quando já estão todos quites', () => {
  assert.deepEqual(minimalTransfers([{ id: 'a', balanceCents: 0 }, { id: 'b', balanceCents: 0 }]), []);
});

test('centralTransfers: os devedores pagam à central e a central paga aos credores', () => {
  const balances = computeBalances(people, expenses);
  const central = id('Ana');
  const transfers = centralTransfers(balances, central);
  assert.ok(transfers.every((t) => t.from === central || t.to === central));
  const toCentral = transfers.filter((t) => t.to === central).reduce((s, t) => s + t.amountCents, 0);
  const fromCentral = transfers.filter((t) => t.from === central).reduce((s, t) => s + t.amountCents, 0);
  const anaBalance = balances.find((b) => b.id === central).balanceCents;
  assert.equal(fromCentral - toCentral, -anaBalance);
  assert.equal(centralTransfers(balances, 'desconhecido').length, 0);
});

test('despesas inválidas são ignoradas', () => {
  const ps = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const balances = computeBalances(ps, [
    { id: 'x', description: 'sem participantes', amountCents: 1000, paidBy: 'a', participants: [] },
    { id: 'y', description: 'pagador desconhecido', amountCents: 1000, paidBy: 'z', participants: ['a', 'b'] },
    { id: 'w', description: 'boa', amountCents: 1000, paidBy: 'a', participants: ['a', 'b'] },
  ]);
  assert.deepEqual(balances.map((b) => b.balanceCents), [500, -500]);
});

test('parseMoney aceita vírgula, ponto, espaços e €', () => {
  assert.equal(parseMoney('12,50'), 1250);
  assert.equal(parseMoney('12.5'), 1250);
  assert.equal(parseMoney('7'), 700);
  assert.equal(parseMoney('1 234,56 €'), 123456);
  assert.equal(parseMoney('0,05'), 5);
  for (const bad of ['', 'abc', '-3', '1,234', '1,2,3', '12.', '1e3']) assert.equal(parseMoney(bad), null, bad);
});

test('formatMoney usa o formato português', () => {
  assert.match(formatMoney(123456), /^1\s?234,56\s€$/u);
});

test('groupTransfers separa quem paga à central de quem recebe dela', () => {
  const balances = computeBalances(people, expenses);
  const central = id('Ana');
  const transfers = centralTransfers(balances, central);
  const [pay, receive] = groupTransfers(transfers, central);
  assert.equal(pay.kind, 'pay');
  assert.ok(pay.transfers.every((t) => t.to === central));
  assert.equal(receive.kind, 'receive');
  assert.ok(receive.transfers.every((t) => t.from === central));
  assert.equal(pay.transfers.length + receive.transfers.length, transfers.length);
  assert.equal(pay.totalCents, pay.transfers.reduce((s, t) => s + t.amountCents, 0));
});

test('groupTransfers omite grupos vazios e junta tudo quando não há central', () => {
  const t = [{ from: 'a', to: 'c', amountCents: 500 }];
  assert.deepEqual(groupTransfers(t, 'c').map((g) => g.kind), ['pay']);
  assert.deepEqual(groupTransfers(t).map((g) => g.kind), ['all']);
  assert.deepEqual(groupTransfers([], 'c'), []);
  assert.deepEqual(groupTransfers([]), []);
});
