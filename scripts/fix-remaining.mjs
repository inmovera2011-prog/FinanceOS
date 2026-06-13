import { readFileSync, writeFileSync } from 'fs';

const replacements = {
  '\u{1F7E2}': '<span class="badge-dot" style="color:#10b981">\u25CF</span>',
  '\u{1F7E1}': '<span class="badge-dot" style="color:#f59e0b">\u25CF</span>',
  '\u{1F7E0}': '<span class="badge-dot" style="color:#f97316">\u25CF</span>',
  '\u{1F535}': '<span class="badge-dot" style="color:#38bdf8">\u25CF</span>',
};

for (const f of ['user-app.js','agent-app.js','broker-app.js']) {
  const fp = 'C:/Users/Inmov/Downloads/financeos-app/js/' + f;
  let c = readFileSync(fp, 'utf-8');
  for (const [emoji, repl] of Object.entries(replacements)) {
    c = c.replaceAll(emoji, repl);
  }
  writeFileSync(fp, c, 'utf-8');
  console.log(f + ' done');
}
