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

test('对象实例成员独立、按声明顺序分配地址，支持成员表达式和数组', () => {
  const p = compile(`
class A { public: int x, y; int data[2]; };
struct B { int value; };
int main() {
    A a;
    A b{};
    B c;
    a.x = 1;
    a.y = 2;
    b.x = 9;
    a.x += a.y;
    a.y++;
    a.data[1] = a.x * a.y;
    a.data[1] -= 2;
    c.value = a.data[1];
    if (a.x == 3 && b.x == 9) { c.value++; }
    std::cout << a.x << b.x << c.value;
    return c.value;
}`);
  for (const arch of Object.keys(architectures) as Architecture[]) {
    const m = run(p, arch);
    assert.equal(m.error, undefined);
    assert.equal(m.result, 8);
    assert.deepEqual(m.output, [3, 9, 8]);
    assert.deepEqual(m.memory['a.data'], [0, 7]);
    assert.deepEqual(m.memory['b.data'], [0, 0]);
    assert.deepEqual(p.variables.map(v => v.address), [0x1000, 0x1004, 0x1008, 0x1010, 0x1014, 0x1018, 0x1020]);
  }
});

test('对象成员写入保留源码行、快照、汇编名称和高亮键', () => {
  const p = compile(examples.find(example => example.id === 'class-members')!.source);
  let before = createMachine(p, 'arm64');
  while (!(p.instructions[before.pc].op === 'STORE' && p.instructions[before.pc].line === 10)) before = step(p, before);
  const after = step(p, before);
  assert.deepEqual(before.memory['a.x'], [0]);
  assert.deepEqual(after.memory['a.x'], [1]);
  assert.deepEqual(after.changedMemory, ['a.x:0']);
  assert.equal(after.registers[2], 0x1000);
  assert.equal(instructionText(p.instructions[before.pc], 'arm64'), 'STR X0, [a.x]');
});

test('类与 struct 访问控制、成员查找和声明冲突有明确诊断', () => {
  assert.throws(() => compile('class A { int x; }; int main() { A a; a.x = 1; }'), /成员 a.x 为 private/);
  assert.throws(() => compile('struct A { protected: int x; }; int main() { A a; return a.x; }'), /成员 a.x 为 protected/);
  assert.throws(() => compile('class A { public: int x; private: int y; }; int main() { A a; return a.y; }'), /private/);
  assert.throws(() => compile('class A { public: int x; }; int main() { A a; return a.y; }'), /没有成员 y/);
  assert.throws(() => compile('int main() { int a; a.x = 1; }'), /不是类对象/);
  assert.throws(() => compile('int main() { return a.x; }'), /对象 a 未声明/);
  assert.throws(() => compile('class A {}; int main() { A a; return a; }'), /不能作为整数/);
  for (const declarations of ['A a; A a;', 'A a; int a;', 'int a; A a;']) {
    assert.throws(() => compile(`class A {}; int main() { ${declarations} return 0; }`), /同名变量/);
  }
  assert.throws(() => compile('class A {}; class A {}; int main() {}'), /重复的类定义/);
  assert.throws(() => compile('struct A { int x; int x; }; int main() {}'), /重复的成员名/);
});

test('成员数组越界和对象存储上限继续受检查', () => {
  const m = run(compile('struct A { int data[2]; }; int main() { A a; a.data[2] = 7; return 0; }'), 'x64');
  assert.match(m.error!, /数组越界：a.data\[2\]/);
  const declarations = Array.from({ length: 9 }, (_, i) => `A a${i};`).join(' ');
  assert.throws(() => compile(`struct A { int data[128]; }; int main() { ${declarations} }`), /4 KiB/);
});

test('不支持的类特性给出诊断而非静默忽略', () => {
  assert.throws(() => compile('class A { public: int get() { return 1; } }; int main() {}'), /成员函数/);
  assert.throws(() => compile('class A { public: A() {} }; int main() {}'), /构造函数/);
  assert.throws(() => compile('class A { public: int x = 3; }; int main() {}'), /类内成员初始化/);
  assert.throws(() => compile('class A : B {}; int main() {}'), /类继承/);
  assert.throws(() => compile('class A {}; int main() { A a[2]; }'), /对象数组/);
  assert.throws(() => compile('class A {}; int main() { A a; A b = a; }'), /对象复制/);
  assert.throws(() => compile('class A { public: int x; }; int main() { A a; a.x(); }'), /函数调用/);
});

test('CPU 执行快照捕获 ALU 原始操作数、实际地址和分支决定', () => {
  const p = compile('int main() { int data[2] = {3, 7}; int x = data[1] + 5; if (x == 12) { data[0] = x; } if (x == 0) { x = 9; } return x; }');
  let machine = createMachine(p, 'x64');
  const events = [];
  while (!machine.halted) { machine = step(p, machine); events.push(machine.execution!); }
  const load = events.find(event => event.memory?.direction === 'read' && event.memory.name === 'data')!;
  assert.deepEqual(load.memory, { address: 0x1004, name: 'data', index: 1, value: 7, direction: 'read' });
  const add = events.find(event => event.instruction.operator === '+')!;
  assert.deepEqual(add.operands, [7, 5]);
  assert.equal(add.result, 12);
  assert.equal(add.nextPc, add.pc + 1);
  const branches = events.filter(event => event.branch);
  assert.equal(branches[0].branch!.taken, false);
  assert.equal(branches[1].branch!.taken, true);
  assert.equal(branches[1].nextPc, branches[1].branch!.target);
  assert.equal(machine.result, 12);
  assert.equal(createMachine(p, 'x64').execution, undefined);
});

test('CPU 异常快照不显示成功结果或残留内存访问', () => {
  const m = run(compile('int main() { int a = 1; return a / 0; }'), 'arm32');
  assert.deepEqual(m.execution!.operands, [1, 0]);
  assert.equal(m.execution!.result, undefined);
  assert.equal(m.execution!.memory, undefined);
  assert.match(m.execution!.error!, /除数/);
});

const functionSource = `int func(int x, int y)
{
    return x + y;
}

int main() {
    return func(1, 2);
}`;

for (const arch of Object.keys(architectures) as Architecture[]) {
  test(`${arch}: 用户函数示例从 main 进入，按值传参并返回 3`, () => {
    const p = compile(functionSource);
    const callPc = p.instructions.findIndex(instruction => instruction.op === 'CALL');
    let before = createMachine(p, arch);
    assert.equal(p.functions.find(fn => fn.name === 'main')!.entry, 0);
    assert.equal(p.instructions[before.pc].line, 7);
    while (before.pc !== callPc) before = step(p, before);
    const called = step(p, before);
    assert.deepEqual(before.frames.map(frame => frame.name), ['main']);
    assert.deepEqual(called.frames, [before.frames[0], { name: 'func', returnPc: callPc + 1, stackBase: 0 }]);
    assert.deepEqual(called.execution!.operands, [1, 2]);
    assert.equal(called.pc, p.functions.find(fn => fn.name === 'func')!.entry);
    assert.equal(called.execution!.nextPc, called.pc);
    assert.equal(called.execution!.branch!.target, called.pc);
    assert.match(instructionText(p.instructions[callPc], arch), arch.startsWith('arm') ? /^BL func/ : /^CALL func/);
    const y = step(p, called), x = step(p, y);
    assert.deepEqual(called.memory['func::y'], [0]);
    assert.deepEqual(y.changedMemory, ['func::y:0']);
    assert.deepEqual(x.memory['func::x'], [1]);
    assert.deepEqual(x.memory['func::y'], [2]);
    assert.equal(x.registers[7], 0x8000);
    let returned = x;
    while (returned.frames.length > 1) returned = step(p, returned);
    assert.equal(returned.halted, false);
    assert.equal(returned.pc, callPc + 1);
    assert.deepEqual(returned.stack, [3]);
    assert.equal(returned.registers[7], 0x8000 - architectures[arch].bits / 8);
    assert.equal(returned.execution!.result, 3);
    const done = step(p, returned);
    assert.equal(done.halted, true);
    assert.equal(done.error, undefined);
    assert.equal(done.result, 3);
    assert.deepEqual(done.stack, []);
    assert.equal(done.registers[7], 0x8000);
  });
}

test('嵌套和重复调用保留调用方临时值，各函数的同名参数与对象独立', () => {
  const p = compile(`
struct Box { int values[2]; };
int combine(int x, int y) { return x * 10 + y; }
int wrap(int x) { Box box; box.values[1] = x; x += 1; return box.values[1] + combine(x, 2); }
int main(void) {
    int x = 4;
    Box box;
    box.values[1] = 7;
    int result = 100 + combine(wrap(x), combine(2, 3)) + wrap(1);
    return result + x + box.values[1];
}`);
  let m = createMachine(p, 'arm64'), maxDepth = 1;
  while (!m.halted) { m = step(p, m); maxDepth = Math.max(maxDepth, m.frames.length); }
  assert.equal(m.error, undefined);
  assert.equal(m.result, 717);
  assert.equal(maxDepth, 3);
  assert.deepEqual(m.memory.x, [4]);
  assert.deepEqual(m.memory['box.values'], [0, 7]);
  assert.deepEqual(m.memory['wrap::box.values'], [0, 1]);
  assert.deepEqual(m.stack, []);
});

test('函数调用可用于循环、条件、数组下标、cout 和独立语句，短路不执行调用', () => {
  const m = run(compile(`
int echo(int x) { std::cout << x; return x; }
int zero(void) { return 0; }
int fail() { return 1 / 0; }
int main() {
    int data[2] = {4, 8};
    data[echo(1)] += echo(5);
    for (int i = 0; i < 2; i++) { echo(i); }
    if (zero() || echo(9)) { std::cout << echo(data[1]); }
    int skipped = 0 && fail();
    return (1 || fail()) + data[zero()];
}`), 'x86');
  assert.equal(m.error, undefined);
  assert.equal(m.result, 5);
  assert.deepEqual(m.output, [1, 5, 0, 1, 9, 13, 13]);
  assert.deepEqual(m.memory.data, [4, 13]);
  assert.deepEqual(m.stack, []);
});

test('函数提前返回、跨定义顺序链接和重复调用的局部数据初始化', () => {
  const m = run(compile(`
int main() { int result = select(1) + select(0); return result + 10; }
int select(bool flag) {
    if (flag) { int value = 7; return value; }
    return value;
}`), 'x64');
  assert.equal(m.error, undefined);
  assert.equal(m.result, 17);
  assert.deepEqual(m.memory['select::value'], [0]);
  assert.deepEqual(m.stack, []);
});

test('函数定义、作用域、参数数量和不支持的调用有明确诊断', () => {
  assert.throws(() => compile('int main() { return missing(1); }'), /第 1 行：函数 missing 未定义/);
  assert.throws(() => compile('int f(int x) { return x; } int main() { return f(); }'), /需要 1 个参数，实际传入 0 个/);
  assert.throws(() => compile('int f() { return 0; } int main() { return f(1); }'), /需要 0 个参数，实际传入 1 个/);
  assert.throws(() => compile('int f(int x, int x) { return x; } int main() {}'), /重复的参数名/);
  assert.throws(() => compile('int f(int x) { int x; return x; } int main() {}'), /同名变量/);
  assert.throws(() => compile('int f() { return 0; } int f() { return 1; } int main() {}'), /重复的函数定义/);
  assert.throws(() => compile('int f() { return 1; }'), /缺少.*main/);
  assert.throws(() => compile('int main(int x) { return x; }'), /入口须为/);
  assert.throws(() => compile('int main() { return main(); }'), /不能调用入口函数/);
  assert.throws(() => compile('int f() { return x; } int main() { int x = 1; return f(); }'), /变量 x 未声明/);
  assert.throws(() => compile('int f() { return 1; } int main() { int f; return f(); }'), /不能作为函数调用/);
  assert.throws(() => compile('int f(int x[2]) { return 0; } int main() {}'), /参数暂不支持数组/);
  assert.throws(() => compile('int f(int x); int main() {}'), /暂不支持函数原型/);
  assert.throws(() => compile('int f() { return f(); } int main() { return f(); }'), /不支持递归调用/);
  assert.throws(() => compile('int f() { return g(); } int g() { return f(); } int main() { return f(); }'), /不支持递归调用/);
});

test('被调函数缺少返回值或发生异常时保留调用帧和调用方求值栈', () => {
  const missing = run(compile('int f(int x) { if (x) { return 3; } } int main() { return 7 + f(0); }'), 'arm32');
  assert.match(missing.error!, /函数 f 结束时未返回整数值/);
  assert.deepEqual(missing.stack, [7]);
  assert.deepEqual(missing.frames.map(frame => frame.name), ['main', 'f']);
  const failed = run(compile('int f(int x) { return 1 / x; } int main() { return 7 + f(0); }'), 'x64');
  assert.match(failed.error!, /除数不能为 0/);
  assert.deepEqual(failed.stack, [7]);
  assert.equal(failed.execution!.result, undefined);
});
