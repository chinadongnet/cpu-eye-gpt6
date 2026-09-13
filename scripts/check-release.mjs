import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const log = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
assert.match(pkg.version, /^\d+\.\d+\.\d+$/, '版本号须为 major.minor.patch');
assert.equal(lock.version, pkg.version, 'package-lock.json 顶层版本不同步');
assert.equal(lock.packages[''].version, pkg.version, 'package-lock.json 根包版本不同步');
const latest = log.match(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\s*$/m);
assert.equal(latest?.[1], pkg.version, '更新日志最新条目须与当前版本一致并包含日期');
const body = log.slice(latest.index + latest[0].length).split(/^## /m)[0];
assert.match(body, /^- .+/m, '最新版本须包含实际更新内容');

const base = process.argv[2];
if (base) {
  assert.match(base, /^[a-f0-9]{40}$/, '基准须为完整 Git commit SHA');
  const previous = JSON.parse(execFileSync('git', ['show', `${base}:package.json`], { encoding: 'utf8' }));
  const [major, minor, patch] = previous.version.split('.').map(Number);
  assert.equal(pkg.version, `${major}.${minor}.${patch + 1}`, '每次更新须相对 main 增加一个补丁版本号');
  const previousLog = execFileSync('git', ['ls-tree', '--name-only', base, 'CHANGELOG.md'], { encoding: 'utf8' }).trim();
  if (previousLog) assert.notEqual(log, execFileSync('git', ['show', `${base}:CHANGELOG.md`], { encoding: 'utf8' }), '本次更新必须修改更新日志');
}
console.log(`Release metadata OK: v${pkg.version}`);
