// Paste into script.google.com (bound to a Google Sheet via Extensions > Apps Script), then Deploy > Web app (Execute as: Me, Access: Anyone).
function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  write(ss, 'Entries', ['Date','Type','Category','Description','Amount','Account','To account','Person','One-off'], d.entries);
  write(ss, 'Balances', ['Date','Account','Balance'], d.balances);
  return ContentService.createTextOutput('ok');
}
function write(ss, name, head, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.getRange(1,1,1,head.length).setValues([head]).setFontWeight('bold');
  if (rows.length) sh.getRange(2,1,rows.length,head.length).setValues(rows);
  sh.setFrozenRows(1);
}
