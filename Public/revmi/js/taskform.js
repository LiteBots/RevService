/* RevMi 2.0.0 — formularz zlecenia (nowe / edycja), wspólny dla wielu ekranów */
import { S, api, esc, fieldHtml, readForm, modal, busy, toast, reloadData, go, toLocalInput, can, avatar, icon } from './core.js';

export const SERVICE_TYPES = ['Przeprowadzka', 'Opróżnianie', 'Wywóz', 'Transport', 'Sprzątanie', 'Ogród', 'Odśnieżanie', 'Rozbiórka', 'Magazynowanie', 'Przewóz osób', 'Pakiet firmowy', 'Oględziny', 'Inne'];

/**
 * Otwiera formularz. `task` = istniejące zlecenie (edycja) albo undefined (nowe); `defaults` = wartości startowe.
 * Zwraca Promise z zapisanym zleceniem (albo null po anulowaniu).
 */
export function openTaskForm(task, defaults = {}) {
  return new Promise(resolve => {
    const t = { status: 'planned', type: 'Przeprowadzka', priority: 'normal', paymentStatus: 'unpaid', ...defaults, ...(task || {}) };
    const data = S.data || {};
    const start = t.dateStart ? new Date(t.dateStart) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d; })();
    const selected = new Set((t.workers || []).map(w => String(w.employee)).filter(Boolean));
    const types = SERVICE_TYPES.includes(t.type) ? SERVICE_TYPES : [t.type, ...SERVICE_TYPES];
    let saved = null;

    const close = modal({
      title: task ? `Edycja: ${task.name}` : 'Nowe zlecenie',
      wide: true,
      body: `<form class="form-grid" novalidate>
        ${fieldHtml({ name: 'name', label: 'Nazwa zlecenia', value: t.name, required: true, full: true, placeholder: 'np. Przeprowadzka 3 pokoje' })}
        ${fieldHtml({ name: 'type', label: 'Usługa', type: 'select', value: t.type, options: types.map(x => [x, x]) })}
        ${fieldHtml({ name: 'status', label: 'Status', type: 'select', value: t.status, options: [['new', 'Nowa wycena'], ['quoted', 'Wycenione'], ['planned', 'Zaplanowane'], ['progress', 'W realizacji'], ['cancelled', 'Anulowane']] })}
        ${fieldHtml({ name: 'dateStart', label: 'Termin', type: 'datetime', value: start, required: true })}
        ${fieldHtml({ name: 'dateEnd', label: 'Koniec (opcjonalnie)', type: 'datetime', value: t.dateEnd || '' })}
        ${fieldHtml({ name: 'price', label: 'Cena (zł brutto)', type: 'number', value: t.price ?? '', min: 0, step: 10 })}
        ${fieldHtml({ name: 'priceMax', label: 'Cena do (widełki, opcjonalnie)', type: 'number', value: t.priceMax ?? '', min: 0, step: 10 })}
        <div class="full eyebrow" style="margin-top:6px">Klient</div>
        ${data.clients?.length ? fieldHtml({ name: 'client', label: 'Klient z bazy (opcjonalnie)', type: 'select', value: t.client || '', options: [['', '— nowy / bez powiązania —'], ...data.clients.map(c => [c._id, c.company || c.name])], full: true }) : ''}
        ${fieldHtml({ name: 'clientName', label: 'Imię i nazwisko / firma', value: t.clientName })}
        ${fieldHtml({ name: 'clientPhone', label: 'Telefon', type: 'tel', value: t.clientPhone })}
        ${fieldHtml({ name: 'clientEmail', label: 'E-mail', type: 'email', value: t.clientEmail })}
        ${fieldHtml({ name: 'address', label: 'Adres', value: t.address, placeholder: 'ul. Długa 12, Słupsk' })}
        ${fieldHtml({ name: 'addressFrom', label: 'Skąd (przeprowadzka)', value: t.addressFrom })}
        ${fieldHtml({ name: 'addressTo', label: 'Dokąd', value: t.addressTo })}
        ${fieldHtml({ name: 'desc', label: 'Opis dla ekipy', type: 'textarea', value: t.desc, full: true })}
        <div class="full eyebrow" style="margin-top:6px">Ekipa i sprzęt</div>
        <div class="full field"><span>Ekipa</span><div class="chips" data-workers>${(data.employees || []).map(e => `<button type="button" class="chip ${selected.has(String(e._id)) ? 'on' : ''}" data-emp="${e._id}">${avatar(e.name, e.color, 'sm')} ${esc(e.name)}</button>`).join('') || '<span class="muted small">Dodaj pracowników w „Zespół”.</span>'}</div></div>
        ${fieldHtml({ name: 'vehicle', label: 'Pojazd', type: 'select', value: t.vehicle || '', options: [['', '— bez pojazdu —'], ...(data.fleet || []).map(v => [v._id, `${v.name} (${v.plates})`])] })}
        ${data.branches?.length ? fieldHtml({ name: 'branch', label: 'Oddział', type: 'select', value: t.branch || '', options: [['', 'Ekipa główna (bez oddziału)'], ...data.branches.map(b => [b._id, b.name])] }) : ''}
        ${fieldHtml({ name: 'priority', label: 'Priorytet', type: 'select', value: t.priority, options: [['normal', 'Normalny'], ['high', 'Pilne'], ['low', 'Niski']] })}
        ${fieldHtml({ name: 'paymentStatus', label: 'Płatność', type: 'select', value: t.paymentStatus, options: [['unpaid', 'Nieopłacone'], ['partial', 'Częściowo'], ['paid', 'Opłacone']] })}
        <div class="full" data-pkg></div>
      </form>`,
      foot: `${task ? `<button class="btn danger" data-del>${icon('trash', 'sm')} Usuń</button><span class="grow"></span>` : ''}<button class="btn ghost" data-close>Anuluj</button><button class="btn primary" data-save>${task ? 'Zapisz zmiany' : 'Dodaj zlecenie'}</button>`,
      onClose: () => resolve(saved),
      onMount: (el, done) => {
        const form = el.querySelector('form');
        el.querySelector('[data-workers]').addEventListener('click', e => {
          const b = e.target.closest('[data-emp]');
          if (!b) return;
          const id = b.dataset.emp;
          if (selected.has(id)) selected.delete(id); else selected.add(id);
          b.classList.toggle('on');
        });
        // Klient z bazy → podpowiedź danych kontaktowych
        form.querySelector('[name=client]')?.addEventListener('change', e => {
          const c = data.clients.find(x => String(x._id) === e.target.value);
          if (!c) return;
          for (const [k, v] of [['clientName', c.company || c.name], ['clientPhone', c.phone], ['clientEmail', c.email], ['address', c.address]]) {
            const inp = form.querySelector(`[name=${k}]`);
            if (inp && !inp.value && v) inp.value = v;
          }
        });
        // Pakiet firmowy (licznik wykorzystania)
        if (can('sales')) {
          api('/v2/packages').then(r => {
            const subs = r.subs.filter(s => s.status === 'active');
            if (!subs.length) return;
            el.querySelector('[data-pkg]').innerHTML = fieldHtml({ name: 'packageSub', label: 'W ramach pakietu firmowego', type: 'select', value: t.packageSub || '', options: [['', '— nie —'], ...subs.map(s => [s._id, `${s.clientName} · ${s.planName} (${s.usage.used}${s.usage.limit !== null ? '/' + s.usage.limit : ''})`])] });
          }).catch(() => null);
        }
        el.querySelector('[data-save]').addEventListener('click', e => busy(e.currentTarget, async () => {
          const v = readForm(form);
          if (!v.name) throw new Error('Podaj nazwę zlecenia');
          if (!v.dateStart) throw new Error('Podaj termin');
          const body = { ...v, workers: [...selected].map(id => ({ employee: id })) };
          if (body.client === '') body.client = null;
          if (body.vehicle === '') body.vehicle = null;
          if (body.branch === '') body.branch = null;
          if (body.dateEnd === '') body.dateEnd = null;
          if (body.packageSub === '') body.packageSub = null;
          const r = task ? await api(`/tasks/${task._id}`, { method: 'PUT', body }) : await api('/tasks', { method: 'POST', body });
          saved = r.task;
          await reloadData().catch(() => null);
          toast(task ? 'Zapisano zmiany' : 'Dodano zlecenie', 'ok');
          S.hooks.refreshBadges?.();
          done();
          if (!task && !location.hash.includes('/zlecenia/')) go('zlecenia/' + saved._id);
        }));
        el.querySelector('[data-del]')?.addEventListener('click', async e => {
          const { confirmBox } = await import('./core.js');
          if (!await confirmBox(`Usunąć zlecenie „${task.name}”? Tego nie da się cofnąć.`, { ok: 'Usuń', danger: true })) return;
          await busy(e.currentTarget, async () => {
            await api(`/tasks/${task._id}`, { method: 'DELETE' });
            await reloadData().catch(() => null);
            toast('Usunięto zlecenie', 'ok');
            done();
            go('zlecenia');
          });
        });
      }
    });
    void close;
    void toLocalInput;
  });
}
