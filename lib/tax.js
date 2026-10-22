'use strict';

/**
 * Szacunek podatku dochodowego (PIT) — zasady ogólne (skala podatkowa).
 * Domyślnie: 12% dochodu (przychód − koszty), a od nadwyżki ponad próg roczny (120 000 zł) — 32%.
 * Opcjonalnie kwota zmniejszająca podatek (kwota wolna, np. 30 000 zł → 3 600 zł ulgi).
 * To szacunek do planowania — nie uwzględnia składek ZUS i zdrowotnej, ulg ani zaliczek już wpłaconych.
 */
const round2 = v => Math.round((Number(v) || 0) * 100) / 100;

function taxOnIncome(income, { rate = 12, upperRate = 32, threshold = 120000, freeAmount = 0 } = {}) {
    const base = Math.max(0, Number(income) || 0);
    const r = (Number(rate) || 0) / 100;
    const ur = (Number(upperRate) || 0) / 100;
    const th = Number(threshold) || 0;
    let tax = th > 0 && base > th ? th * r + (base - th) * ur : base * r;
    tax -= Math.max(0, Number(freeAmount) || 0) * r;
    return round2(Math.max(0, tax));
}

/**
 * Podatek narastająco w roku: podatek za miesiąc = podatek(dochód od początku roku do końca miesiąca) − podatek(do końca poprzedniego).
 * months: [{ key:'YYYY-MM', revenue, expenses }] posortowane od stycznia.
 */
function yearlyTax(months, opts = {}) {
    let cumulative = 0;
    let paid = 0;
    return months.map(m => {
        const profit = (Number(m.revenue) || 0) - (Number(m.expenses) || 0);
        cumulative += profit;
        const dueToDate = taxOnIncome(cumulative, opts);
        const tax = round2(Math.max(0, dueToDate - paid));
        paid += tax;
        return { ...m, profit: round2(profit), cumulativeProfit: round2(cumulative), tax, taxToDate: round2(paid) };
    });
}

module.exports = { taxOnIncome, yearlyTax };
