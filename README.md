# Quites

Divide despesas com amigos e descobre quem paga a quê, para ficar tudo quite.
Corre no teu browser: sem conta, sem servidor, sem anúncios. Os dados ficam contigo.

> Nasceu de uma folha de cálculo usada para acertar contas num grupo, e o nome vem de "estamos quites". Paga o que deves.

**Experimenta:** <https://tnbahia.github.io/quites/>

## Como se usa

1. **Pessoas.** Adiciona quem faz parte do grupo.
2. **Despesas.** Para cada uma, indica o valor, quem pagou e quem participa. O valor divide-se por igual entre os participantes (quem paga pode não participar, por exemplo numa prenda).
3. **Acerto.** Escolhe como acertar:
   - **Menos transferências**: cada pessoa paga diretamente a quem lhe deve.
   - **Tudo por uma só pessoa**: quem deve paga a uma pessoa central, que depois paga a quem tem a receber.

   Vais riscando cada transferência à medida que é feita. Para avisar o grupo, podes **copiar as instruções** em texto ou **descarregar uma imagem** (PNG) com o total, cada despesa (quantas pessoas, quanto toca a cada uma) e quem paga a quem.

## Privacidade

- Não há servidor nem base de dados. Os dados ficam no `localStorage` do teu browser.
- **Copiar link do grupo** põe o grupo todo no endereço (a parte a seguir ao `#`, que o browser nunca envia a servidores). Quem abrir o link recebe uma **cópia**; as alterações de cada pessoa não se sincronizam.
- **Mais → Exportar / Importar** guarda e repõe o grupo num ficheiro JSON, como cópia de segurança.
- A página tem uma Content-Security-Policy que só permite código do próprio site.

## Limites conhecidos

- Cada pessoa trabalha na sua cópia. Não há edição em simultâneo por várias pessoas (isso pediria um servidor).
- Só euros, e só divisão por igual entre os participantes.
- O cálculo do "menos transferências" não garante o mínimo absoluto (é um problema NP-difícil), mas nunca passa de _n − 1_ transferências e junta valores iguais.
- Os valores são calculados em cêntimos; quando uma despesa não divide exatamente, os cêntimos que sobram vão para os primeiros participantes da lista.

## Desenvolvimento

Só precisa de Node 20+ (para os testes) e de qualquer servidor de ficheiros estáticos. Não há dependências nem passo de build.

```bash
npm test      # testes unitários (node:test)
npm start     # serve web/ em http://localhost:8080
```

```
web/
  index.html
  css/style.css
  js/settle.js   cálculo de saldos e transferências (funções puras, valores em cêntimos)
  js/state.js    forma dos dados, validação, localStorage, links de partilha
  js/summary.js  resumo em texto do grupo (alimenta a imagem)
  js/image.js    desenha o resumo num canvas e gera o PNG
  js/demo.js     grupo fictício de exemplo
  js/app.js      interface
test/            testes de settle.js, state.js e summary.js
```

Tudo o que vem de fora (localStorage, ficheiro importado, link) passa por `normalizeState`, e os textos entram na página sempre como texto, nunca como HTML.

### Publicação

O workflow em `.github/workflows/pages.yml` corre os testes e publica a pasta `web/` no GitHub Pages a cada push para `main`. Os caminhos no HTML são relativos, por isso o site funciona em qualquer subcaminho.

## Licença

[MIT](LICENSE)
