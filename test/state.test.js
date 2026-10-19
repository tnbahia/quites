import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, normalizeState, addPerson, removePerson, upsertExpense, removeExpense,
  loadState, saveState, encodeShare, decodeShare, STORAGE_KEY,
} from '../web/js/state.js';
import { demoState } from '../web/js/demo.js';

test('normalizeState rejeita o que não é um objeto', () => {
  for (const bad of [null, undefined, 3, 'x', [], true]) assert.equal(normalizeState(bad), null);
});

test('normalizeState deixa o grupo de exemplo intacto', () => {
  const demo = demoState();
  assert.deepEqual(normalizeState(demo), demo);
});

test('normalizeState descarta lixo e referências partidas', () => {
  const state = normalizeState({
    name: '  Viagem  ',
    people: [
      { id: 'a', name: 'Ana' },
      { id: 'a', name: 'Duplicada' },
      { id: 'b ', name: 'Id inválido' },
      { id: 'c', name: '   ' },
      { id: 'd', name: 'Rui' },
    ],
    expenses: [
      { id: 'e1', description: 'ok', amountCents: 1000, paidBy: 'a', participants: ['a', 'd', 'fantasma'] },
      { id: 'e2', description: 'sem valor', amountCents: 0, paidBy: 'a', participants: ['a'] },
      { id: 'e3', description: 'valor fracionado', amountCents: 10.5, paidBy: 'a', participants: ['a'] },
      { id: 'e4', description: 'pagador fantasma', amountCents: 500, paidBy: 'zzz', participants: ['a'] },
      { id: 'e5', description: 'ninguém participa', amountCents: 500, paidBy: 'a', participants: ['fantasma'] },
    ],
    mode: 'esquisito',
    central: 'fantasma',
    paid: { 'd>a:500': true, '__proto__': true, 'a>d:500': 'sim', 'a>d': true, 'lixo': true },
  });
  assert.equal(state.name, 'Viagem');
  assert.deepEqual(state.people.map((p) => p.id), ['a', 'd']);
  assert.deepEqual(state.expenses.map((e) => e.id), ['e1']);
  assert.deepEqual(state.expenses[0].participants, ['a', 'd']);
  assert.equal(state.mode, 'minimal');
  assert.equal(state.central, null);
  assert.deepEqual(state.paid, { 'd>a:500': true });
  assert.equal(Object.getPrototypeOf(state.paid), Object.prototype);
});

test('addPerson recusa nomes vazios e repetidos', () => {
  let { state } = addPerson(emptyState(), '  Ana ');
  assert.equal(state.people[0].name, 'Ana');
  assert.ok(addPerson(state, '').error);
  assert.ok(addPerson(state, 'ana').error);
});

test('removePerson não deixa sair quem pagou, mas tira os restantes das despesas', () => {
  const demo = demoState();
  assert.ok(removePerson(demo, 'p1').error); // Ana pagou o alojamento
  const { state } = removePerson(demo, 'p5'); // Eva só participa
  assert.ok(state.people.every((p) => p.id !== 'p5'));
  assert.ok(state.expenses.every((e) => !e.participants.includes('p5')));
  assert.equal(state.expenses.length, demo.expenses.length); // o da gasolina continua com o Diogo
  assert.equal(demo.people.length, 5); // o original não foi alterado
});

test('removePerson limpa a central e os pagamentos marcados', () => {
  const demo = { ...demoState(), mode: 'central', central: 'p5', paid: { 'p5>p1:100': true, 'p2>p5:100': true, 'p2>p1:100': true } };
  const { state } = removePerson(demo, 'p5');
  assert.equal(state.central, null);
  assert.deepEqual(state.paid, { 'p2>p1:100': true });
});

test('upsertExpense acrescenta ou substitui; removeExpense apaga', () => {
  const demo = demoState();
  const added = upsertExpense(demo, { id: 'novo', description: 'Café', amountCents: 300, paidBy: 'p1', participants: ['p1'] });
  assert.equal(added.expenses.length, 5);
  const edited = upsertExpense(added, { ...added.expenses[4], amountCents: 350 });
  assert.equal(edited.expenses.length, 5);
  assert.equal(edited.expenses[4].amountCents, 350);
  assert.equal(removeExpense(edited, 'novo').expenses.length, 4);
});

test('loadState/saveState aguentam storage em falta ou avariado', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(loadState(storage), emptyState());
  assert.equal(saveState(storage, demoState()), true);
  assert.deepEqual(loadState(storage), demoState());

  store.set(STORAGE_KEY, '{não é json');
  assert.deepEqual(loadState(storage), emptyState());

  const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('cheio'); } };
  assert.deepEqual(loadState(broken), emptyState());
  assert.equal(saveState(broken, demoState()), false);
});

test('encodeShare e decodeShare fazem a viagem de ida e volta', async () => {
  const demo = demoState();
  const code = await encodeShare(demo);
  assert.match(code, /^z[\w-]+$/); // só carateres seguros num URL
  assert.deepEqual(await decodeShare(code), demo);
});

test('decodeShare lida com nomes acentuados e com o formato sem compressão', async () => {
  const state = { ...demoState(), name: 'Férias à beira-mar ☀️' };
  const plain = 'd' + Buffer.from(JSON.stringify(state)).toString('base64url');
  assert.deepEqual(await decodeShare(plain), state);
  assert.deepEqual(await decodeShare(await encodeShare(state)), state);
});

test('decodeShare devolve null para códigos estragados ou perigosos', async () => {
  for (const bad of ['', 'z', 'x123', 'zzzz', 'z!!!', 'd' + Buffer.from('[1,2]').toString('base64url'), 'a'.repeat(300_000), null]) {
    assert.equal(await decodeShare(bad), null);
  }
});
