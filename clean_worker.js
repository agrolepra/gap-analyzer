const fs = require('fs');
const path = '/home/jose/xerebrum/sites/I/ivanbarbero/worker/src/index.js';
const c = fs.readFileSync(path, 'utf8');
const firstExport = c.indexOf('export default');
const secondExport = c.indexOf('export default', firstExport + 1);
if (secondExport > 0) {
  const clean = c.substring(0, secondExport - 1);
  fs.writeFileSync(path, clean);
  console.log('Cleaned! Lines:', clean.split('\n').length);
} else {
  console.log('No duplicate found');
}
