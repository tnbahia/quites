// Resumo do grupo em texto, pronto a ser desenhado numa imagem (ver image.js).
// Fica separado do desenho para se poder testar sem canvas.

import { settlementPlan, groupTransfers, pairKey, totalCents, formatMoney } from './settle.js';
import { t } from './texts.js';

/** A frase de uma transferência, igual na página, nas instruções copiadas e na imagem. */
export const transferText = (from, amountCents, to) => `${from} ${t('pays')} ${formatMoney(amountCents)} ${t('toWord')} ${to}`;

const dateFormat = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });

/** Título de cada grupo de transferências (`null` quando há um só grupo, sem pessoa central). */
export function groupTitle(kind, centralName) {
  if (kind === 'pay') return t('groupPay', centralName);
  if (kind === 'receive') return t('groupReceive', centralName);
  return null;
}

/** Quanto toca a cada um. Com cêntimos que não dividem exatamente, mostra "≈". */
function shareText(amountCents, count) {
  if (amountCents % count === 0) return t('shareEach', formatMoney(amountCents / count));
  return t('shareEachApprox', formatMoney(Math.round(amountCents / count)));
}

export function buildSummary(state, now = new Date()) {
  const { transfers, central, centralId } = settlementPlan(state);
  const nameOf = (id) => state.people.find((p) => p.id === id)?.name ?? '?';

  const expenses = state.expenses.map((e) => {
    const everyone = e.participants.length === state.people.length;
    const who = everyone
      ? t('whoAllCount', e.participants.length)
      : t('whoList', e.participants.length, e.participants.map(nameOf).join(', '));
    return {
      description: e.description,
      amountText: formatMoney(e.amountCents),
      detail: t('expenseSub', nameOf(e.paidBy), who),
      shareText: shareText(e.amountCents, e.participants.length),
    };
  });

  return {
    title: state.name || t('summaryDefaultTitle'),
    subtitle: dateFormat.format(now),
    totalText: formatMoney(totalCents(state.expenses)),
    countsText: `${t('countExpenses', state.expenses.length)} · ${t('countPeople', state.people.length)}`,
    expenses,
    modeNote: central ? t('modeNote', nameOf(centralId)) : null,
    transferGroups: groupTransfers(transfers, central ? centralId : null).map((g) => ({
      title: groupTitle(g.kind, nameOf(centralId)),
      totalText: formatMoney(g.totalCents),
      items: g.transfers.map((tr) => ({
        text: transferText(nameOf(tr.from), tr.amountCents, nameOf(tr.to)),
        paid: state.paid[pairKey(tr)] === true,
      })),
    })),
  };
}
