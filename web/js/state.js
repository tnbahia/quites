// Estado da aplicação: forma dos dados, validação, gravação local e partilha por link.
// Tudo o que vem de fora (localStorage, ficheiro importado, link) passa por normalizeState.

export const STORAGE_KEY = 'quites:v1';

const MAX_PEOPLE = 200;
const MAX_EXPENSES = 2000;
export const MAX_CENTS = 100_000_000_00; // 100 milhões de euros
const MAX_SHARE_CHARS = 200_000;
const MAX_SHARE_BYTES = 1_000_000;
const ID_PATTERN = /^[\w-]{1,40}$/;
const PAIR_PATTERN = /^([\w-]{1,40})>([\w-]{1,40}):\d{1,12}$/;

export function emptyState() {
  return { version: 1, name: '', people: [], expenses: [], mode: 'minimal', central: null, paid: {} };
}

export function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Aceita qualquer coisa e devolve um estado válido, ou `null` se nem sequer parecer um estado. */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const state = emptyState();
  state.name = cleanText(raw.name, 80);

  const seen = new Set();
  for (const p of Array.isArray(raw.people) ? raw.people.slice(0, MAX_PEOPLE) : []) {
    const name = cleanText(p?.name, 60);
    if (!name || typeof p.id !== 'string' || !ID_PATTERN.test(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    state.people.push({ id: p.id, name });
  }

  const expenseIds = new Set();
  for (const e of Array.isArray(raw.expenses) ? raw.expenses.slice(0, MAX_EXPENSES) : []) {
    if (typeof e?.id !== 'string' || !ID_PATTERN.test(e.id) || expenseIds.has(e.id)) continue;
    if (!Number.isSafeInteger(e.amountCents) || e.amountCents <= 0 || e.amountCents > MAX_CENTS) continue;
    if (!seen.has(e.paidBy)) continue;
    const participants = [...new Set(Array.isArray(e.participants) ? e.participants : [])].filter((id) => seen.has(id));
    if (participants.length === 0) continue;
    expenseIds.add(e.id);
    state.expenses.push({
      id: e.id,
      description: cleanText(e.description, 100) || 'Despesa',
      amountCents: e.amountCents,
      paidBy: e.paidBy,
      participants,
    });
  }

  state.mode = raw.mode === 'central' ? 'central' : 'minimal';
  state.central = seen.has(raw.central) ? raw.central : null;

  if (raw.paid && typeof raw.paid === 'object') {
    for (const [key, value] of Object.entries(raw.paid)) {
      if (value === true && PAIR_PATTERN.test(key)) state.paid[key] = true;
    }
  }
  return state;
}

export function isEmpty(state) {
  return state.people.length === 0 && state.expenses.length === 0;
}

// ---- Alterações (devolvem um novo estado; nunca mexem no que receberam) ----

/** Devolve `{ state }` ou `{ error }`. */
export function addPerson(state, rawName) {
  const name = cleanText(rawName, 60);
  if (!name) return { error: 'Escreve um nome.' };
  if (state.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return { error: `Já existe alguém chamado "${name}".` };
  }
  if (state.people.length >= MAX_PEOPLE) return { error: 'Chegaste ao limite de pessoas.' };
  const person = { id: uid(), name };
  return { state: { ...state, people: [...state.people, person] }, person };
}

/** Quem pagou despesas não pode sair; nas restantes despesas deixa de participar. */
export function removePerson(state, id) {
  if (state.expenses.some((e) => e.paidBy === id)) {
    return { error: 'Esta pessoa pagou despesas. Remove ou altera essas despesas primeiro.' };
  }
  const expenses = state.expenses
    .map((e) => ({ ...e, participants: e.participants.filter((p) => p !== id) }))
    .filter((e) => e.participants.length > 0);
  const paid = Object.fromEntries(
    Object.entries(state.paid).filter(([key]) => !PAIR_PATTERN.exec(key)?.slice(1, 3).includes(id)),
  );
  return {
    state: {
      ...state,
      people: state.people.filter((p) => p.id !== id),
      expenses,
      central: state.central === id ? null : state.central,
      paid,
    },
  };
}

/** Acrescenta a despesa, ou substitui a que tiver o mesmo `id`. */
export function upsertExpense(state, expense) {
  const exists = state.expenses.some((e) => e.id === expense.id);
  const expenses = exists
    ? state.expenses.map((e) => (e.id === expense.id ? expense : e))
    : [...state.expenses, expense];
  return { ...state, expenses };
}

export function removeExpense(state, id) {
  return { ...state, expenses: state.expenses.filter((e) => e.id !== id) };
}

// ---- Gravação local ----

export function loadState(storage) {
  try {
    const text = storage.getItem(STORAGE_KEY);
    return (text && normalizeState(JSON.parse(text))) || emptyState();
  } catch {
    return emptyState();
  }
}

/** Devolve `false` se não conseguiu gravar (modo privado, quota cheia, ...). */
export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ---- Partilha por link: o estado vai no `#` do URL, nunca passa por um servidor ----

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function runStream(bytes, transform) {
  const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_SHARE_BYTES) {
      await reader.cancel();
      throw new Error('Dados demasiado grandes.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** "z…" = comprimido, "d…" = texto simples (browsers sem CompressionStream). */
export async function encodeShare(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  if (typeof CompressionStream === 'undefined') return 'd' + toBase64Url(bytes);
  return 'z' + toBase64Url(await runStream(bytes, new CompressionStream('deflate-raw')));
}

/** Devolve um estado válido, ou `null` se o código estiver estragado ou for demasiado grande. */
export async function decodeShare(code) {
  try {
    if (typeof code !== 'string' || code.length < 2 || code.length > MAX_SHARE_CHARS) return null;
    const bytes = fromBase64Url(code.slice(1));
    let json;
    if (code[0] === 'z') json = await runStream(bytes, new DecompressionStream('deflate-raw'));
    else if (code[0] === 'd') json = bytes;
    else return null;
    return normalizeState(JSON.parse(new TextDecoder().decode(json)));
  } catch {
    return null;
  }
}
