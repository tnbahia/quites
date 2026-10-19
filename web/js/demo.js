// Grupo fictício para experimentar a aplicação.

import { t } from './texts.js';

export function demoState() {
  const people = t('demoPeople').map((name, i) => ({ id: `p${i + 1}`, name }));
  const [alojamento, jantar, supermercado, gasolina] = t('demoExpenses');
  const [ana, bruno, carla, diogo, eva] = people.map((p) => p.id);
  const everyone = [ana, bruno, carla, diogo, eva];
  return {
    version: 1,
    name: t('demoName'),
    people,
    expenses: [
      { id: 'e1', description: alojamento, amountCents: 24000, paidBy: ana, participants: everyone },
      { id: 'e2', description: jantar, amountCents: 8550, paidBy: bruno, participants: everyone },
      { id: 'e3', description: supermercado, amountCents: 6320, paidBy: carla, participants: [ana, bruno, carla, diogo] },
      { id: 'e4', description: gasolina, amountCents: 4800, paidBy: diogo, participants: [diogo, eva] },
    ],
    mode: 'minimal',
    central: null,
    paid: {},
  };
}
