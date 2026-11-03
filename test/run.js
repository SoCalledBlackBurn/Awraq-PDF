// npm test  — runs every *.test.js file in this folder (or the ones named on the command line)
const fs = require('fs'), path = require('path'); const { failed } = require('./helpers');
(async () => {
  const only = process.argv.slice(2); const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && (!only.length || only.some(o => f.includes(o)))).sort();
  for (const f of files) { console.log('\n' + f); try { await require(path.join(__dirname, f))(); } catch (e) { console.log('  ✗ crashed: ' + (e.stack || e)); process.exitCode = 1; } }
  console.log(failed() || process.exitCode ? '\nSome tests failed.' : '\nAll tests passed.'); process.exit(process.exitCode || 0);
})();
