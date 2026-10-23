'use strict';

/**
 * 9.1: panel dewelopera — wspólna logika tworzenia zgłoszenia nabywcy (z panelu dewelopera albo ze strony odbior.html).
 * Każdy lead = zlecenie w RevMi (Wyceny), z rabatem z inwestycji w opisie, oraz powiadomienie dla biura.
 */
const { randomBytes } = require('crypto');
const { DevLead, DevInvestment, Account } = require('../models-v9');
const portal = require('./portal');
const { recordActivity } = require('./activity');

const dayFmt = d => (d ? new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)) : 'Do ustalenia');

/** Unikalny, łatwy do przepisania kod inwestycji (bez mylących znaków 0/O, 1/I). */
async function uniqueCode(name = '') {
    const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const base = String(name).normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4).padEnd(3, 'X');
    for (let i = 0; i < 20; i++) {
        const tail = Array.from(randomBytes(3), b => ALPH[b % ALPH.length]).join('');
        const code = (base + tail).slice(0, 8);
        if (!await DevInvestment.exists({ code })) return code;
    }
    return randomBytes(4).toString('hex').toUpperCase();
}

async function createLead({ inv, data, via, agent = null }) {
    const number = await portal.nextNumber('DEW');
    const lead = await DevLead.create({
        ...data,
        investment: inv._id,
        developer: inv.account,
        via,
        number
    });
    const developer = await Account.findById(inv.account).select('name email company').lean();
    const company = developer?.company || developer?.name || 'Deweloper';
    const task = await portal.createPortalTask({
        name: `Odbiór mieszkania (${inv.name}): ${data.services.join(', ')}`.slice(0, 160),
        type: data.services[0].slice(0, 80),
        division: 'revhome',
        source: `Deweloper: ${company}`.slice(0, 80),
        portalKind: 'developer',
        portalRef: lead._id,
        clientName: data.name,
        clientPhone: data.phone,
        clientEmail: data.email,
        addressFrom: data.fromAddress,
        addressTo: [inv.address, inv.city, data.unit ? 'lok. ' + data.unit : ''].filter(Boolean).join(', '),
        clientPreferredDate: dayFmt(data.moveDate),
        desc: [
            `Termin zgłoszony przez klienta: ${dayFmt(data.moveDate)}`, '',
            `Nabywca z inwestycji „${inv.name}” (${company})${via === 'buyer' ? ' — zgłosił się sam kodem inwestycji' : ` — zgłoszony przez ${agent || company}`}.`,
            `Usługi: ${data.services.join(', ')}`,
            data.handoverDate ? `Odbiór kluczy: ${dayFmt(data.handoverDate)}` : '',
            inv.discountPct ? `RABAT dla nabywców tej inwestycji: ${inv.discountPct}%` : '',
            data.notes ? `\nUwagi: ${data.notes}` : ''
        ].filter(Boolean).join('\n').slice(0, 4000)
    });
    await DevLead.updateOne({ _id: lead._id }, { $set: { task: task._id } });
    lead.task = task._id;
    void recordActivity('dev_lead', `Deweloper ${number}: ${data.name} (${inv.name})`, 'DevLead', lead._id, via === 'buyer' ? 'Strona odbior.html' : (agent || company));
    void portal.notifyAdmins({ type: 'portal', title: '🏗️ Nabywca od dewelopera', body: `${inv.name} · ${data.name} · ${data.services.join(', ')}`, url: `/revmi/#/zlecenia/${task._id}`, dedupeKey: `devlead:${lead._id}` });
    if (via === 'buyer' && developer?.email) {
        void portal.sendMail({ to: developer.email, subject: `Nabywca z „${inv.name}” zgłosił się do RevSerwis`, title: 'Nowe zgłoszenie z Twojej inwestycji', text: `${data.name}${data.unit ? ' (lokal ' + data.unit + ')' : ''} zamówił(a): ${data.services.join(', ')}. Status zobaczysz w panelu dewelopera.`, cta: { label: 'Panel dewelopera', url: portal.accountUrl('deweloper') } });
    }
    return lead;
}

module.exports = { uniqueCode, createLead };
