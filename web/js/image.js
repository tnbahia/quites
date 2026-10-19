// Desenha o resumo (ver summary.js) num canvas e devolve-o como PNG, para enviar ao grupo.
// A imagem é sempre clara, independentemente do tema do browser, para ler bem em qualquer chat.

import { t } from './texts.js';

const W = 1080;
const PAD = 64;
const MAX_HEIGHT = 16000; // acima disto alguns browsers recusam criar o canvas
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
const COLOR = {
  bg: '#ffffff', text: '#1b2724', muted: '#5a6b66', border: '#dbe3de', accent: '#0f766e', soft: '#e2f3f0', onAccent: '#ffffff',
};

const font = (weight, size) => `${weight} ${size}px ${FONT}`;

/** Parte o texto em linhas que cabem em `maxWidth` (parte palavras maiores que a linha). */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width <= maxWidth) {
      line = attempt;
      continue;
    }
    if (line) lines.push(line);
    let chunk = '';
    for (const ch of word) {
      if (chunk && ctx.measureText(chunk + ch).width > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Desenha tudo e devolve a altura usada. Com `height` = 0 serve só para medir. */
function paint(ctx, s, height) {
  const inner = W - 2 * PAD;
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = 'alphabetic';

  // Cabeçalho
  ctx.font = font(700, 54);
  const titleLines = wrap(ctx, s.title, inner);
  const headerH = 56 + titleLines.length * 62 + 44 + 36;
  ctx.fillStyle = COLOR.accent;
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = COLOR.onAccent;
  let y = 56;
  for (const line of titleLines) {
    ctx.fillText(line, PAD, y + 48);
    y += 62;
  }
  ctx.font = font(400, 26);
  ctx.fillText(t('imgMadeWith', s.subtitle), PAD, y + 28);
  y = headerH + 40;

  // Total
  ctx.fillStyle = COLOR.soft;
  roundedRect(ctx, PAD, y, inner, 170, 20);
  ctx.fill();
  ctx.fillStyle = COLOR.muted;
  ctx.font = font(400, 26);
  ctx.fillText(t('imgTotalLabel'), PAD + 32, y + 50);
  ctx.fillStyle = COLOR.accent;
  ctx.font = font(700, 68);
  ctx.fillText(s.totalText, PAD + 32, y + 126);
  ctx.fillStyle = COLOR.muted;
  ctx.font = font(400, 26);
  ctx.textAlign = 'right';
  ctx.fillText(s.countsText, W - PAD - 32, y + 126);
  ctx.textAlign = 'left';
  y += 170 + 52;

  const heading = (text) => {
    ctx.fillStyle = COLOR.text;
    ctx.font = font(700, 38);
    ctx.fillText(text, PAD, y + 36);
    y += 36 + 28;
  };

  // Despesas
  heading(t('imgExpenses'));
  s.expenses.forEach((e, i) => {
    ctx.font = font(700, 30);
    const amountW = ctx.measureText(e.amountText).width;
    const descLines = wrap(ctx, e.description, inner - amountW - 24);
    ctx.fillStyle = COLOR.text;
    descLines.forEach((line, n) => {
      ctx.fillText(line, PAD, y + 30);
      if (n === 0) {
        ctx.textAlign = 'right';
        ctx.fillText(e.amountText, W - PAD, y + 30);
        ctx.textAlign = 'left';
      }
      y += 38;
    });

    ctx.font = font(400, 24);
    ctx.fillStyle = COLOR.muted;
    for (const line of wrap(ctx, e.detail, inner)) {
      ctx.fillText(line, PAD, y + 24);
      y += 33;
    }

    ctx.font = font(600, 26);
    ctx.fillStyle = COLOR.accent;
    ctx.fillText(e.shareText, PAD, y + 28);
    y += 40;

    if (i < s.expenses.length - 1) {
      y += 14;
      ctx.fillStyle = COLOR.border;
      ctx.fillRect(PAD, y, inner, 2);
      y += 20;
    }
  });
  y += 44;

  // Quem paga a quem
  heading(t('imgWhoPaysWhom'));
  if (s.modeNote) {
    ctx.font = font(400, 24);
    ctx.fillStyle = COLOR.muted;
    for (const line of wrap(ctx, s.modeNote, inner)) {
      ctx.fillText(line, PAD, y + 24);
      y += 33;
    }
    y += 12;
  }
  if (s.transferGroups.length === 0) {
    ctx.font = font(600, 32);
    ctx.fillStyle = COLOR.accent;
    ctx.fillText(t('imgAllSquare'), PAD, y + 32);
    y += 48;
  }
  s.transferGroups.forEach((group, g) => {
    if (group.title) {
      if (g > 0) y += 20;
      ctx.fillStyle = COLOR.accent;
      ctx.font = font(700, 30);
      ctx.fillText(group.title, PAD, y + 30);
      ctx.fillStyle = COLOR.muted;
      ctx.font = font(400, 26);
      ctx.textAlign = 'right';
      ctx.fillText(t('imgGroupTotal', group.totalText), W - PAD, y + 30);
      ctx.textAlign = 'left';
      y += 30 + 24;
    }
    for (const item of group.items) y = paintTransfer(ctx, item, y, inner);
  });
  y += 28;

  // Rodapé
  ctx.font = font(400, 22);
  ctx.fillStyle = COLOR.muted;
  ctx.fillText(t('imgFooter'), PAD, y + 22);
  return y + 22 + 48;
}

/** Uma transferência com a sua caixa (cheia e com visto se já foi paga). Devolve o novo `y`. */
function paintTransfer(ctx, t, y, inner) {
  ctx.font = font(600, 32);
  const lines = wrap(ctx, t.text, inner - 56);
  const boxY = y + 4;
  if (t.paid) {
    ctx.fillStyle = COLOR.accent;
    roundedRect(ctx, PAD, boxY, 34, 34, 8);
    ctx.fill();
    ctx.strokeStyle = COLOR.onAccent;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(PAD + 8, boxY + 18);
    ctx.lineTo(PAD + 15, boxY + 25);
    ctx.lineTo(PAD + 27, boxY + 10);
    ctx.stroke();
  } else {
    ctx.strokeStyle = COLOR.muted;
    ctx.lineWidth = 3;
    roundedRect(ctx, PAD + 1.5, boxY + 1.5, 31, 31, 8);
    ctx.stroke();
  }
  ctx.fillStyle = t.paid ? COLOR.muted : COLOR.text;
  for (const line of lines) {
    ctx.fillText(line, PAD + 56, y + 32);
    y += 42;
  }
  return y + 16;
}

/** Devolve um canvas com o resumo desenhado, ou `null` se for demasiado grande para uma imagem. */
export function renderSummaryCanvas(summary) {
  const scratch = document.createElement('canvas');
  scratch.width = W;
  scratch.height = 1;
  const height = Math.ceil(paint(scratch.getContext('2d'), summary, 0));
  if (height > MAX_HEIGHT) return null;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;
  paint(canvas.getContext('2d'), summary, height);
  return canvas;
}

export function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t('imageFail')))), 'image/png');
  });
}
