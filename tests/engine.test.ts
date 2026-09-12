import { test } from 'node:test';
import assert from 'node:assert/strict';
import { architectures, compile, createMachine, hex, instructionText, run, step, type Architecture } from '../src/engine';
import { examples, validateExample } from '../src/examples';

for (const arch of Object.keys(architectures) as Architecture[]) {
  for (const example of examples) {
    test(`${arch}: ${example.title} 的结果、输出和返回值正确`, () => {
      const program = compile(example.source);
      const machine = run(program, arch);
      assert.equal(machine.error, undefined);
      assert.ok(validateExample(example, machine.memory, machine.output, machine.result).every(check => check.pass));
      assert.equal(machine.stack.length, 0);
      assert.equal(machine.registers[7], 0x8000);
    });
  }
}

test('单步保持旧快照，正确标记内存和寄存器变化', () => {
  const p = compile('int main() { int a = 42; return a; }');
  const initial = createMachine(p, 'x64');
  const first = step(p, initial);
  const second = step(p, first);
  assert.equal(initial.registers[0], 0);
  assert.equal(first.registers[0], 42);
  assert.equal(first.registers[7], 0x8000 - 8);
  assert.equal(first.memory.a[0], 0);
  assert.equal(second.memory.a[0], 42);
  assert.deepEqual(second.changedMemory, ['a:0']);
  assert.equal(second.trace[1].detail, '写入 a[0] ← 42');
});

test('逻辑运算短路避免右侧除零，并产生布尔值', () => {
  const m = run(compile('int main() { int a = 0 && (1 / 0); int b = 3 || (1 / 0); int c = 1 && 9; int d = 0 || 8; return a + b + c + d; }'), 'arm64');
  assert.equal(m.error, undefined);
  assert.equal(m.result, 3);
});

test('if / else、负数除法、优先级和数组复合赋值', () => {
  const m = run(compile('int main() { int a[2] = {3, 4}; int b = -7 / 2; if (b == -3) { a[1] *= 2 + 3 * 4; } else { a[1] = 0; } return a[1]; }'), 'x86');
  assert.equal(m.result, 56);
});

test('教学 int32 溢出和 64 位负数展示', () => {
  const m = run(compile('int main() { int a = 2147483647; a += 1; return a; }'), 'x64');
  assert.equal(m.result, -2147483648);
  assert.equal(hex(-1, 64), 'FFFFFFFFFFFFFFFF');
});

test('除零和数组越界以运行错误结束', () => {
  assert.match(run(compile('int main() { return 1 / 0; }'), 'x86').error!, /除数/);
  assert.match(run(compile('int main() { int a[2]; return a[2]; }'), 'arm32').error!, /数组越界/);
  assert.match(run(compile('int main() { int a[2]; a[-1] = 8; return 0; }'), 'arm64').error!, /数组越界/);
});

test('编译错误包含明确诊断', () => {
  assert.throws(() => compile('int main() { return unknown; }'), /未声明/);
  assert.throws(() => compile('int main() { int a = 1; int a = 2; }'), /同名变量/);
  assert.throws(() => compile('int main() { int a[129]; }'), /数组长度/);
  assert.throws(() => compile('int main() { /*'), /注释未结束/);
  assert.throws(() => compile('int main() { double x = 2; }'));
});

test('死循环会被指令预算终止', () => {
  const m = run(compile('int main() { while (1) {} return 0; }'), 'x64');
  assert.equal(m.cycles, 100000);
  assert.match(m.error!, /100,000/);
});

test('架构映射和栈槽宽度随模型切换', () => {
  const p = compile('int main() { int a = 1; return a; }');
  assert.equal(step(p, createMachine(p, 'arm32')).registers[7], 0x8000 - 4);
  assert.equal(step(p, createMachine(p, 'arm64')).registers[7], 0x8000 - 8);
  assert.match(instructionText(p.instructions[1], 'arm64'), /^STR X0/);
  assert.match(instructionText(p.instructions[1], 'x86'), /^MOV \[a\], EAX/);
});

test('cout 链式表达式和普通表达式的移位优先级', () => {
  const m = run(compile('int main() { int a = 1 | 2 << 2; std::cout << a + 1 << (a << 1); return a; }'), 'x64');
  assert.equal(m.error, undefined);
  assert.equal(m.result, 9);
  assert.deepEqual(m.output, [10, 18]);
});
