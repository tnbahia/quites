// Grupo fictício para experimentar a aplicação.

export function demoState() {
  const people = ['Ana', 'Bruno', 'Carla', 'Diogo', 'Eva'].map((name, i) => ({ id: `p${i + 1}`, name }));
  const [ana, bruno, carla, diogo, eva] = people.map((p) => p.id);
  const everyone = [ana, bruno, carla, diogo, eva];
  return {
    version: 1,
    name: 'Fim de semana na serra',
    people,
    expenses: [
      { id: 'e1', description: 'Alojamento', amountCents: 24000, paidBy: ana, participants: everyone },
      { id: 'e2', description: 'Jantar de sábado', amountCents: 8550, paidBy: bruno, participants: everyone },
      { id: 'e3', description: 'Supermercado', amountCents: 6320, paidBy: carla, participants: [ana, bruno, carla, diogo] },
      { id: 'e4', description: 'Gasolina', amountCents: 4800, paidBy: diogo, participants: [diogo, eva] },
    ],
    mode: 'minimal',
    central: null,
    paid: {},
  };
}
