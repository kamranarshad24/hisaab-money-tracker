(function () {
  const C = Core, $ = s => document.querySelector(s);
  const KEY = 'hisaab.v1';
  const DEFAULT_QUICK = [
    ['Tea', 'Tea & Snacks', 'Easypaisa'], ['Cigarettes', 'Cigarettes', 'Easypaisa'], ['Bike petrol', 'Bike', 'JazzCash'],
    ['Car petrol', 'Car', 'JazzCash'], ['Eggs', 'Groceries', 'Easypaisa'], ['Chicken', 'Groceries', 'Easypaisa'],
    ['Medicine', 'Medical', 'HBL'], ['Net bill', 'Bills', 'HBL'], ['Mobile package', 'Bills', 'HBL']
  ];
  let S = load();
  let tab = 'today', month = C.ymd(new Date()).slice(0, 7), importRows = [];

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return s; } catch (e) {}
    return { entries: [], checks: [], settings: { quick: DEFAULT_QUICK, sheetUrl: '', lastBackup: '' } };
  }
  let backupTimer;
  function save() {
    localStorage.setItem(KEY, JSON.stringify(S));
    if (S.settings.sheetUrl) { clearTimeout(backupTimer); backupTimer = setTimeout(() => backup(true), 4000); }
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => 'Rs ' + Math.round(n).toLocaleString('en-US');
  const today = () => C.ymd(new Date());
  const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return C.ymd(d); };
  const dayName = ymd => new Date(ymd + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const monthName = m => new Date(m + '-15T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function toast(t) { const el = $('#toast'); el.textContent = t; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 2200); }
  const opts = (arr, sel) => arr.map(a => `<option ${a === sel ? 'selected' : ''}>${esc(a)}</option>`).join('');
  const allCats = () => [...new Set([...C.CATS, ...S.entries.filter(e => e.type === 'expense').map(e => e.cat)])];

  // ---------- Today ----------
  function renderToday() {
    const t = today(), days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(t, -i));
    const empty = days.filter(d => !S.entries.some(e => e.date === d));
    const mon = C.summarize(S.entries, S.checks, t.slice(0, 7));
    let h = `<div class="card"><h2>Quick add</h2><div class="grid">${S.settings.quick.map((q, i) => `<button class="q" data-q="${i}">${esc(q[0])}</button>`).join('')}</div></div>`;
    h += `<div class="card"><div class="stats"><div><div class="mute">This month spent</div><div class="big">${money(mon.expense + mon.unloggedOut)}</div></div><div><div class="mute">This month income</div><div class="big good">${money(mon.income)}</div></div></div>`;
    if (mon.unloggedOut > 0) h += `<div class="mute" style="margin-top:8px">Includes <b class="bad">${money(mon.unloggedOut)}</b> unlogged (found by balance check)</div>`;
    h += `</div>`;
    if (empty.length) h += `<div class="card"><h2>Nothing logged on…</h2><div class="mute">Tap a day to add what you remember</div>${empty.map(d => `<span class="pill btnlike" data-day="${d}">${dayName(d)}</span>`).join('')}</div>`;
    h += `<div class="card"><h2>Recent</h2>`;
    const recent = [...S.entries].sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1)).slice(0, 40);
    if (!recent.length) h += `<div class="mute">No entries yet. Use Quick add, the + button, or import your notepad in Settings.</div>`;
    let lastD = '';
    for (const e of recent) {
      if (e.date !== lastD) { h += `<div class="mute" style="margin-top:8px"><b>${dayName(e.date)}</b></div>`; lastD = e.date; }
      h += `<div class="row" data-edit="${e.id}"><div>${esc(e.desc || e.cat)}<div class="mute">${esc(e.type === 'expense' ? e.cat : C.TYPES[e.type])} · ${esc(e.acct)}${e.to ? ' → ' + esc(e.to) : ''}${e.person ? ' · ' + esc(e.person) : ''}${e.oneoff ? ' · one-off' : ''}</div></div><b class="${e.type === 'income' || e.type === 'loan_in' ? 'good' : ''}">${money(e.amount)}</b></div>`;
    }
    $('#t-today').innerHTML = h + `</div>`;
  }

  // ---------- Entry sheet ----------
  function openEntry(pre) {
    const e = Object.assign({ id: '', date: today(), type: 'expense', amount: '', desc: '', cat: 'Other', acct: 'Easypaisa', to: '', person: '', oneoff: false }, pre || {});
    const sh = $('#sheetBody');
    sh.innerHTML = `<h2 style="margin:0">${e.id ? 'Edit entry' : 'Add entry'}</h2>
      <label>Amount</label><input class="amt" id="f-amount" type="number" inputmode="numeric" value="${esc(e.amount)}" placeholder="0">
      <label>Type</label><select id="f-type">${Object.entries(C.TYPES).map(([k, v]) => `<option value="${k}" ${k === e.type ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label>Description</label><input id="f-desc" value="${esc(e.desc)}" placeholder="e.g. tea at office">
      <div id="f-catw"><label>Category</label><input id="f-cat" list="catlist" value="${esc(e.cat)}"><datalist id="catlist">${allCats().map(c => `<option>${esc(c)}</option>`).join('')}</datalist></div>
      <label id="f-acctl">Account</label><select id="f-acct">${opts(C.ACCOUNTS, e.acct)}</select>
      <div id="f-tow"><label>To account</label><select id="f-to">${opts(C.ACCOUNTS, e.to || 'Easypaisa')}</select></div>
      <div id="f-pw"><label>Person / lender</label><input id="f-person" value="${esc(e.person)}"></div>
      <label>Date</label><input id="f-date" type="date" value="${e.date}">
      <label><input type="checkbox" id="f-oneoff" ${e.oneoff ? 'checked' : ''}> One-off (exclude from monthly averages)</label>
      <div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="f-save" style="flex:1">Save</button>${e.id ? '<button class="btn danger" id="f-del">Delete</button>' : ''}<button class="btn sec" id="f-cancel">Cancel</button></div>`;
    $('#sheet').classList.add('open');
    const sync = () => {
      const t = $('#f-type').value;
      $('#f-catw').style.display = t === 'expense' ? '' : 'none';
      $('#f-tow').style.display = t === 'transfer' ? '' : 'none';
      $('#f-pw').style.display = t === 'loan_in' || t === 'loan_out' ? '' : 'none';
      $('#f-acctl').textContent = t === 'transfer' ? 'From account' : t === 'invest_out' ? 'Into account' : t === 'income' || t === 'loan_in' ? 'Received in' : 'Paid from';
    };
    $('#f-type').onchange = sync; sync();
    $('#f-cat').onchange = () => { const a = S.settings.catAcct && S.settings.catAcct[$('#f-cat').value] || C.DEFAULT_ACCT[$('#f-cat').value]; if (a && !e.id) $('#f-acct').value = a; };
    $('#f-cancel').onclick = closeSheet;
    if (e.id) $('#f-del').onclick = () => { if (confirm('Delete this entry?')) { S.entries = S.entries.filter(x => x.id !== e.id); save(); closeSheet(); render(); } };
    $('#f-save').onclick = () => {
      const amount = +$('#f-amount').value;
      if (!(amount > 0)) { toast('Enter an amount'); return; }
      const n = { id: e.id || uid(), date: $('#f-date').value || today(), type: $('#f-type').value, amount, desc: $('#f-desc').value.trim(),
        cat: $('#f-cat').value.trim() || 'Other', acct: $('#f-acct').value, to: $('#f-to').value, person: $('#f-person').value.trim(), oneoff: $('#f-oneoff').checked };
      if (n.type !== 'transfer') n.to = '';
      if (n.type !== 'expense') n.cat = C.TYPES[n.type];
      if (n.type === 'transfer' && n.to === n.acct) { toast('Choose two different accounts'); return; }
      if (n.type === 'expense') { S.settings.catAcct = S.settings.catAcct || {}; S.settings.catAcct[n.cat] = n.acct; }
      const i = S.entries.findIndex(x => x.id === n.id);
      if (i >= 0) S.entries[i] = n; else S.entries.push(n);
      save(); closeSheet(); render(); toast('Saved');
    };
    setTimeout(() => $('#f-amount').focus(), 50);
  }
  function closeSheet() { $('#sheet').classList.remove('open'); }

  // ---------- Reports ----------
  function renderReports() {
    const s = C.summarize(S.entries, S.checks, month);
    const cats = Object.entries(s.cats).sort((a, b) => b[1] - a[1]);
    const total = s.expense + s.unloggedOut, max = Math.max(1, ...cats.map(c => c[1]), s.unloggedOut);
    let h = `<div class="card" style="display:flex;justify-content:space-between;align-items:center"><button class="btn sec sm" id="mPrev">‹</button><b>${monthName(month)}</b><button class="btn sec sm" id="mNext">›</button></div>`;
    h += `<div class="card"><div class="stats"><div><div class="mute">Income</div><div class="big good">${money(s.income)}</div></div><div><div class="mute">Spent (incl. unlogged)</div><div class="big">${money(total)}</div></div>
      <div><div class="mute">Left from income</div><div class="big ${s.income - total < 0 ? 'bad' : ''}">${money(s.income - total)}</div></div><div><div class="mute">One-off spending</div><div class="big">${money(s.oneoff)}</div></div></div>
      <div class="mute" style="margin-top:8px">Not counted as spending: invested ${money(s.invested)}, withdrawn ${money(s.withdrawn)}, borrowed ${money(s.borrowed)}, repaid/lent ${money(s.repaid)}.</div></div>`;
    h += `<div class="card"><h2>By category</h2>`;
    if (s.unloggedOut > 0) h += `<div><div class="row" style="border:0"><span class="bad">⚠ Unlogged (from balance checks)</span><b>${money(s.unloggedOut)}</b></div><div class="bar un" style="width:${s.unloggedOut / max * 100}%"></div></div>`;
    h += cats.map(([c, v]) => `<div class="catrow" data-cat="${esc(c)}"><div class="row" style="border:0"><span>${esc(c)}</span><b>${money(v)} <span class="mute">${total ? Math.round(v / total * 100) : 0}%</span></b></div><div class="bar" style="width:${v / max * 100}%"></div></div>`).join('');
    if (!cats.length && !s.unloggedOut) h += `<div class="mute">Nothing logged this month.</div>`;
    h += `</div><div class="card"><h2>Last 6 months – spending</h2>`;
    const ms = []; let m = month; for (let i = 0; i < 6; i++) { ms.unshift(m); const d = new Date(m + '-15T12:00:00'); d.setMonth(d.getMonth() - 1); m = C.ymd(d).slice(0, 7); }
    const vals = ms.map(x => { const r = C.summarize(S.entries, S.checks, x); return [x, r.expense + r.unloggedOut, r.income]; });
    const vm = Math.max(1, ...vals.map(v => Math.max(v[1], v[2])));
    h += vals.map(([x, sp, inc]) => `<div class="row"><span style="width:70px">${new Date(x + '-15T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</span><div style="flex:1"><div class="bar" style="width:${sp / vm * 100}%"></div><div class="bar" style="background:#86efac;width:${inc / vm * 100}%"></div></div><span class="mute" style="width:130px;text-align:right">${money(sp)} / ${money(inc)}</span></div>`).join('');
    h += `<div class="mute">Teal = spent, green = income</div></div>`;
    $('#t-reports').innerHTML = h;
    $('#mPrev').onclick = () => { shiftMonth(-1); }; $('#mNext').onclick = () => { shiftMonth(1); };
    document.querySelectorAll('.catrow').forEach(el => el.onclick = () => {
      const c = el.dataset.cat, list = S.entries.filter(e => e.type === 'expense' && e.cat === c && e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
      $('#sheetBody').innerHTML = `<h2 style="margin:0">${esc(c)} – ${monthName(month)}</h2>${list.map(e => `<div class="row"><span>${dayName(e.date)} · ${esc(e.desc)}</span><b>${money(e.amount)}</b></div>`).join('')}<button class="btn sec" style="margin-top:12px" id="cl">Close</button>`;
      $('#sheet').classList.add('open'); $('#cl').onclick = closeSheet;
    });
  }
  function shiftMonth(n) { const d = new Date(month + '-15T12:00:00'); d.setMonth(d.getMonth() + n); month = C.ymd(d).slice(0, 7); renderReports(); }

  // ---------- Accounts ----------
  function renderAccounts() {
    let h = `<div class="card"><h2>Balance check</h2><div class="mute">Enter what each account really shows. The app compares it with your entries and finds money you forgot to log. Do it at the end of the day.</div><button class="btn" id="chk" style="margin-top:10px;width:100%">Check balances now</button></div>`;
    for (const a of C.ACCOUNTS) {
      const r = C.reconcile(S.entries, S.checks, a);
      h += `<div class="card"><h2>${a}</h2>`;
      if (!r.last) h += `<div class="mute">No balance check yet.</div>`;
      else {
        h += `<div class="row"><span>Last checked ${dayName(r.last.date)}</span><b>${money(r.last.amount)}</b></div><div class="row"><span>Expected now (from entries)</span><b>${money(r.expectedNow)}</b></div>`;
        h += r.intervals.slice(-3).reverse().map(iv => `<div class="row"><span class="mute">${dayName(iv.from)} → ${dayName(iv.to)}</span><b class="${iv.unlogged < 0 ? 'bad' : 'good'}">${iv.unlogged === 0 ? 'matched ✓' : (iv.unlogged < 0 ? 'unlogged out ' : 'unlogged in ') + money(Math.abs(iv.unlogged))}</b></div>`).join('');
      }
      h += `</div>`;
    }
    const loans = C.loanBalances(S.entries), lp = Object.entries(loans).filter(([, v]) => v !== 0);
    h += `<div class="card"><h2>Loans</h2>${lp.length ? lp.map(([p, v]) => `<div class="row"><span>${esc(p)}</span><b class="${v > 0 ? 'bad' : 'good'}">${v > 0 ? 'you owe ' : 'paid/lent beyond borrowed '}${money(Math.abs(v))}</b></div>`).join('') : '<div class="mute">No loans recorded.</div>'}<div class="mute">Based only on entries logged here; earlier history before you started is not included.</div></div>`;
    const inv = S.entries.reduce((s, e) => s + (e.type === 'invest_in' ? +e.amount : e.type === 'invest_out' ? -e.amount : 0), 0);
    h += `<div class="card"><h2>Meezan funds</h2><div class="row"><span>Net deposited (logged)</span><b>${money(inv)}</b></div><div class="mute">Deposits and withdrawals only, not market value.</div></div>`;
    $('#t-accounts').innerHTML = h;
    $('#chk').onclick = openCheck;
  }
  function openCheck() {
    const rows = C.ACCOUNTS.map(a => { const r = C.reconcile(S.entries, S.checks, a); return `<label>${a}${r.expectedNow != null ? ` <span class="mute">(expected ${money(r.expectedNow)})</span>` : ''}</label><input type="number" inputmode="numeric" class="cb" data-a="${a}" data-exp="${r.expectedNow == null ? '' : r.expectedNow}" placeholder="leave empty to skip"><div class="mute cd" data-a="${a}"></div>`; }).join('');
    $('#sheetBody').innerHTML = `<h2 style="margin:0">Balance check</h2><label>Date (end of day)</label><input type="date" id="cdate" value="${today()}">${rows}<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="cs" style="flex:1">Save</button><button class="btn sec" id="cc">Cancel</button></div>`;
    $('#sheet').classList.add('open'); $('#cc').onclick = closeSheet;
    document.querySelectorAll('.cb').forEach(i => i.oninput = () => {
      const d = document.querySelector(`.cd[data-a="${i.dataset.a}"]`);
      if (i.value === '' || i.dataset.exp === '') { d.textContent = ''; return; }
      const diff = +i.value - +i.dataset.exp;
      d.innerHTML = diff === 0 ? 'Matches ✓' : diff < 0 ? `<span class="bad">${money(-diff)} less than expected – unlogged spending</span>` : `<span class="good">${money(diff)} more than expected – unlogged income</span>`;
    });
    $('#cs').onclick = () => {
      const date = $('#cdate').value; let n = 0;
      document.querySelectorAll('.cb').forEach(i => { if (i.value !== '') { S.checks = S.checks.filter(c => !(c.acct === i.dataset.a && c.date === date)); S.checks.push({ id: uid(), date, acct: i.dataset.a, amount: +i.value }); n++; } });
      if (!n) { toast('Enter at least one balance'); return; }
      save(); closeSheet(); render(); toast('Balances saved');
    };
  }

  // ---------- Settings ----------
  function renderSettings() {
    const st = S.settings;
    $('#t-settings').innerHTML = `
    <div class="card"><h2>Import from notepad</h2><div class="mute">Paste lines like <code>04-01-26 Tea 100</code>. You review everything before it is added. Re-importing the same lines will not duplicate.</div><textarea id="imp" rows="5" placeholder="Paste here"></textarea><button class="btn" id="impGo" style="margin-top:8px">Read &amp; review</button></div>
    <div class="card"><h2>Export for Excel</h2><button class="btn sec" id="exE">Entries (CSV)</button> <button class="btn sec" id="exM">Monthly by category (CSV)</button> <button class="btn sec" id="exB">Balance checks (CSV)</button><div class="mute" style="margin-top:6px">CSV files open directly in Excel.</div></div>
    <div class="card"><h2>Google Sheet backup</h2><div class="mute">Paste the Web App URL from the Apps Script (see SETUP.md). Data is sent after each change.</div><input id="url" value="${esc(st.sheetUrl)}" placeholder="https://script.google.com/macros/s/…/exec"><div style="margin-top:8px"><button class="btn sec" id="urlSave">Save URL</button> <button class="btn sec" id="bkNow">Back up now</button></div><div class="mute">Last backup: ${st.lastBackup ? new Date(st.lastBackup).toLocaleString() : 'never'}</div></div>
    <div class="card"><h2>Reminders</h2><div class="mute">A web app cannot reliably ring when closed, so use your phone's calendar: download, open, and add. It repeats and rings on its own.</div><button class="btn sec" id="icsD" style="margin-top:8px">Daily 9:00 pm – log today</button> <button class="btn sec" id="icsW" style="margin-top:8px">Sunday 9:30 pm – balance check</button></div>
    <div class="card"><h2>Quick buttons</h2><div class="mute">One per line: Label | Category | Account</div><textarea id="qk" rows="7">${esc(st.quick.map(q => q.join(' | ')).join('\n'))}</textarea><button class="btn sec" id="qkSave" style="margin-top:8px">Save buttons</button></div>
    <div class="card"><h2>Device backup</h2><button class="btn sec" id="jsonE">Download backup file</button> <button class="btn sec" id="jsonI">Restore from file</button><input type="file" id="jsonF" accept=".json" style="display:none"><div style="margin-top:12px"><button class="btn danger sm" id="wipe">Erase all data on this phone</button></div></div>`;
    $('#impGo').onclick = () => startImport($('#imp').value);
    $('#exE').onclick = () => dl('hisaab-entries.csv', csv([['Date', 'Type', 'Category', 'Description', 'Amount', 'Account', 'To account', 'Person', 'One-off'], ...[...S.entries].sort((a, b) => a.date.localeCompare(b.date)).map(e => [e.date, C.TYPES[e.type], e.cat, e.desc, e.amount, e.acct, e.to, e.person, e.oneoff ? 'yes' : ''])]));
    $('#exM').onclick = () => {
      const ms = [...new Set(S.entries.map(e => e.date.slice(0, 7)))].sort(), cs = allCats(), rows = [['Month', 'Income', ...cs, 'Unlogged', 'Total spent']];
      ms.forEach(m => { const r = C.summarize(S.entries, S.checks, m); rows.push([m, r.income, ...cs.map(c => r.cats[c] || 0), r.unloggedOut, r.expense + r.unloggedOut]); });
      dl('hisaab-monthly.csv', csv(rows));
    };
    $('#exB').onclick = () => dl('hisaab-balances.csv', csv([['Date', 'Account', 'Balance'], ...S.checks.map(c => [c.date, c.acct, c.amount])]));
    $('#urlSave').onclick = () => { S.settings.sheetUrl = $('#url').value.trim(); save(); toast('Saved'); };
    $('#bkNow').onclick = () => { S.settings.sheetUrl = $('#url').value.trim(); backup(false); };
    $('#icsD').onclick = () => ics('hisaab-daily.ics', 'Log today\'s expenses (Hisaab)', 21, 0, 'DAILY');
    $('#icsW').onclick = () => ics('hisaab-weekly.ics', 'Balance check (Hisaab)', 21, 30, 'WEEKLY;BYDAY=SU');
    $('#qkSave').onclick = () => { S.settings.quick = $('#qk').value.split('\n').map(l => l.split('|').map(x => x.trim())).filter(a => a[0]).map(a => [a[0], a[1] || 'Other', C.ACCOUNTS.includes(a[2]) ? a[2] : 'Easypaisa']); save(); render(); toast('Saved'); };
    $('#jsonE').onclick = () => dl('hisaab-backup.json', JSON.stringify(S), 'application/json');
    $('#jsonI').onclick = () => $('#jsonF').click();
    $('#jsonF').onchange = ev => { const f = ev.target.files[0]; if (!f) return; f.text().then(t => { try { const d = JSON.parse(t); if (!d.entries) throw 0; if (confirm('Replace all data on this phone with the backup?')) { S = d; save(); render(); toast('Restored'); } } catch (e) { toast('Not a valid backup'); } }); };
    $('#wipe').onclick = () => { if (confirm('Erase ALL entries and balances on this phone?') && confirm('Really erase? This cannot be undone.')) { S = load.call(null, localStorage.removeItem(KEY)); save(); render(); } };
  }
  const csv = rows => '﻿' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');
  function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/csv;charset=utf-8' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  function ics(name, title, h, m, rule) {
    const d = new Date(); const st = `${d.getFullYear()}${C.pad(d.getMonth() + 1)}${C.pad(d.getDate())}T${C.pad(h)}${C.pad(m)}00`;
    const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hisaab//EN', 'BEGIN:VEVENT', 'UID:' + uid() + '@hisaab', 'DTSTAMP:' + st, 'DTSTART:' + st, 'RRULE:FREQ=' + rule, 'SUMMARY:' + title,
      'DESCRIPTION:Open Hisaab: ' + location.href.split('#')[0], 'URL:' + location.href.split('#')[0], 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + title, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    dl(name, text, 'text/calendar');
  }

  // ---------- Import review ----------
  function startImport(text) {
    importRows = C.parseNotes(text);
    const have = new Set(S.entries.map(e => e.key).filter(Boolean));
    importRows.forEach(r => { if (!r.error && have.has(r.key)) r.dup = true; });
    const good = importRows.filter(r => !r.error && !r.dup), bad = importRows.filter(r => r.error), dup = importRows.filter(r => r.dup);
    const cats = allCats();
    let h = `<h2 style="margin:0">Review import</h2><div class="mute">${good.length} to add · ${dup.length} already imported · ${bad.length} unreadable. Yellow rows need your check (uncertain category, or date out of order — e.g. a typo in the month).</div>
      <div style="overflow:auto;max-height:55vh;margin-top:8px"><table><tr><th></th><th>Date</th><th>Item</th><th>Rs</th><th>Type</th><th>Category / person</th><th>Acct</th></tr>`;
    importRows.forEach((r, i) => {
      if (r.error) { h += `<tr class="chk"><td></td><td colspan="6">Line ${r.line}: ${esc(r.raw)} — <b>${r.error}</b></td></tr>`; return; }
      if (r.dup) return;
      h += `<tr class="${r.check ? 'chk' : ''}"><td><input type="checkbox" data-i="${i}" class="ik" checked></td><td><input type="date" data-i="${i}" data-k="date" value="${r.date}" style="width:125px"></td><td>${esc(r.desc)}</td><td>${r.amount}</td>
        <td><select data-i="${i}" data-k="type">${Object.entries(C.TYPES).map(([k, v]) => `<option value="${k}" ${k === r.type ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><input data-i="${i}" data-k="cat" list="catlist2" value="${esc(r.type === 'loan_in' || r.type === 'loan_out' ? r.person : r.cat)}" style="width:110px"></td>
        <td><select data-i="${i}" data-k="acct">${opts(C.ACCOUNTS, r.acct)}</select></td></tr>`;
    });
    h += `</table></div><datalist id="catlist2">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</datalist>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" id="impOk" style="flex:1">Add selected</button><button class="btn sec" id="impNo">Cancel</button></div>`;
    $('#sheetBody').innerHTML = h; $('#sheet').classList.add('open');
    document.querySelectorAll('#sheetBody [data-k]').forEach(el => el.onchange = () => {
      const r = importRows[+el.dataset.i], k = el.dataset.k;
      if (k === 'cat') { if (r.type === 'loan_in' || r.type === 'loan_out') r.person = el.value; else r.cat = el.value; } else r[k] = el.value;
    });
    $('#impNo').onclick = closeSheet;
    $('#impOk').onclick = () => {
      let n = 0;
      document.querySelectorAll('.ik').forEach(cb => {
        if (!cb.checked) return; const r = importRows[+cb.dataset.i];
        S.entries.push({ id: uid(), key: r.key, date: r.date, type: r.type, amount: r.amount, desc: r.desc, cat: r.type === 'expense' ? r.cat : C.TYPES[r.type], acct: r.acct, to: r.to || '', person: r.person || '', oneoff: !!r.oneoff }); n++;
      });
      save(); closeSheet(); render(); toast(n + ' entries added');
    };
  }

  // ---------- Google Sheet backup ----------
  function backup(silent) {
    const url = S.settings.sheetUrl; if (!url) { if (!silent) toast('Add the Sheet URL first'); return; }
    const payload = { entries: S.entries.map(e => [e.date, C.TYPES[e.type], e.cat, e.desc, e.amount, e.acct, e.to, e.person, e.oneoff ? 'yes' : '']), balances: S.checks.map(c => [c.date, c.acct, c.amount]) };
    fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) })
      .then(() => { S.settings.lastBackup = new Date().toISOString(); localStorage.setItem(KEY, JSON.stringify(S)); $('#hdrSync').textContent = '☁ backed up'; if (!silent) { toast('Backup sent'); renderSettings(); } })
      .catch(() => { $('#hdrSync').textContent = '☁ backup failed'; if (!silent) toast('Backup failed – check connection'); });
  }

  // ---------- Wiring ----------
  function render() { ({ today: renderToday, reports: renderReports, accounts: renderAccounts, settings: renderSettings })[tab](); }
  function show(t) { tab = t; document.querySelectorAll('.tabs').forEach(s => s.classList.toggle('on', s.id === 't-' + t)); document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); render(); window.scrollTo(0, 0); }
  $('#nav').onclick = ev => { const b = ev.target.closest('button'); if (b) show(b.dataset.t); };
  $('#fab').onclick = () => openEntry();
  $('#sheet').onclick = ev => { if (ev.target.id === 'sheet') closeSheet(); };
  $('#t-today').onclick = ev => {
    const q = ev.target.closest('[data-q]'), d = ev.target.closest('[data-day]'), ed = ev.target.closest('[data-edit]');
    if (q) { const [label, cat, acct] = S.settings.quick[+q.dataset.q]; openEntry({ desc: label, cat, acct }); }
    else if (d) openEntry({ date: d.dataset.day });
    else if (ed) openEntry(S.entries.find(e => e.id === ed.dataset.edit));
  };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  show('today');
})();
