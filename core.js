// Pure logic: parsing notepad lines, classifying, balance effects, reconciliation, summaries.
(function (root) {
  const ACCOUNTS = ['HBL', 'Easypaisa', 'JazzCash', 'Cash', 'Meezan'];
  const TYPES = {
    expense: 'Expense', income: 'Income', transfer: 'Move money',
    loan_in: 'Borrowed (money in)', loan_out: 'Repaid / lent (money out)',
    invest_in: 'Invest (HBL → Meezan)', invest_out: 'Withdraw (Meezan → HBL)'
  };
  const CATS = ['Car', 'Bike', 'Tea & Snacks', 'Cigarettes', 'Eating Out', 'Groceries', 'Medical', 'Home',
    'Bills', 'Family', 'Pets', 'Shopping', 'Travel', 'Education', 'Donation', 'Fees & Documents', 'Misc', 'Other'];
  const DEFAULT_ACCT = { Car: 'JazzCash', Bike: 'JazzCash', 'Tea & Snacks': 'Easypaisa', Cigarettes: 'Easypaisa',
    'Eating Out': 'Easypaisa', Groceries: 'Easypaisa', Misc: 'Easypaisa', Other: 'Easypaisa' };

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  function effects(e) {
    const a = +e.amount;
    switch (e.type) {
      case 'expense': case 'loan_out': return [[e.acct, -a]];
      case 'income': case 'loan_in': return [[e.acct, a]];
      case 'transfer': return [[e.acct, -a], [e.to, a]];
      case 'invest_in': return [[e.acct, -a], ['Meezan', a]];
      case 'invest_out': return [['Meezan', -a], [e.acct, a]];
    }
    return [];
  }

  function classify(descRaw, amount) {
    const d = descRaw.toLowerCase();
    const r = { type: 'expense', cat: 'Other', acct: 'HBL', to: '', person: '', oneoff: false, check: false };
    let m;
    if (/salary|freelanc|incentive|reward/.test(d)) {
      r.type = 'income'; r.acct = 'HBL';
      r.cat = /salary/.test(d) ? 'Salary' : /freelanc/.test(d) ? 'Freelance' : 'Incentive';
      return r;
    }
    if ((m = d.match(/borrowed from (\w+)/))) { r.type = 'loan_in'; r.person = cap(m[1]); r.cat = 'Loan'; return r; }
    if (/withdraw/.test(d) && /meezan|mcf/.test(d)) { r.type = 'invest_out'; r.cat = 'Investment'; return r; }
    if (/from mcf/.test(d)) { r.cat = /pte/.test(d) ? 'Education' : 'Other'; r.acct = 'Meezan'; r.check = true; return r; }
    if (/sent to mcf|^meezan (cash|islamic) fund/.test(d)) { r.type = 'invest_in'; r.cat = 'Investment'; return r; }
    if ((m = d.match(/sent to (easypaisa|jazzcash) account/))) {
      r.type = 'transfer'; r.to = m[1] === 'easypaisa' ? 'Easypaisa' : 'JazzCash'; r.cat = 'Transfer'; return r;
    }
    if (/r&w|loan (payment|installment)/.test(d)) { r.type = 'loan_out'; r.person = /r&w/.test(d) ? 'R&W' : 'Loan'; r.cat = 'Loan'; r.check = !/r&w/.test(d); return r; }
    if ((m = d.match(/^sent to (asad|ahsan|arslan|umair)\b/))) { r.type = 'loan_out'; r.person = cap(m[1]); r.cat = 'Loan'; r.check = true; return r; }

    const rules = [
      ['Medical', /medicine|checkup|tests\b|hospital|hair transplant|doctor/],
      ['Pets', /simba|cat feed/, true],
      ['Cigarettes', /\bcig/],
      ['Education', /\bpte\b|alfa|alpha/],
      ['Home', /^home\b|house paint|wood work|cement|water tanker|waterproof|gas cylinder/, /waterproof|gas cylinder|water tanker/],
      ['Bills', /net (bill|fee)|mobile package|\bsim\b|wifi|m-?tag/, false],
      ['Bike', /\bbike\b/],
      ['Car', /\bcar\b|engine|timing belt|clutch|brake|coolant|generator|wiper|battery|gear|excel|goda/],
      ['Car', /m-?tag/],
      ['Car', /^petrol/, true],
      ['Tea & Snacks', /\btea\b|rusk|smosa|samosa|snack|ice cream|sweets|chocolate|cream/],
      ['Eating Out', /kfc|pizza|burger|aftari|aftri|sehri|lunch|hotel|bbq|party|roll|dumba|sajji|dampukh|hareesa/],
      ['Groceries', /atta|aata|chicken|eggs?\b|fruit|mango|banana|apple|dates|ispaghol/],
      ['Family', /wife|laiba|rania|mamu/],
      ['Travel', /trip|tour|margalla|kashmir|khushab|indrive/],
      ['Donation', /donation/],
      ['Shopping', /suit|shoes|chappal|perfume|shampoo|laptop|charger|mobile pan|protector|router|signal booster|cloths|clothes|stitching/],
      ['Fees & Documents', /passport|license|birth certificate|learner/],
      ['Misc', /^misc/]
    ];
    // m-tag is a car toll but also in Bills list above; resolve: toll recharges are Car
    if (/m-?tag/.test(d)) { r.cat = 'Car'; }
    else {
      for (const [cat, re, chk] of rules) {
        if (re.test(d)) { r.cat = cat; r.check = chk instanceof RegExp ? chk.test(d) : !!chk; break; }
      }
    }
    if (r.cat === 'Other') r.check = true;
    r.acct = DEFAULT_ACCT[r.cat] || 'HBL';
    if (r.cat === 'Home' && /^home\b/.test(d)) { r.check = false; r.acct = 'HBL'; }
    if (amount >= 50000 && !/^home\b/.test(d)) r.oneoff = true;
    if (/house paint/.test(d)) r.oneoff = true;
    return r;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

  // Parse "dd-mm-yy description amount (optional note)" lines.
  function parseNotes(text) {
    const rows = [], seen = {};
    let prev = '';
    text.split(/\r?\n/).forEach((line, i) => {
      line = line.trim();
      if (!line) return;
      const m = line.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})\s+(.*)$/);
      if (!m) { rows.push({ line: i + 1, raw: line, error: 'No date found' }); return; }
      const yy = m[3].length === 2 ? '20' + m[3] : m[3];
      const date = yy + '-' + pad(+m[2]) + '-' + pad(+m[1]);
      let rest = m[4], notes = [];
      rest = rest.replace(/\(([^)]*)\)/g, (_, n) => { notes.push(n.trim()); return ' '; });
      const nums = [...rest.matchAll(/\d[\d,]*/g)];
      if (!nums.length) { rows.push({ line: i + 1, raw: line, error: 'No amount found' }); return; }
      const last = nums[nums.length - 1];
      const amount = +last[0].replace(/,/g, '');
      let desc = (rest.slice(0, last.index) + ' ' + rest.slice(last.index + last[0].length)).replace(/\s+/g, ' ').trim();
      if (notes.length) desc += ' (' + notes.join('; ') + ')';
      const c = classify(desc, amount);
      const key0 = date + '|' + desc.toLowerCase() + '|' + amount;
      seen[key0] = (seen[key0] || 0) + 1;
      const row = Object.assign({ line: i + 1, date, desc, amount, key: key0 + '|' + seen[key0] }, c);
      row.outOfOrder = !!prev && date < prev;
      if (row.outOfOrder) row.check = true;
      if (date > prev) prev = date;
      rows.push(row);
    });
    return rows;
  }

  // Reconciliation: between two consecutive balance check-ins of an account, the real change minus
  // the logged flows is money that moved without being logged.
  function reconcile(entries, checks, acct) {
    const cs = checks.filter(c => c.acct === acct).sort((a, b) => a.date.localeCompare(b.date));
    const flow = (from, to) => {
      let s = 0;
      for (const e of entries) {
        if (e.date <= from || e.date > to) continue;
        for (const [a, v] of effects(e)) if (a === acct) s += v;
      }
      return s;
    };
    const intervals = [];
    for (let i = 1; i < cs.length; i++) {
      const logged = flow(cs[i - 1].date, cs[i].date);
      const actual = cs[i].amount - cs[i - 1].amount;
      intervals.push({ from: cs[i - 1].date, to: cs[i].date, logged, actual, unlogged: actual - logged });
    }
    const last = cs[cs.length - 1];
    const expectedNow = last ? last.amount + flow(last.date, '9999-12-31') : null;
    return { checks: cs, intervals, last, expectedNow };
  }

  function summarize(entries, checks, month) { // month 'YYYY-MM'
    const out = { income: 0, expense: 0, unloggedOut: 0, unloggedIn: 0, cats: {}, borrowed: 0, repaid: 0, invested: 0, withdrawn: 0, oneoff: 0 };
    for (const e of entries) {
      if (e.date.slice(0, 7) !== month) continue;
      const a = +e.amount;
      if (e.type === 'income') out.income += a;
      else if (e.type === 'expense') {
        if (e.oneoff) out.oneoff += a;
        out.expense += a; out.cats[e.cat] = (out.cats[e.cat] || 0) + a;
      }
      else if (e.type === 'loan_in') out.borrowed += a;
      else if (e.type === 'loan_out') out.repaid += a;
      else if (e.type === 'invest_in') out.invested += a;
      else if (e.type === 'invest_out') out.withdrawn += a;
    }
    for (const acct of ACCOUNTS) {
      for (const iv of reconcile(entries, checks, acct).intervals) {
        if (iv.to.slice(0, 7) !== month) continue;
        if (iv.unlogged < 0) out.unloggedOut += -iv.unlogged; else out.unloggedIn += iv.unlogged;
      }
    }
    return out;
  }

  function loanBalances(entries) {
    const p = {};
    for (const e of entries) {
      if (e.type === 'loan_in') p[e.person || '?'] = (p[e.person || '?'] || 0) + +e.amount; // I owe them
      if (e.type === 'loan_out') p[e.person || '?'] = (p[e.person || '?'] || 0) - +e.amount;
    }
    return p; // positive = I owe them, negative = they owe me / overpaid
  }

  const api = { ACCOUNTS, TYPES, CATS, DEFAULT_ACCT, effects, classify, parseNotes, reconcile, summarize, loanBalances, ymd, pad };
  if (typeof module !== 'undefined') module.exports = api; else root.Core = api;
})(this);
