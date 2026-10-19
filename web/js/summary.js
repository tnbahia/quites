// Resumo do grupo em texto, pronto a ser desenhado numa imagem (ver image.js).
// Fica separado do desenho para se poder testar sem canvas.

import { settlementPlan, pairKey, totalCents, formatMoney } from './settle.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const dateFormat = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });

/** Quanto toca a cada um. Com cêntimos que não dividem exatamente, mostra "≈". */
function shareText(amountCents, count) {
  if (amountCents % count === 0) return `${formatMoney(amountCents / count)} a cada um`;
  return `≈ ${formatMoney(Math.round(amountCents / count))} a cada um`;
}

export function buildSummary(state, now = new Date()) {
  const { transfers, central, centralId } = settlementPlan(state);
  const nameOf = (id) => state.people.find((p) => p.id === id)?.name ?? '?';

  const expenses = state.expenses.map((e) => {
    const everyone = e.participants.length === state.people.length;
    const who = everyone
      ? `todos (${e.participants.length})`
      : `${plural(e.participants.length, 'pessoa', 'pessoas')}: ${e.participants.map(nameOf).join(', ')}`;
    return {
      description: e.description,
      amountText: formatMoney(e.amountCents),
      detail: `Pago por ${nameOf(e.paidBy)} · divide por ${who}`,
      shareText: shareText(e.amountCents, e.participants.length),
    };
  });

  return {
    title: state.name || 'Acerto de contas',
    subtitle: dateFormat.format(now),
    totalText: formatMoney(totalCents(state.expenses)),
    countsText: `${plural(state.expenses.length, 'despesa', 'despesas')} · ${plural(state.people.length, 'pessoa', 'pessoas')}`,
    expenses,
    modeNote: central ? `Tudo passa por ${nameOf(centralId)}: quem deve paga a ${nameOf(centralId)}, que depois paga a quem tem a receber.` : null,
    transfers: transfers.map((t) => ({
      text: `${nameOf(t.from)} paga ${formatMoney(t.amountCents)} a ${nameOf(t.to)}`,
      paid: state.paid[pairKey(t)] === true,
    })),
  };
}
