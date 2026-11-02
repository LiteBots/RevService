/* Asystent AI (RevBot) — pytania o dane firmy, szkice odpowiedzi do klientów i ofert */
import { api, esc, icon, toast, local } from '../core.js';

const CHIPS = [
  'Ile zarobimy w tym tygodniu i co jest jeszcze do zrobienia?',
  'Kto z ekipy ma jutro wolne?',
  'Które usługi mają najlepszą marżę w tym miesiącu?',
  'Którzy klienci zalegają z płatnościami?',
  'Podsumuj ostatni tydzień w 5 punktach',
  'Ile kosztowało nas paliwo w tym miesiącu?'
];

const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[-•] (.+)$/gm, '• $1').replace(/\n/g, '<br>');

export default async function asystent(el, { ctx }) {
  ctx.setTitle('Asystent AI', 'Pytaj o dane firmy jak wspólnika — widzi zlecenia, koszty i grafik');
  let history = local.get('assistant', []).slice(-20);
  el.innerHTML = `
    <div class="card chat-pane" style="height:calc(100dvh - 190px);min-height:420px">
      <div class="msgs" data-msgs></div>
      <div style="padding:0 14px 8px"><div class="chips" data-chips>${CHIPS.map(c => `<button class="chip" data-chip>${esc(c)}</button>`).join('')}</div></div>
      <div class="composer"><textarea class="input" rows="1" data-q placeholder="Zapytaj o cokolwiek w firmie…"></textarea><button class="btn primary" data-send style="border-radius:50%;width:42px;height:42px;padding:0">${icon('send', 'sm')}</button></div>
    </div>
    <div class="row between small muted"><span>Odpowiedzi generuje Claude na podstawie danych z RevMi. Sprawdzaj ważne liczby.</span><button class="link-btn small" data-clear>Wyczyść rozmowę</button></div>`;
  const box = el.querySelector('[data-msgs]');
  const paint = (thinking = false) => {
    box.innerHTML = (history.length ? history.map(h => `<div class="msg ${h.role === 'user' ? 'me' : ''}">${h.role === 'user' ? '' : `<span class="avatar sm" style="background:linear-gradient(135deg,var(--accent),#0a7d63)">✦</span>`}<div class="bubble">${h.role === 'user' ? esc(h.text) : md(h.text)}</div></div>`).join('') : `<div class="empty">${icon('spark')}<b>Cześć! Jestem asystentem RevMi.</b>Zapytaj o przychody, ekipę, klientów albo poproś o szkic odpowiedzi.</div>`)
      + (thinking ? '<div class="msg"><span class="avatar sm" style="background:linear-gradient(135deg,var(--accent),#0a7d63)">✦</span><div class="bubble"><span class="muted">Analizuję dane…</span></div></div>' : '');
    box.scrollTop = box.scrollHeight;
  };
  async function ask(question) {
    if (!question.trim()) return;
    history.push({ role: 'user', text: question.trim() });
    paint(true);
    try {
      const r = await api('/v92/assistant/ask', { method: 'POST', body: { question: question.trim(), history: history.slice(-7, -1) } });
      history.push({ role: 'assistant', text: r.answer });
    } catch (error) {
      history.push({ role: 'assistant', text: '⚠ ' + error.message });
      toast(error.message, 'err');
    }
    local.set('assistant', history.slice(-20));
    paint();
  }
  el.addEventListener('click', e => {
    const c = e.target.closest('[data-chip]');
    if (c) return ask(c.textContent);
    if (e.target.closest('[data-send]')) { const q = el.querySelector('[data-q]'); ask(q.value); q.value = ''; }
    if (e.target.closest('[data-clear]')) { history = []; local.set('assistant', []); paint(); }
  });
  el.addEventListener('keydown', e => { if (e.target.matches('[data-q]') && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(e.target.value); e.target.value = ''; } });
  paint();
}
