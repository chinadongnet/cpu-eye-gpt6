import { expect, test } from '@playwright/test';

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
