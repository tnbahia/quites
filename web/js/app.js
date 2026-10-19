// Interface. Os dados de utilizadores (nomes, descrições) só entram no DOM via textContent
// (através de h()), nunca como HTML, para que um grupo importado ou um link não possam injetar código.

import {
  computeBalances, minimalTransfers, centralTransfers, pairKey, totalCents, formatMoney, parseMoney,
} from './settle.js';
import * as S from './state.js';
import { demoState } from './demo.js';

const $ = (id) => document.getElementById(id);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => { throw new Error('sem armazenamento'); } };
  }
})();

let state = S.loadState(storage);
let storageWarned = false;
const draft = { participants: new Set(), payer: '', editingId: null };

// ---- Mensagens ----

let msgTimer;
function say(text, kind = 'info') {
  const el = $('msg');
  el.textContent = text;
  el.className = `msg ${kind}`;
  el.hidden = false;
  clearTimeout(msgTimer);
  if (kind === 'info') msgTimer = setTimeout(() => { el.hidden = true; }, 8000);
}

// ---- Estado ----

function persist() {
  if (!S.saveState(storage, state) && !storageWarned) {
    storageWarned = true;
    say('Não foi possível guardar neste browser (modo privado?). Usa "Exportar" para não perderes os dados.', 'warn');
  }
}

function commit(next) {
  state = next;
  persist();
  render();
}

function adopt(next) {
  state = next;
  persist();
  resetDraft();
  render();
}

function resetDraft(keepPayer = false) {
  draft.participants = new Set(state.people.map((p) => p.id));
  if (!keepPayer || !state.people.some((p) => p.id === draft.payer)) draft.payer = state.people[0]?.id ?? '';
  draft.editingId = null;
  $('exp-desc').value = '';
  $('exp-amount').value = '';
}

const nameOf = (id) => state.people.find((p) => p.id === id)?.name ?? '?';

// ---- Desenho ----

function render() {
  renderGroup();
  renderPeople();
  renderExpenseForm();
  renderExpenses();
  renderSettle();
}

function renderGroup() {
  const input = $('group-name');
  if (document.activeElement !== input) input.value = state.name;
}

function renderPeople() {
  const list = $('people-list');
  list.replaceChildren();
  if (state.people.length === 0) {
    list.append(h('li', { class: 'hint' }, 'Ainda ninguém. Adiciona quem faz parte do grupo.'));
    return;
  }
  for (const p of state.people) {
    list.append(h('li', { class: 'chip' },
      h('span', {}, p.name),
      h('button', { type: 'button', class: 'icon', 'aria-label': `Remover ${p.name}`, title: 'Remover', onclick: () => onRemovePerson(p) }, '×'),
    ));
  }
}

function renderExpenseForm() {
  const people = state.people;
  if (draft.editingId && !state.expenses.some((e) => e.id === draft.editingId)) resetDraft(true);
  for (const id of [...draft.participants]) if (!people.some((p) => p.id === id)) draft.participants.delete(id);
  if (!people.some((p) => p.id === draft.payer)) draft.payer = people[0]?.id ?? '';

  $('expense-form').hidden = people.length === 0;
  $('expenses-hint').hidden = people.length > 0;

  const payer = $('exp-payer');
  payer.replaceChildren(...people.map((p) => h('option', { value: p.id, selected: p.id === draft.payer }, p.name)));

  $('exp-participants').replaceChildren(...people.map((p) =>
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox',
        checked: draft.participants.has(p.id),
        onchange: (ev) => { ev.target.checked ? draft.participants.add(p.id) : draft.participants.delete(p.id); },
      }),
      h('span', {}, p.name),
    )));

  const editing = draft.editingId !== null;
  $('btn-save-expense').textContent = editing ? 'Guardar alterações' : 'Adicionar despesa';
  $('btn-cancel-edit').hidden = !editing;
}

function renderExpenses() {
  const list = $('expenses-list');
  list.replaceChildren();
  if (state.expenses.length === 0) return;
  const everyone = state.people.length;
  for (const e of state.expenses) {
    const who = e.participants.length === everyone ? 'todos' : `${e.participants.length} de ${everyone}`;
    list.append(h('li', { class: 'item' },
      h('div', { class: 'grow' },
        h('strong', {}, e.description),
        h('div', { class: 'sub' }, `Pago por ${nameOf(e.paidBy)} · divide por ${who}`),
      ),
      h('span', { class: 'amount' }, formatMoney(e.amountCents)),
      h('button', { type: 'button', class: 'small', onclick: () => startEdit(e) }, 'Editar'),
      h('button', { type: 'button', class: 'small danger', onclick: () => onRemoveExpense(e) }, 'Remover'),
    ));
  }
  list.append(h('li', { class: 'item total' },
    h('div', { class: 'grow' }, h('strong', {}, 'Total')),
    h('span', { class: 'amount' }, formatMoney(totalCents(state.expenses))),
  ));
}

function renderSettle() {
  const box = $('settle');
  box.replaceChildren();
  if (state.people.length < 2 || state.expenses.length === 0) {
    box.append(h('p', { class: 'hint' }, 'Com pelo menos duas pessoas e uma despesa, o acerto aparece aqui.'));
    return;
  }

  const balances = computeBalances(state.people, state.expenses);
  const centralId = state.people.some((p) => p.id === state.central) ? state.central : state.people[0].id;
  const central = state.mode === 'central';
  const transfers = central ? centralTransfers(balances, centralId) : minimalTransfers(balances);

  box.append(
    h('fieldset', { class: 'modes' },
      h('legend', {}, 'Como queres acertar?'),
      modeOption('minimal', 'Menos transferências', 'Cada pessoa paga diretamente a quem lhe deve.'),
      modeOption('central', 'Tudo por uma só pessoa', 'Quem deve paga à pessoa central, que depois paga a quem tem a receber.'),
      central && h('label', { class: 'field inline' },
        h('span', {}, 'Pessoa central'),
        h('select', { onchange: (ev) => commit({ ...state, central: ev.target.value }) },
          state.people.map((p) => h('option', { value: p.id, selected: p.id === centralId }, p.name))),
      ),
    ),
  );

  box.append(transferList(transfers), balanceTable(balances));
}

function modeOption(value, title, text) {
  return h('label', { class: 'mode' },
    h('input', {
      type: 'radio', name: 'mode', value, checked: state.mode === value,
      onchange: () => commit({ ...state, mode: value, central: state.central ?? state.people[0]?.id ?? null }),
    }),
    h('span', {}, h('strong', {}, title), h('small', {}, text)),
  );
}

function transferList(transfers) {
  const wrap = h('div', { class: 'transfers' });
  if (transfers.length === 0) {
    wrap.append(h('p', { class: 'done' }, 'Já está tudo quite. Ninguém deve nada a ninguém.'));
    return wrap;
  }

  const keys = transfers.map(pairKey);
  const progress = h('progress', { max: transfers.length, value: 0 });
  const status = h('span', { class: 'status' });
  const rows = transfers.map((t, i) => {
    const row = h('li', {},
      h('label', { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: state.paid[keys[i]] === true,
          onchange: (ev) => {
            const paid = { ...state.paid };
            if (ev.target.checked) paid[keys[i]] = true; else delete paid[keys[i]];
            state = { ...state, paid };
            persist();
            refresh();
          },
        }),
        h('span', {}, h('strong', {}, nameOf(t.from)), ' paga ', h('strong', {}, formatMoney(t.amountCents)), ' a ', h('strong', {}, nameOf(t.to))),
      ),
    );
    return row;
  });

  function refresh() {
    let done = 0;
    rows.forEach((row, i) => {
      const paid = state.paid[keys[i]] === true;
      row.classList.toggle('paid', paid);
      if (paid) done++;
    });
    progress.value = done;
    status.textContent = done === transfers.length
      ? 'Estão todos quites! 🎉'
      : `${done} de ${transfers.length} transferências feitas`;
  }

  wrap.append(
    h('div', { class: 'row between' },
      h('h3', {}, transfers.length === 1 ? 'Uma transferência' : `${transfers.length} transferências`),
      h('button', { type: 'button', class: 'small', onclick: () => copyInstructions(transfers) }, 'Copiar instruções'),
    ),
    h('ul', { class: 'list checklist' }, rows),
    h('div', { class: 'row progressbar' }, progress, status),
  );
  refresh();
  return wrap;
}

function balanceTable(balances) {
  const cell = (cents) => h('td', { class: cents > 0 ? 'pos' : cents < 0 ? 'neg' : '' }, formatMoney(cents));
  return h('div', { class: 'balances' },
    h('h3', {}, 'Saldo de cada pessoa'),
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {}, ['Pessoa', 'Pagou', 'A sua parte', 'Saldo', ''].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, balances.map((b) => h('tr', {},
          h('th', { scope: 'row' }, b.name),
          h('td', {}, formatMoney(b.paidCents)),
          h('td', {}, formatMoney(b.shareCents)),
          cell(b.balanceCents),
          h('td', { class: 'sub' }, b.balanceCents > 0 ? 'a receber' : b.balanceCents < 0 ? 'a pagar' : 'quite'),
        ))),
      ),
    ),
  );
}

// ---- Ações ----

function onRemovePerson(person) {
  const involved = state.expenses.some((e) => e.participants.includes(person.id));
  if (involved && !confirm(`${person.name} vai ser retirado(a) das despesas em que participa. Continuar?`)) return;
  const result = S.removePerson(state, person.id);
  if (result.error) return say(result.error, 'error');
  draft.participants.delete(person.id);
  commit(result.state);
}

function onRemoveExpense(expense) {
  if (!confirm(`Remover "${expense.description}"?`)) return;
  commit(S.removeExpense(state, expense.id));
}

function startEdit(expense) {
  draft.editingId = expense.id;
  draft.payer = expense.paidBy;
  draft.participants = new Set(expense.participants);
  $('exp-desc').value = expense.description;
  $('exp-amount').value = (expense.amountCents / 100).toFixed(2).replace('.', ',');
  renderExpenseForm();
  $('exp-desc').focus();
  $('expense-form').scrollIntoView({ block: 'center' });
}

function onSubmitExpense(ev) {
  ev.preventDefault();
  const amountCents = parseMoney($('exp-amount').value);
  if (amountCents === null || amountCents === 0) return say('Valor inválido. Escreve algo como 12,50.', 'error');
  if (amountCents > S.MAX_CENTS) return say('Esse valor é demasiado grande.', 'error');
  const participants = state.people.map((p) => p.id).filter((id) => draft.participants.has(id));
  if (participants.length === 0) return say('Escolhe pelo menos uma pessoa que participa.', 'error');
  const paidBy = $('exp-payer').value;
  if (!state.people.some((p) => p.id === paidBy)) return say('Escolhe quem pagou.', 'error');

  const expense = {
    id: draft.editingId ?? S.uid(),
    description: $('exp-desc').value.trim().slice(0, 100) || 'Despesa',
    amountCents,
    paidBy,
    participants,
  };
  draft.payer = paidBy;
  state = S.upsertExpense(state, expense);
  persist();
  resetDraft(true);
  render();
  $('exp-desc').focus();
}

function onAddPerson(ev) {
  ev.preventDefault();
  const input = $('person-name');
  const result = S.addPerson(state, input.value);
  if (result.error) return say(result.error, 'error');
  draft.participants.add(result.person.id);
  if (!draft.payer) draft.payer = result.person.id;
  input.value = '';
  commit(result.state);
  input.focus();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function copyInstructions(transfers) {
  const title = state.name ? `${state.name}\n` : '';
  const lines = transfers.map((t) => `${nameOf(t.from)} paga ${formatMoney(t.amountCents)} a ${nameOf(t.to)}`);
  const text = title + lines.join('\n');
  if (await copyText(text)) say('Instruções copiadas. Já podes colar no grupo.');
  else window.prompt('Copia as instruções:', text);
}

async function onShare() {
  if (S.isEmpty(state)) return say('Ainda não há nada para partilhar.', 'warn');
  const url = `${location.origin}${location.pathname}#${await S.encodeShare(state)}`;
  const note = 'Quem abrir o link recebe uma cópia: as alterações não ficam sincronizadas.';
  if (url.length > 8000) say(`O link ficou muito grande e pode não funcionar em todas as apps. Considera usar "Exportar". ${note}`, 'warn');
  if (await copyText(url)) {
    if (url.length <= 8000) say(`Link copiado. ${note}`);
  } else {
    window.prompt('Copia o link:', url);
  }
}

function slug(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function onExport() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: `quites-${slug(state.name) || 'grupo'}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function onImportFile(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  if (file.size > 2_000_000) return say('Esse ficheiro é demasiado grande para ser um grupo do Quites.', 'error');
  let incoming = null;
  try {
    incoming = S.normalizeState(JSON.parse(await file.text()));
  } catch { /* fica null */ }
  if (!incoming) return say('Esse ficheiro não parece ser um grupo do Quites.', 'error');
  if (!S.isEmpty(state) && !confirm('Substituir os dados deste browser pelos do ficheiro?')) return;
  adopt(incoming);
  say('Grupo importado.');
}

function onDemo() {
  if (!S.isEmpty(state) && !confirm('Substituir os teus dados pelo grupo de exemplo?')) return;
  adopt(demoState());
}

function onClear() {
  if (S.isEmpty(state) && !state.name) return;
  if (!confirm('Apagar todas as pessoas e despesas? Não dá para desfazer. Exporta primeiro se quiseres guardar.')) return;
  adopt(S.emptyState());
}

async function loadFromHash() {
  const code = location.hash.slice(1);
  if (!/^[zd][\w-]+$/.test(code)) return;
  history.replaceState(null, '', location.pathname + location.search);
  const incoming = await S.decodeShare(code);
  if (!incoming) return say('O link não é válido ou está incompleto.', 'error');
  const summary = `"${incoming.name || 'sem nome'}" (${incoming.people.length} pessoas, ${incoming.expenses.length} despesas)`;
  if (!S.isEmpty(state) && !confirm(`Este link traz o grupo ${summary}. Substituir os dados que tens neste browser?`)) return;
  adopt(incoming);
  say(`Grupo ${summary} carregado a partir do link.`);
}

// ---- Arranque ----

$('person-form').addEventListener('submit', onAddPerson);
$('expense-form').addEventListener('submit', onSubmitExpense);
$('exp-payer').addEventListener('change', (ev) => { draft.payer = ev.target.value; });
$('btn-all').addEventListener('click', () => { draft.participants = new Set(state.people.map((p) => p.id)); renderExpenseForm(); });
$('btn-none').addEventListener('click', () => { draft.participants = new Set(); renderExpenseForm(); });
$('btn-cancel-edit').addEventListener('click', () => { resetDraft(true); renderExpenseForm(); });
$('group-name').addEventListener('input', (ev) => { state = { ...state, name: ev.target.value.slice(0, 80) }; persist(); });
$('btn-share').addEventListener('click', onShare);
$('btn-export').addEventListener('click', onExport);
$('btn-import').addEventListener('click', () => $('file-import').click());
$('file-import').addEventListener('change', onImportFile);
$('btn-demo').addEventListener('click', onDemo);
$('btn-clear').addEventListener('click', onClear);

// Colar um link do Quites num separador onde a app já está aberta só muda o `#`, sem recarregar.
window.addEventListener('hashchange', loadFromHash);

resetDraft();
render();
loadFromHash();
