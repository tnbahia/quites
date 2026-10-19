// Interface. Os dados de utilizadores (nomes, descrições) só entram no DOM via textContent
// (através de h()), nunca como HTML, para que um grupo importado ou um link não possam injetar código.

import { settlementPlan, groupTransfers, pairKey, totalCents, formatMoney, parseMoney } from './settle.js';
import * as S from './state.js';
import { demoState } from './demo.js';
import { buildSummary, groupTitle, transferText } from './summary.js';
import { renderSummaryCanvas, canvasToPng } from './image.js';
import { t, setLabrego, isLabrego, applyStaticTexts } from './texts.js';

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
let lastTotal = null;
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
    say(t('storageWarn'), 'warn');
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

// Animações só para o que é novo: guardamos os ids já desenhados e, na 1.ª vez, não animamos nada.
const seen = { people: null, expenses: null };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function freshTracker(kind, ids) {
  const before = seen[kind];
  seen[kind] = new Set(ids);
  let n = 0;
  return (id) => {
    if (before === null || before.has(id)) return null;
    return n++;
  };
}

function stagger(el, n) {
  if (n === null) return el;
  el.classList.add('fresh');
  el.style.setProperty('--i', String(Math.min(n, 12)));
  return el;
}

function celebrate(anchor) {
  if (reduceMotion.matches) return;
  const colors = ['#f5a70b', '#0f766e', '#be185d', '#1d4ed8', '#4d7c0f', '#c2410c'];
  const burst = h('span', { class: 'burst', 'aria-hidden': 'true' });
  const pieces = 22;
  for (let i = 0; i < pieces; i++) {
    const angle = (i / pieces) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 60 + Math.random() * 90;
    const piece = h('i');
    piece.style.setProperty('--x', `${Math.cos(angle) * dist}px`);
    piece.style.setProperty('--y', `${Math.sin(angle) * dist - 30}px`);
    piece.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    piece.style.setProperty('--c', colors[i % colors.length]);
    burst.append(piece);
  }
  anchor.append(burst);
  setTimeout(() => burst.remove(), 1200);
}

// Bolinha com a inicial, de uma de 8 cores fixas escolhidas pelo id (só decoração: o nome vem sempre ao lado).
function avatar(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return h('span', { class: `avatar av-${hash % 8}`, 'aria-hidden': 'true' }, [...nameOf(id).trim()][0]?.toUpperCase() ?? '?');
}

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
    freshTracker('people', []);
    list.append(h('li', { class: 'hint empty' }, t('noPeopleYet')));
    return;
  }
  const fresh = freshTracker('people', state.people.map((p) => p.id));
  for (const p of state.people) {
    list.append(stagger(h('li', { class: 'chip' },
      avatar(p.id),
      h('span', {}, p.name),
      h('button', { type: 'button', class: 'icon', 'aria-label': t('removeName', p.name), title: t('remove'), onclick: () => onRemovePerson(p) }, '×'),
    ), fresh(p.id)));
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
      avatar(p.id),
      h('span', {}, p.name),
    )));

  const editing = draft.editingId !== null;
  $('btn-save-expense').textContent = editing ? t('saveChanges') : t('addExpense');
  $('btn-cancel-edit').hidden = !editing;
}

function renderExpenses() {
  const list = $('expenses-list');
  list.replaceChildren();
  const fresh = freshTracker('expenses', state.expenses.map((e) => e.id));
  const total = totalCents(state.expenses);
  const totalChanged = lastTotal !== null && total !== lastTotal;
  lastTotal = total;
  if (state.expenses.length === 0) return;
  const everyone = state.people.length;
  for (const e of state.expenses) {
    const who = e.participants.length === everyone ? t('splitAll') : t('splitSome', e.participants.length, everyone);
    list.append(stagger(h('li', { class: 'item' },
      avatar(e.paidBy),
      h('div', { class: 'grow' },
        h('strong', {}, e.description),
        h('div', { class: 'sub' }, t('expenseSub', nameOf(e.paidBy), who)),
      ),
      h('span', { class: 'amount' }, formatMoney(e.amountCents)),
      h('button', { type: 'button', class: 'small', onclick: () => startEdit(e) }, t('edit')),
      h('button', { type: 'button', class: 'small danger', onclick: () => onRemoveExpense(e) }, t('remove')),
    ), fresh(e.id)));
  }
  list.append(h('li', { class: 'item total' },
    h('div', { class: 'grow' }, h('strong', {}, t('total'))),
    h('span', { class: totalChanged ? 'amount bump' : 'amount' }, formatMoney(total)),
  ));
}

function renderSettle() {
  const box = $('settle');
  box.replaceChildren();
  if (state.people.length < 2 || state.expenses.length === 0) {
    box.append(h('p', { class: 'hint empty' }, t('settleNeeds')));
    return;
  }

  const { balances, transfers, central, centralId } = settlementPlan(state);
  const groups = groupTransfers(transfers, central ? centralId : null);

  box.append(
    h('fieldset', { class: 'modes' },
      h('legend', {}, t('modesLegend')),
      modeOption('minimal', t('modeMinimal'), t('modeMinimalText')),
      modeOption('central', t('modeCentral'), t('modeCentralText')),
      central && h('label', { class: 'field inline' },
        h('span', {}, t('centralLabel')),
        h('select', { onchange: (ev) => commit({ ...state, central: ev.target.value }) },
          state.people.map((p) => h('option', { value: p.id, selected: p.id === centralId }, p.name))),
      ),
    ),
  );

  box.append(
    h('div', { class: 'row actions' },
      transfers.length > 0 && h('button', { type: 'button', class: 'with-sub', onclick: () => copyInstructions(groups) },
        h('span', {}, t('copyInstructions')),
        h('small', {}, t('copyInstructionsSub')),
      ),
      h('button', { type: 'button', class: 'primary with-sub', onclick: onDownloadImage },
        h('span', {}, t('downloadImage')),
        h('small', {}, t('downloadImageSub')),
      ),
    ),
    transferList(groups, nameOf(centralId)),
    balanceTable(balances),
  );
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

function transferList(groups, centralName) {
  const wrap = h('div', { class: 'transfers' });
  const transfers = groups.flatMap((g) => g.transfers);
  if (transfers.length === 0) {
    wrap.append(h('p', { class: 'done' }, t('allSquare')));
    return wrap;
  }

  const keys = new Map(transfers.map((tr) => [tr, pairKey(tr)]));
  const rows = new Map();
  const progress = h('progress', { max: transfers.length, value: 0 });
  const status = h('span', { class: 'status' });
  const progressRow = h('div', { class: 'row progressbar' });

  const rowFor = (tr) => {
    const key = keys.get(tr);
    const row = h('li', {},
      h('label', { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: state.paid[key] === true,
          onchange: (ev) => {
            const paid = { ...state.paid };
            if (ev.target.checked) paid[key] = true; else delete paid[key];
            state = { ...state, paid };
            persist();
            refresh();
            if (ev.target.checked && progress.value === transfers.length) celebrate(progressRow);
          },
        }),
        h('span', { class: 'transfer' },
          h('span', { class: 'who' }, avatar(tr.from), h('strong', {}, nameOf(tr.from))), ` ${t('pays')} `,
          h('strong', { class: 'amount-pill' }, formatMoney(tr.amountCents)),
          h('span', { class: 'who' }, `${t('toWord')} `, avatar(tr.to), h('strong', {}, nameOf(tr.to)))),
      ),
    );
    rows.set(tr, row);
    return row;
  };

  function refresh() {
    let done = 0;
    for (const [tr, row] of rows) {
      const paid = state.paid[keys.get(tr)] === true;
      row.classList.toggle('paid', paid);
      if (paid) done++;
    }
    progress.value = done;
    status.classList.toggle('complete', done === transfers.length);
    status.textContent = done === transfers.length
      ? t('allDone')
      : t('progress', done, transfers.length);
  }

  wrap.append(h('h3', {}, transfers.length === 1 ? t('transferOne') : t('transferMany', transfers.length)));
  for (const g of groups) {
    const title = groupTitle(g.kind, centralName);
    wrap.append(h('div', { class: 'group' },
      title && h('div', { class: 'group-head' },
        h('h4', {}, title),
        h('span', { class: 'sub' }, t('imgGroupTotal', formatMoney(g.totalCents))),
      ),
      h('ul', { class: 'list checklist' }, g.transfers.map(rowFor)),
    ));
  }
  progressRow.append(progress, status);
  wrap.append(progressRow);
  refresh();
  return wrap;
}

function balanceTable(balances) {
  const cell = (cents) => h('td', { class: cents > 0 ? 'pos' : cents < 0 ? 'neg' : '' }, formatMoney(cents));
  return h('div', { class: 'balances' },
    h('h3', {}, t('balancesHeading')),
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {}, t('balanceHeads').map((head) => h('th', { scope: 'col' }, head)))),
        h('tbody', {}, balances.map((b) => h('tr', {},
          h('th', { scope: 'row' }, h('span', { class: 'who' }, avatar(b.id), b.name)),
          h('td', {}, formatMoney(b.paidCents)),
          h('td', {}, formatMoney(b.shareCents)),
          cell(b.balanceCents),
          h('td', { class: 'sub' }, b.balanceCents > 0 ? t('toReceive') : b.balanceCents < 0 ? t('toPay') : t('even')),
        ))),
      ),
    ),
  );
}

// ---- Ações ----

function onRemovePerson(person) {
  const involved = state.expenses.some((e) => e.participants.includes(person.id));
  if (involved && !confirm(t('confirmRemovePerson', person.name))) return;
  const result = S.removePerson(state, person.id);
  if (result.error) return say(result.error, 'error');
  draft.participants.delete(person.id);
  commit(result.state);
}

function onRemoveExpense(expense) {
  if (!confirm(t('confirmRemoveExpense', expense.description))) return;
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
  if (amountCents === null || amountCents === 0) return say(t('badAmount'), 'error');
  if (amountCents > S.MAX_CENTS) return say(t('amountTooBig'), 'error');
  const participants = state.people.map((p) => p.id).filter((id) => draft.participants.has(id));
  if (participants.length === 0) return say(t('needParticipant'), 'error');
  const paidBy = $('exp-payer').value;
  if (!state.people.some((p) => p.id === paidBy)) return say(t('needPayer'), 'error');

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

async function copyInstructions(groups) {
  const centralName = nameOf(settlementPlan(state).centralId);
  const blocks = groups.map((g) => {
    const title = groupTitle(g.kind, centralName);
    const lines = g.transfers.map((tr) => transferText(nameOf(tr.from), tr.amountCents, nameOf(tr.to)));
    return (title ? [t('groupInstructionHeader', title, formatMoney(g.totalCents)), ...lines] : lines).join('\n');
  });
  const text = (state.name ? `${state.name}\n` : '') + blocks.join('\n\n');
  if (await copyText(text)) say(t('instructionsCopied'));
  else window.prompt(t('copyPrompt'), text);
}

async function onShare() {
  if (S.isEmpty(state)) return say(t('nothingToShare'), 'warn');
  const url = `${location.origin}${location.pathname}#${await S.encodeShare(state)}`;
  const note = t('shareNote');
  if (url.length > 8000) say(t('shareTooBig', note), 'warn');
  if (await copyText(url)) {
    if (url.length <= 8000) say(t('linkCopied', note));
  } else {
    window.prompt(t('linkPrompt'), url);
  }
}

function slug(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function onExport() {
  download(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), `quites-${slug(state.name) || 'grupo'}.json`);
}

async function onDownloadImage() {
  const canvas = renderSummaryCanvas(buildSummary(state));
  if (!canvas) return say(t('tooManyExpenses'), 'warn');
  try {
    download(await canvasToPng(canvas), `quites-${slug(state.name) || 'resumo'}.png`);
    say(t('imageDone'));
  } catch (err) {
    say(err.message, 'error');
  }
}

async function onImportFile(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  if (file.size > 2_000_000) return say(t('fileTooBig'), 'error');
  let incoming = null;
  try {
    incoming = S.normalizeState(JSON.parse(await file.text()));
  } catch { /* fica null */ }
  if (!incoming) return say(t('fileInvalid'), 'error');
  if (!S.isEmpty(state) && !confirm(t('confirmReplaceFile'))) return;
  adopt(incoming);
  say(t('imported'));
}

function onDemo() {
  if (!S.isEmpty(state) && !confirm(t('confirmDemo'))) return;
  adopt(demoState());
}

function onClear() {
  if (S.isEmpty(state) && !state.name) return;
  if (!confirm(t('confirmClear'))) return;
  adopt(S.emptyState());
}

async function loadFromHash() {
  const code = location.hash.slice(1);
  if (code.toLowerCase() === 'labrego') {
    history.replaceState(null, '', location.pathname + location.search);
    if (!isLabrego()) switchLabrego(true);
    return;
  }
  if (!/^[zd][\w-]+$/.test(code)) return;
  history.replaceState(null, '', location.pathname + location.search);
  const incoming = await S.decodeShare(code);
  if (!incoming) return say(t('linkInvalid'), 'error');
  const summary = t('linkSummary', incoming.name || t('unnamed'), incoming.people.length, incoming.expenses.length);
  if (!S.isEmpty(state) && !confirm(t('confirmReplaceLink', summary))) return;
  adopt(incoming);
  say(t('linkLoaded', summary));
}

// ---- Modo labrego (escondido) ----
// Liga-se com 5 cliques seguidos no logótipo ou abrindo o site com `#labrego`, e repete-se o gesto para desligar.
// Só muda os textos; fica guardado neste browser e nunca entra no grupo exportado ou partilhado.

const LABREGO_KEY = 'quites:labrego';

function switchLabrego(on) {
  setLabrego(on);
  mark.classList.toggle('labrego', on);
  if (on && !reduceMotion.matches && mark.animate) {
    for (const nip of mark.querySelectorAll('.nip')) {
      nip.animate([{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1.5)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 450, easing: 'ease-out' });
    }
  }
  try { storage.setItem(LABREGO_KEY, on ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta visita */ }
  applyStaticTexts();
  render();
  say(t(on ? 'modeOn' : 'modeOff'));
}

try { setLabrego(storage.getItem(LABREGO_KEY) === '1'); } catch { /* fica no modo normal */ }

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

// Menu "Mais": fecha ao escolher uma opção, ao clicar fora ou com Escape.
const menu = $('menu-more');
menu.addEventListener('click', (ev) => { if (ev.target.closest('.menu-list button')) menu.open = false; });
document.addEventListener('click', (ev) => { if (!menu.contains(ev.target)) menu.open = false; });
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && menu.open) {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
});

// Colar um link do Quites num separador onde a app já está aberta só muda o `#`, sem recarregar.
window.addEventListener('hashchange', loadFromHash);

// Logótipo: os círculos juntam-se e o visto desenha-se (Web Animations API, que funciona em todos os browsers).
// Clicar repete a animação; 5 cliques seguidos ligam/desligam o modo escondido (ver acima).
const mark = $('mark');

function playMark() {
  if (reduceMotion.matches || !mark.animate) return;
  const slide = { duration: 800, delay: 100, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' };
  const apart = isLabrego() ? 7 : 0; // no modo escondido as duas metades acabam afastadas
  mark.querySelector('.left').animate([{ transform: `translateX(${-13 - apart}px)` }, { transform: `translateX(${-apart}px)` }], slide);
  mark.querySelector('.right').animate([{ transform: `translateX(${13 + apart}px)` }, { transform: `translateX(${apart}px)` }], slide);
  mark.querySelector('.lens').animate(
    [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1)' }],
    { duration: 350, delay: 650, easing: 'ease-out', fill: 'backwards' },
  );
  mark.querySelector('.tick').animate(
    [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
    { duration: 400, delay: 950, easing: 'ease-out', fill: 'backwards' },
  );
}

function wiggleMark() {
  if (reduceMotion.matches || !mark.animate) return;
  mark.animate(
    [
      { transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(-9deg) scale(1.08)' }, { transform: 'rotate(8deg) scale(1.08)' },
      { transform: 'rotate(-5deg) scale(1.04)' }, { transform: 'rotate(0deg) scale(1)' },
    ],
    { duration: 600, easing: 'ease-in-out' },
  );
}

let taps = 0;
let tapTimer;
mark.addEventListener('click', () => {
  playMark();
  taps += 1;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { taps = 0; }, 800);
  if (taps < 5) return;
  taps = 0;
  wiggleMark();
  switchLabrego(!isLabrego());
});

applyStaticTexts();
resetDraft();
render();
loadFromHash();
mark.classList.toggle('labrego', isLabrego());
setTimeout(playMark, 150);
