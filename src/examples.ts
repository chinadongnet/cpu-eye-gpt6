export type Example = { id: string; title: string; subtitle: string; tag: string; source: string; expected: Record<string, number | number[]>; output: number[]; result: number };
export const examples: Example[] = [
  {
    id: 'sum', title: '累加求和', subtitle: '从一次循环，理解 CPU 的工作方式', tag: '入门 · 循环与算术',
    source: `// 计算 1 到 10 的和，观察寄存器与内存变化\n#include <iostream>\n\nint main() {\n    int n = 10;\n    int sum = 0;\n\n    for (int i = 1; i <= n; i++) {\n        sum += i;\n    }\n\n    std::cout << sum << std::endl;\n    return 0;\n}`,
    expected: { n: 10, sum: 55, i: 11 }, output: [55], result: 0,
  },
  {
    id: 'fibonacci', title: '斐波那契数列', subtitle: '观察数据如何在变量之间流动', tag: '入门 · 数据传递',
    source: `// 计算第 10 个斐波那契数\n#include <iostream>\n\nint main() {\n    int a = 0;\n    int b = 1;\n    int next = 0;\n    for (int i = 0; i < 10; i++) {\n        next = a + b;\n        a = b;\n        b = next;\n    }\n    std::cout << a << std::endl;\n    return 0;\n}`,
    expected: { a: 55, b: 89, next: 89, i: 10 }, output: [55], result: 0,
  },
  {
    id: 'sort', title: '冒泡排序', subtitle: '直观追踪数组比较与内存交换', tag: '进阶 · 数组与分支',
    source: `// 将数组从小到大排序\n#include <iostream>\n\nint main() {\n    int data[5] = {7, 3, 9, 1, 5};\n    int temp = 0;\n    int j = 0;\n    for (int i = 0; i < 4; i++) {\n        for (j = 0; j < 4 - i; j++) {\n            if (data[j] > data[j + 1]) {\n                temp = data[j];\n                data[j] = data[j + 1];\n                data[j + 1] = temp;\n            }\n        }\n    }\n    std::cout << data[0] << std::endl;\n    return 0;\n}`,
    expected: { data: [1, 3, 5, 7, 9] }, output: [1], result: 0,
  },
  {
    id: 'gcd', title: '最大公约数', subtitle: '用欧几里得算法探索条件跳转', tag: '进阶 · 条件与取模',
    source: `// 辗转相除法：gcd(48, 18) = 6\n#include <iostream>\n\nint main() {\n    int a = 48;\n    int b = 18;\n    int remainder = 0;\n    while (b != 0) {\n        remainder = a % b;\n        a = b;\n        b = remainder;\n    }\n    std::cout << a << std::endl;\n    return 0;\n}`,
    expected: { a: 6, b: 0, remainder: 0 }, output: [6], result: 0,
  },
  {
    id: 'bits', title: '位运算实验', subtitle: '从二进制层面观察逻辑运算', tag: '入门 · 二进制逻辑',
    source: `// 与、或、异或与移位\n#include <iostream>\n\nint main() {\n    int a = 12;\n    int b = 10;\n    int both = a & b;\n    int either = a | b;\n    int different = a ^ b;\n    int shifted = a << 2;\n    std::cout << both << either << different << shifted;\n    return 0;\n}`,
    expected: { both: 8, either: 14, different: 6, shifted: 48 }, output: [8, 14, 6, 48], result: 0,
  },
  {
    id: 'class-members', title: '类与对象成员', subtitle: '观察对象成员的赋值与连续内存布局', tag: '入门 · 对象与内存',
    source: `class A{\npublic:\n    int x;\n    int y;\n};\n\nint main()\n{\n    A a;\n    a.x = 1;\n    a.y = 2;\n    return 0;\n}`,
    expected: { 'a.x': 1, 'a.y': 2 }, output: [], result: 0,
  },
];

export function validateExample(example: Example, memory: Record<string, number[]>, output: number[], result?: number) {
  const checks = Object.entries(example.expected).map(([name, expected]) => ({
    label: name, expected: JSON.stringify(expected), actual: JSON.stringify(Array.isArray(expected) ? memory[name] : memory[name]?.[0]),
    pass: JSON.stringify(Array.isArray(expected) ? memory[name] : memory[name]?.[0]) === JSON.stringify(expected),
  }));
  checks.push({ label: 'stdout', expected: JSON.stringify(example.output), actual: JSON.stringify(output), pass: JSON.stringify(output) === JSON.stringify(example.output) });
  checks.push({ label: 'return', expected: String(example.result), actual: String(result), pass: result === example.result });
  return checks;
}
