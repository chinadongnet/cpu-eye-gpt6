import { expect, test } from '@playwright/test';
import { examples } from '../../src/examples';
import { createRequire } from 'node:module';

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string };

test.beforeEach(async ({ page }) => {
  // Exercise the local font fallback without depending on Google's font servers.
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
});

test('编译、单步、运行、验证与模型切换', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CPU 实时状态' })).toBeVisible();
  await page.getByRole('button', { name: '单步', exact: true }).click();
  await expect(page.locator('.register').first()).toContainText('000000000000000A');
  await page.getByRole('button', { name: '重置执行', exact: true }).click();
  await page.getByLabel('执行速度').selectOption('120');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(page.locator('.status-badge')).toHaveText('已完成', { timeout: 15000 });
  await expect(page.locator('.output-line')).toContainText('55');
  await page.getByRole('button', { name: '结果验证', exact: true }).click();
  await expect(page.locator('.validation-summary')).toContainText('验证通过');
  await page.getByLabel('CPU 架构').selectOption('arm64');
  await expect(page.locator('.register').first()).toContainText('X0');
  await expect(page.locator('.cpu-metrics').first()).toContainText('0steps');
  await page.getByLabel('C++ 源代码编辑器').fill('int main() { int answer = 6 * 7; std::cout << answer; return 0; }');
  await page.getByRole('button', { name: '编译', exact: true }).click();
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(page.locator('.status-badge')).toHaveText('已完成');
  await page.getByRole('button', { name: '控制台', exact: false }).click();
  await expect(page.locator('.output-line')).toContainText('42');
  expect(errors).toEqual([]);
});

test('编译错误恢复、示例选择、内存与移动端布局', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('C++ 源代码编辑器').fill('int main() { return missing; }');
  await page.getByRole('button', { name: '编译', exact: true }).click();
  await expect(page.locator('.console-line.error-text')).toContainText('未声明');
  page.on('dialog', dialog => dialog.accept());
  await page.getByLabel('示例程序').selectOption('bits');
  await page.getByLabel('执行速度').selectOption('120');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(page.locator('.status-badge')).toHaveText('已完成');
  await page.getByRole('button', { name: '内存', exact: true }).click();
  await expect(page.locator('.byte-table')).toContainText('0C');
  await page.getByRole('button', { name: '结果验证', exact: true }).click();
  await expect(page.locator('.validation-summary')).toContainText('验证通过');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '指南', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('用户 class 示例编译运行、单步成员高亮和内存布局', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('C++ 源代码编辑器').fill(examples.find(example => example.id === 'class-members')!.source);
  await page.getByRole('button', { name: '编译', exact: true }).click();
  await expect(page.locator('.status-badge')).toHaveText('就绪');
  const x = page.locator('.memory-content tr').filter({ has: page.getByRole('cell', { name: 'a.x', exact: true }) });
  const y = page.locator('.memory-content tr').filter({ has: page.getByRole('cell', { name: 'a.y', exact: true }) });
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: '单步', exact: true }).click();
  await expect(x.locator('.variable-value')).toHaveText('1');
  await expect(x).toHaveClass('memory-changed');
  await expect(y.locator('.variable-value')).toHaveText('0');
  await page.getByLabel('执行速度').selectOption('120');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(page.locator('.status-badge')).toHaveText('已完成');
  await expect(y.locator('.variable-value')).toHaveText('2');
  await expect(page.locator('.console-content')).toContainText('返回值 0');
  await page.getByRole('button', { name: '内存', exact: true }).click();
  const bytes = page.locator('.byte-table tbody tr');
  await expect(bytes.nth(0)).toContainText('0x1000');
  await expect(bytes.nth(0).locator('.byte')).toHaveText(['01', '00', '00', '00']);
  await expect(bytes.nth(1)).toContainText('0x1004');
  await expect(bytes.nth(1).locator('.byte')).toHaveText(['02', '00', '00', '00']);
  page.on('dialog', dialog => dialog.accept());
  await page.getByLabel('示例程序').selectOption('class-members');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(page.locator('.status-badge')).toHaveText('已完成');
  await page.getByRole('button', { name: '结果验证', exact: true }).click();
  await expect(page.locator('.validation-summary')).toContainText('4 / 4 项预期结果一致');
});

test('CPU 示意图按指令更新 PC、IR、ALU、实际地址并响应重置和架构切换', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '详细模式', exact: true }).click();
  await page.getByLabel('C++ 源代码编辑器').fill('int main() { int a = 3; a += 4; if (a == 0) { a = 9; } return a; }');
  await page.getByRole('button', { name: '编译', exact: true }).click();
  await expect(page.getByTestId('diagram-pc')).toContainText('0x00400000');
  await expect(page.getByTestId('diagram-ir')).toContainText('等待取指');
  const single = page.getByRole('button', { name: '单步', exact: true });
  await single.click();
  await expect(page.getByTestId('diagram-ir')).toContainText('MOV RAX, 3');
  await expect(page.getByTestId('diagram-pc')).toContainText('0x00400004');
  await single.click();
  await expect(page.getByTestId('diagram-access')).toContainText('WRITE');
  await expect(page.getByTestId('diagram-access')).toContainText('0x00001000');
  await expect(page.getByTestId('diagram-access')).toContainText('a = 3');
  await single.click();
  await expect(page.getByTestId('diagram-access')).toContainText('READ');
  await single.click();
  await single.click();
  await expect(page.getByTestId('diagram-alu')).toContainText('结果 = 7');
  await expect(page.getByTestId('diagram-alu').locator('.alu-operand')).toHaveText('A3B4');
  for (let i = 0; i < 5; i++) await single.click();
  await expect(page.getByTestId('diagram-branch')).toContainText('已跳转');
  await expect(page.getByTestId('diagram-pc')).toContainText('0x00400030');
  await page.getByRole('button', { name: '展开 CPU 示意图', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'CPU 动态示意图' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('执行速度').selectOption('120');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(page.locator('.status-badge')).toHaveText('已完成');
  await expect(page.getByTestId('diagram-ir')).toContainText('RET');
  await expect(page.locator('.diagram-io')).toContainText('return 7');
  await page.getByLabel('CPU 架构').selectOption('arm64');
  await expect(page.getByTestId('diagram-ir')).toContainText('等待取指');
  await expect(page.getByTestId('diagram-access')).toContainText('总线空闲');
  await single.click();
  await expect(page.getByTestId('diagram-ir')).toContainText('MOV X0, #3');
  await page.getByRole('button', { name: '重置执行', exact: true }).click();
  await expect(page.getByTestId('diagram-pc')).toContainText('0x00400000');
  await expect(page.getByTestId('diagram-alu')).toContainText('等待运算');
});

test('默认简单模式，切换详细模式保留执行状态，左右展示统一指令流与 main 栈帧', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '简单模式', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('simple-cpu')).toHaveAttribute('data-status', 'idle');
  await page.getByLabel('示例程序').selectOption('class-members');
  const single = page.getByRole('button', { name: '单步', exact: true });
  await single.click();
  await expect(page.getByTestId('stack-sp')).toHaveText('0x00007FF8');
  await expect(page.getByTestId('stack-values').locator('.stack-top strong')).toHaveText('0');
  await expect(page.getByTestId('simple-cpu')).toContainText('0x00400004');
  await expect(page.getByTestId('simple-registers')).toHaveClass(/is-active/);
  await expect(page.getByTestId('diagram-stack')).toContainText('main()');
  const stream = await page.getByTestId('instruction-stream').boundingBox();
  const stack = await page.locator('.data-memory').boundingBox();
  expect(stream!.x + stream!.width).toBeLessThan(stack!.x);
  for (let i = 0; i < 5; i++) await single.click();
  const x = page.locator('.stack-local-row').filter({ has: page.getByText('a.x', { exact: true }) });
  await expect(x.locator('strong')).toHaveText('1');
  await expect(x).toHaveClass(/written/);
  await expect(page.getByTestId('stack-sp')).toHaveText('0x00008000');
  await expect(page.getByTestId('simple-memory')).toContainText('WRITE 1');
  await page.getByRole('button', { name: '详细模式', exact: true }).click();
  await expect(page.getByTestId('diagram-ir')).toContainText('MOV [a.x], RAX');
  await expect(x.locator('strong')).toHaveText('1');
  await page.getByRole('button', { name: '数据内存', exact: true }).click();
  await expect(page.locator('.diagram-ram')).toContainText('a.x');
  await page.getByRole('button', { name: '函数栈', exact: true }).click();
  await page.getByLabel('执行速度').selectOption('120');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(page.locator('.stack-frame-header')).toContainText('已返回 · 最终快照');
  await expect(page.locator('.stack-local-row').filter({ hasText: 'a.y' }).locator('strong')).toHaveText('2');
  await page.getByLabel('CPU 架构').selectOption('arm32');
  await single.click();
  await expect(page.getByTestId('stack-sp')).toHaveText('0x00007FFC');
  await expect(page.locator('.stack-footprint')).toContainText('每槽 4 B');
  await page.getByRole('button', { name: '重置执行', exact: true }).click();
  await expect(page.getByTestId('stack-values')).toContainText('栈为空');
  await expect(x.locator('strong')).toHaveText('0');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '简单模式', exact: true }).click();
  await expect(page.getByTestId('simple-cpu')).toHaveAttribute('data-status', 'idle');
  await expect(page.getByTestId('simple-ir')).toContainText('等待取指');
  const chip = await page.getByTestId('simple-cpu').boundingBox();
  const mobileStream = await page.getByTestId('instruction-stream').boundingBox();
  const mobileStack = await page.locator('.data-memory').boundingBox();
  expect(chip!.width).toBeLessThan(390);
  expect(mobileStream!.y + mobileStream!.height).toBeLessThan(chip!.y);
  expect(mobileStack!.y).toBeGreaterThan(chip!.y + chip!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('指令流只展示一份完整程序，PC / IR 随执行、重编译和架构切换同步', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/');
  const stream = page.getByTestId('instruction-stream');
  await expect(page.getByRole('heading', { name: '指令流', exact: true })).toHaveCount(1);
  await expect(page.getByText('指令内存', { exact: true })).toHaveCount(0);
  await expect(stream.locator('.stream-row')).toHaveCount(25);
  await expect(stream.locator('[aria-current="step"]')).toHaveAttribute('data-pc', '0');
  const single = page.getByRole('button', { name: '单步', exact: true });
  await single.click();
  await expect(stream.locator('.marker-ir')).toHaveText('IR');
  await expect(stream.locator('.is-executed code')).toHaveText('MOV RAX, 10');
  await expect(stream.locator('[aria-current="step"]')).toHaveAttribute('data-pc', '1');
  await page.getByLabel('执行速度').selectOption('120');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(stream.locator('.stream-legend')).toContainText('执行结束');
  await expect(stream.locator('[aria-current="step"]')).toHaveCount(0);
  await expect(stream.locator('.is-executed code')).toHaveText('RET');
  const inScrollport = () => stream.locator('[data-focused="true"]').evaluate(row => {
    const list = row.parentElement!;
    return row.getBoundingClientRect().top >= list.getBoundingClientRect().top && row.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom;
  });
  await expect.poll(inScrollport).toBe(true);
  expect(await stream.locator('.stream-list').evaluate(list => list.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '展开 CPU 示意图', exact: true }).click();
  await expect(stream).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect.poll(inScrollport).toBe(true);
  await page.getByRole('button', { name: '重置执行', exact: true }).click();
  await expect(stream.locator('.marker-ir')).toHaveCount(0);
  await expect(stream.locator('[aria-current="step"]')).toHaveAttribute('data-pc', '0');
  await expect.poll(inScrollport).toBe(true);
  await page.getByLabel('C++ 源代码编辑器').fill('int main() {\n  return 42;\n}');
  await expect(stream).toContainText('待编译 · 上次快照');
  await expect(stream.locator('.stream-row')).toHaveCount(25);
  await page.getByRole('button', { name: '编译', exact: true }).click();
  await expect(stream).not.toContainText('待编译');
  await expect(stream.locator('.stream-row').first().locator('code')).toHaveText('MOV RAX, 42');
  await expect(stream.locator('.stream-row').first().locator('.stream-source')).toHaveText('2');
  await page.getByLabel('CPU 架构').selectOption('arm64');
  await expect(stream.locator('.stream-row').first().locator('code')).toHaveText('MOV X0, #42');
  await expect(stream.locator('[aria-current="step"]')).toHaveAttribute('data-pc', '0');
});

test('简单芯片图按实际指令点亮运算、读写和跳转通路，重置清空快照', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('C++ 源代码编辑器').fill('int main() { int a = 3; a += 4; if (a == 0) { a = 9; } return a; }');
  await page.getByRole('button', { name: '编译', exact: true }).click();
  const chip = page.getByTestId('simple-cpu');
  const single = page.getByRole('button', { name: '单步', exact: true });
  await expect(chip.locator('.silicon-trace.is-active')).toHaveCount(0);
  await single.click();
  await expect(page.getByTestId('simple-ir')).toContainText('MOV RAX, 3');
  await expect(page.getByTestId('simple-pc')).toContainText('0x00400004');
  await expect(chip.locator('[data-route=fetch]')).toHaveClass(/is-active/);
  await expect(page.getByTestId('simple-alu')).not.toHaveClass(/is-active/);
  await single.click();
  await expect(page.getByTestId('simple-memory')).toContainText('WRITE 3');
  await expect(page.getByTestId('simple-memory')).toContainText('0x00001000');
  await expect(chip.locator('[data-route=memory-bus]')).toHaveClass(/is-active/);
  await single.click();
  await expect(page.getByTestId('simple-memory')).toContainText('READ 3');
  await expect(page.locator('.memory-bus .data-bus')).toHaveClass(/bus-reverse/);
  await single.click();
  await single.click();
  await expect(page.getByTestId('simple-alu')).toHaveClass(/is-active/);
  await expect(page.getByTestId('simple-result')).toHaveText('3 + 4 = 7');
  await expect(chip.locator('[data-route=writeback]')).toHaveClass(/is-active/);
  await expect(chip.locator('[data-route=memory-bus]')).not.toHaveClass(/is-active/);
  for (let i = 0; i < 5; i++) await single.click();
  await expect(page.getByTestId('simple-result')).toHaveText('已跳转 → 0x00400030');
  await expect(chip.locator('[data-route=branch]')).toHaveClass(/is-active/);
  await page.getByLabel('执行速度').selectOption('120');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(chip).toHaveAttribute('data-status', 'halted');
  await expect(page.getByTestId('simple-result')).toContainText('返回值 7');
  await expect(chip.locator('.silicon-packet')).toHaveCount(0);
  await page.getByLabel('CPU 架构').selectOption('arm64');
  await expect(chip).toContainText('ARM64');
  await single.click();
  await expect(page.getByTestId('simple-ir')).toContainText('MOV X0, #3');
  await page.getByRole('button', { name: '重置执行', exact: true }).click();
  await expect(chip.locator('.silicon-trace.is-active')).toHaveCount(0);
  await expect(page.getByTestId('simple-pc')).toContainText('0x00400000');
});

test('简单模式运行和暂停联动，减少动态效果与异常停止状态正确', async ({ page }) => {
  await page.goto('/');
  const chip = page.getByTestId('simple-cpu');
  await page.getByLabel('执行速度').selectOption('12');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(chip).toHaveAttribute('data-status', 'running');
  await expect(chip.locator('.silicon-packet').nth(1)).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(chip).toHaveAttribute('data-status', 'paused');
  const pc = await page.getByTestId('simple-pc').textContent();
  await expect.poll(() => chip.locator('.silicon-packet').first().evaluate(element => Number(getComputedStyle(element).opacity))).toBe(0);
  await expect(page.getByTestId('simple-pc')).toHaveText(pc!);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '单步', exact: true }).click();
  await expect(chip.locator('.silicon-packet').first()).toHaveCSS('display', 'none');
  await expect(chip.locator('[data-route=fetch]')).toHaveClass(/is-active/);
  await page.getByLabel('C++ 源代码编辑器').fill('int main() { return 6 / 0; }');
  await page.getByRole('button', { name: '编译', exact: true }).click();
  await page.getByLabel('执行速度').selectOption('120');
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(chip).toHaveAttribute('data-status', 'error');
  await expect(page.getByTestId('simple-result')).toContainText('除数不能为 0');
  await expect(page.getByTestId('simple-alu')).toContainText('运算异常');
  await expect(chip.locator('.silicon-trace.is-active')).toHaveCount(0);
  await expect(chip.locator('.silicon-packet')).toHaveCount(0);
});

for (const viewport of [{ width: 1100, height: 700 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`单屏工作台 ${viewport.width}×${viewport.height} 所有面板可见且内容可滚动`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByLabel('示例程序').selectOption('sort');
    for (const mode of ['详细模式', '简单模式']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const layout = await page.evaluate(() => {
        const selectors = ['.toolbar', '.cpu-diagram-panel', '.editor-panel', '.instruction-stream', '.cpu-panel', '.bottom-panel', '.memory-panel'];
        return {
          overflow: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth,
          panels: selectors.map(selector => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { selector, visible: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && r.height > 60 }; }),
          diagramOverflow: document.querySelector('.diagram-scroll')!.scrollWidth > document.querySelector('.diagram-scroll')!.clientWidth,
        };
      });
      expect(layout.overflow).toBe(false);
      expect(layout.diagramOverflow).toBe(false);
      expect(layout.panels.filter(panel => panel.selector !== '.toolbar').every(panel => panel.visible)).toBe(true);
      if (mode === '简单模式') {
        const chip = page.getByTestId('simple-cpu');
        expect(await chip.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
        await expect(page.getByTestId('simple-result')).toBeInViewport();
      }
    }
    const editor = page.getByLabel('C++ 源代码编辑器');
    await editor.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')); });
    expect(await editor.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.getByRole('button', { name: '展开编辑器', exact: true }).click();
    await expect(page.getByRole('button', { name: '恢复布局', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '展开编辑器', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '展开 CPU 示意图', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'CPU 动态示意图' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByLabel('示例程序').selectOption('class-members');
    await page.getByLabel('执行速度').selectOption('120');
    await page.getByRole('button', { name: '运行', exact: true }).click();
    await expect(page.locator('.status-badge')).toHaveText('已完成');
    await page.getByRole('button', { name: '结果验证', exact: true }).click();
    await expect(page.locator('.validation-summary')).toContainText('4 / 4');
  });
}

test('更新日志读取统一版本与历史，支持桌面和手机入口及关闭', async ({ page }) => {
  await page.goto('/');
  const versionButton = page.getByRole('button', { name: `v${version}`, exact: true });
  await expect(versionButton).toBeVisible();
  await versionButton.click();
  const dialog = page.getByRole('dialog', { name: '更新日志', exact: true });
  await expect(dialog).toContainText(`[${version}]`);
  await expect(dialog).toContainText('单屏工作台与函数栈');
  await expect(dialog).toContainText('基础 C++ 类支持');
  await expect(dialog).toContainText('首版与在线部署');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(versionButton).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: '关闭更新日志', exact: true }).click();
  await expect(dialog).toBeHidden();
});
