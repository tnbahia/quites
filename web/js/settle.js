// Cálculo das contas. Sem DOM, sem estado global: só funções puras.
// Todo o dinheiro é guardado em cêntimos (inteiros) para não acumular erros de vírgula flutuante.

/** Divide `totalCents` por `ids`; os cêntimos que sobram vão para os primeiros da lista. */
export function splitEvenly(totalCents, ids) {
  const shares = new Map();
  if (ids.length === 0) return shares;
  const base = Math.floor(totalCents / ids.length);
  let remainder = totalCents - base * ids.length;
  for (const id of ids) {
    shares.set(id, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return shares;
}

/**
 * Saldo de cada pessoa: o que pagou menos a sua parte.
 * Positivo = tem a receber, negativo = tem a pagar. A soma dos saldos é sempre 0.
 * Despesas sem participantes, sem valor ou com pagador desconhecido são ignoradas.
 */
export function computeBalances(people, expenses) {
  const rows = new Map(people.map((p) => [p.id, { id: p.id, name: p.name, paidCents: 0, shareCents: 0, balanceCents: 0 }]));
  for (const e of expenses) {
    const payer = rows.get(e.paidBy);
    const participants = e.participants.filter((id) => rows.has(id));
    if (!payer || participants.length === 0 || !(e.amountCents > 0)) continue;
    payer.paidCents += e.amountCents;
    for (const [id, cents] of splitEvenly(e.amountCents, participants)) rows.get(id).shareCents += cents;
  }
  for (const r of rows.values()) r.balanceCents = r.paidCents - r.shareCents;
  return [...rows.values()];
}

/**
 * Menos transferências: primeiro emparelha dívidas e créditos de valor igual, depois vai
 * juntando o maior devedor ao maior credor. Nunca passa de (n - 1) transferências; não é
 * garantidamente o mínimo absoluto (esse problema é NP-difícil), mas chega lá na prática.
 */
export function minimalTransfers(balances) {
  const debtors = [];
  const creditors = [];
  for (const b of balances) {
    if (b.balanceCents < 0) debtors.push({ id: b.id, left: -b.balanceCents });
    else if (b.balanceCents > 0) creditors.push({ id: b.id, left: b.balanceCents });
  }
  const transfers = [];
  const settle = (d, c, amountCents) => {
    transfers.push({ from: d.id, to: c.id, amountCents });
    d.left -= amountCents;
    c.left -= amountCents;
  };

  for (const d of debtors) {
    const c = creditors.find((x) => x.left === d.left);
    if (c) settle(d, c, d.left);
  }

  const largest = (list) => list.reduce((best, x) => (x.left > (best?.left ?? 0) ? x : best), null);
  for (;;) {
    const d = largest(debtors);
    const c = largest(creditors);
    if (!d || !c) break;
    settle(d, c, Math.min(d.left, c.left));
  }
  return transfers;
}

/** Tudo passa por uma só pessoa: quem deve paga-lhe, e ela paga a quem tem a receber. */
export function centralTransfers(balances, centralId) {
  if (!balances.some((b) => b.id === centralId)) return [];
  const transfers = [];
  for (const b of balances) {
    if (b.id === centralId || b.balanceCents === 0) continue;
    if (b.balanceCents < 0) transfers.push({ from: b.id, to: centralId, amountCents: -b.balanceCents });
    else transfers.push({ from: centralId, to: b.id, amountCents: b.balanceCents });
  }
  return transfers;
}

/** Saldos e transferências para o modo escolhido no estado (`minimal` ou `central`). */
export function settlementPlan(state) {
  const balances = computeBalances(state.people, state.expenses);
  const central = state.mode === 'central';
  const centralId = state.people.some((p) => p.id === state.central) ? state.central : (state.people[0]?.id ?? null);
  const transfers = central ? centralTransfers(balances, centralId) : minimalTransfers(balances);
  return { balances, transfers, central, centralId };
}

/**
 * Chave de uma transferência, usada para guardar o "pago?". Inclui o valor: se as despesas
 * mudarem e a pessoa passar a dever outra quantia, a marca de "pago" deixa de se aplicar.
 */
export function pairKey({ from, to, amountCents }) {
  return `${from}>${to}:${amountCents}`;
}

export function totalCents(expenses) {
  return expenses.reduce((sum, e) => sum + e.amountCents, 0);
}

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

export function formatMoney(cents) {
  return eur.format(cents / 100);
}

/** "12,50", "12.5", "1 234,56 €" → cêntimos; `null` se não for um valor válido. */
export function parseMoney(text) {
  const cleaned = String(text).replace(/[€\s]/g, '');
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.replace(',', '.').split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}
