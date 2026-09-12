export type Architecture = 'x86' | 'x64' | 'arm32' | 'arm64';
export const architectures: Record<Architecture, { label: string; bits: number; family: string; registers: string[] }> = {
  x86: { label: 'x86', bits: 32, family: 'Intel · CISC', registers: ['EAX', 'EBX', 'ECX', 'EDX', 'ESI', 'EDI', 'EBP', 'ESP'] },
  x64: { label: 'x86-64', bits: 64, family: 'AMD64 · CISC', registers: ['RAX', 'RBX', 'RCX', 'RDX', 'RSI', 'RDI', 'RBP', 'RSP'] },
  arm32: { label: 'ARM32', bits: 32, family: 'ARMv7 · RISC', registers: ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R11', 'SP'] },
  arm64: { label: 'ARM64', bits: 64, family: 'AArch64 · RISC', registers: ['X0', 'X1', 'X2', 'X3', 'X4', 'X5', 'X29', 'SP'] },
};

type Token = { value: string; line: number };
type Access = 'public' | 'private' | 'protected';
type Field = { name: string; size: number; access: Access; line: number };
type ClassDefinition = { name: string; fields: Field[] };
type Expr = { kind: 'number'; value: number; line: number } | { kind: 'variable'; name: string; index?: Expr; line: number } | { kind: 'binary'; op: string; left: Expr; right: Expr; line: number } | { kind: 'unary'; op: string; value: Expr; line: number };
type Statement = { kind: 'block'; body: Statement[]; line: number } | { kind: 'declare'; name: string; size: number; values: Expr[]; line: number } | { kind: 'object'; name: string; definition: ClassDefinition; line: number } | { kind: 'assign'; target: Extract<Expr, { kind: 'variable' }>; value: Expr; op: string; line: number } | { kind: 'if'; condition: Expr; yes: Statement; no?: Statement; line: number } | { kind: 'while'; condition: Expr; body: Statement; line: number } | { kind: 'for'; init: Statement; condition: Expr; update: Statement; body: Statement; line: number } | { kind: 'return'; value: Expr; line: number } | { kind: 'print'; values: Expr[]; line: number };
export type Instruction = { op: 'CONST' | 'LOAD' | 'STORE' | 'BINARY' | 'UNARY' | 'JZ' | 'JMP' | 'PRINT' | 'HALT'; line: number; value?: number; name?: string; operator?: string; target?: number; indexed?: boolean };
export type Variable = { name: string; size: number; address: number };
export type Program = { instructions: Instruction[]; variables: Variable[]; source: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0, line = 1;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { if (c === '\n') line++; i++; continue; }
    if (source.startsWith('//', i) || c === '#') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) throw new Error(`第 ${line} 行：注释未结束`);
      line += (source.slice(i, end + 2).match(/\n/g) || []).length; i = end + 2; continue;
    }
    const match = source.slice(i).match(/^(0[xX][\da-fA-F]+|\d+|[A-Za-z_]\w*|==|!=|<=|>=|\+\+|--|\+=|-=|\*=|\/=|&&|\|\||<<|>>|::|[{}()[\];,.:+\-*/%<>=!&|^~])/);
    if (!match) throw new Error(`第 ${line} 行：不支持的字符 “${c}”`);
    tokens.push({ value: match[0], line }); i += match[0].length;
  }
  tokens.push({ value: '<eof>', line });
  return tokens;
}

class Parser {
  private pos = 0;
  private classes = new Map<string, ClassDefinition>();
  constructor(private tokens: Token[]) {}
  private get token() { return this.tokens[this.pos]; }
  private is(value: string) { return this.token.value === value; }
  private take() { return this.tokens[this.pos++]; }
  private accept(value: string) { if (this.is(value)) { this.take(); return true; } return false; }
  private expect(value: string) { if (!this.accept(value)) this.fail(`需要 “${value}”，实际是 “${this.token.value}”`); }
  private fail(message: string): never { throw new Error(`第 ${this.token.line} 行：${message}`); }
  private identifier() { const token = this.take(); if (!/^[A-Za-z_]\w*$/.test(token.value)) this.fail('需要变量名'); return token.value; }
  parse(): Statement {
    while (this.is('using') || this.is('class') || this.is('struct')) {
      if (this.accept('using')) { this.expect('namespace'); this.expect('std'); this.expect(';'); }
      else this.classDefinition();
    }
    this.expect('int'); this.expect('main'); this.expect('('); this.accept('void'); this.expect(')');
    const body = this.block(); this.expect('<eof>'); return body;
  }
  private arraySize() {
    if (!this.accept('[')) return 1;
    const token = this.take(), size = Number(token.value);
    if (!Number.isInteger(size) || size < 1 || size > 128) this.fail('数组长度须为 1–128 的整数字面量');
    this.expect(']'); return size;
  }
  private classDefinition() {
    const kind = this.take().value, name = this.identifier();
    if (this.classes.has(name)) this.fail(`重复的类定义：${name}`);
    if (this.is(':')) this.fail('教学子集暂不支持类继承');
    this.expect('{');
    let access: Access = kind === 'struct' ? 'public' : 'private';
    const fields: Field[] = [];
    while (!this.is('}')) {
      if (this.is('<eof>')) this.fail('类定义缺少右花括号');
      if (['public', 'private', 'protected'].includes(this.token.value)) { access = this.take().value as Access; this.expect(':'); continue; }
      if (!this.accept('int') && !this.accept('bool')) this.fail('类中仅支持 int / bool 数据成员，暂不支持构造函数、成员函数或嵌套对象');
      do {
        const line = this.token.line, fieldName = this.identifier();
        if (fields.some(field => field.name === fieldName)) this.fail(`重复的成员名：${name}.${fieldName}`);
        const size = this.arraySize();
        if (this.is('(')) this.fail('教学子集暂不支持成员函数');
        if (this.is('=') || this.is('{')) this.fail('教学子集暂不支持类内成员初始化，请在对象声明后赋值');
        fields.push({ name: fieldName, size, access, line });
      } while (this.accept(','));
      this.expect(';');
    }
    this.expect('}'); this.expect(';'); this.classes.set(name, { name, fields });
  }
  private variable(name: string, line: number): Extract<Expr, { kind: 'variable' }> {
    if (this.accept('.')) name += `.${this.identifier()}`;
    let index: Expr | undefined;
    if (this.accept('[')) { index = this.expression(); this.expect(']'); }
    if (this.is('.')) this.fail('教学子集暂不支持嵌套成员或对象数组访问');
    if (this.is('(')) this.fail('教学子集暂不支持函数或成员函数调用');
    return { kind: 'variable', name, index, line };
  }
  private block(): Statement {
    const line = this.token.line; this.expect('{'); const body: Statement[] = [];
    while (!this.is('}')) { if (this.is('<eof>')) this.fail('缺少右花括号'); body.push(this.statement()); }
    this.expect('}'); return { kind: 'block', body, line };
  }
  private statement(): Statement {
    const line = this.token.line;
    if (this.is('{')) return this.block();
    if (this.accept('if')) {
      this.expect('('); const condition = this.expression(); this.expect(')'); const yes = this.statement();
      const no = this.accept('else') ? this.statement() : undefined; return { kind: 'if', condition, yes, no, line };
    }
    if (this.accept('while')) { this.expect('('); const condition = this.expression(); this.expect(')'); return { kind: 'while', condition, body: this.statement(), line }; }
    if (this.accept('for')) {
      this.expect('('); const init = this.simple(); this.expect(';'); const condition = this.expression(); this.expect(';'); const update = this.simple(); this.expect(')');
      return { kind: 'for', init, condition, update, body: this.statement(), line };
    }
    if (this.accept('return')) { const value = this.expression(); this.expect(';'); return { kind: 'return', value, line }; }
    if (this.is('std') || this.is('cout')) {
      if (this.accept('std')) this.expect('::'); this.expect('cout'); const values: Expr[] = [];
      while (this.accept('<<')) {
        if (this.accept('std')) { this.expect('::'); this.expect('endl'); }
        else if (!this.accept('endl')) values.push(this.expression(0, true));
      }
      this.expect(';'); return { kind: 'print', values, line };
    }
    const result = this.simple(); this.expect(';'); return result;
  }
  private simple(): Statement {
    const line = this.token.line;
    const definition = this.classes.get(this.token.value);
    if (definition) {
      this.take(); const name = this.identifier();
      if (this.accept('{')) this.expect('}');
      if (['=', '(', '[', ','].includes(this.token.value)) this.fail('对象声明支持 Type name; 或 Type name{};，暂不支持对象复制、构造参数或对象数组');
      return { kind: 'object', name, definition, line };
    }
    if (this.accept('int') || this.accept('bool')) {
      const name = this.identifier(), size = this.arraySize(); const values: Expr[] = [];
      if (this.accept('=')) {
        if (this.accept('{')) { if (!this.is('}')) { do { values.push(this.expression()); } while (this.accept(',')); } this.expect('}'); }
        else values.push(this.expression());
      }
      if (values.length > size) this.fail('数组初始化值过多');
      return { kind: 'declare', name, size, values, line };
    }
    const target = this.variable(this.identifier(), line);
    const op = this.take().value;
    if (op === '++' || op === '--') return { kind: 'assign', target, op: op === '++' ? '+=' : '-=', value: { kind: 'number', value: 1, line }, line };
    if (!['=', '+=', '-=', '*=', '/='].includes(op)) this.fail(`不支持的赋值运算 ${op}`);
    return { kind: 'assign', target, op, value: this.expression(), line };
  }
  private expression(min = 0, output = false): Expr {
    const token = this.take(); let left: Expr;
    if (['-', '+', '!', '~'].includes(token.value)) left = { kind: 'unary', op: token.value, value: this.expression(11, output), line: token.line };
    else if (token.value === '(') { left = this.expression(); this.expect(')'); }
    else if (/^(\d|0x)/i.test(token.value)) {
      const value = Number(token.value); if (!Number.isSafeInteger(value) || value > 2147483647) this.fail('整数字面量须在 0–2147483647 范围内');
      left = { kind: 'number', value, line: token.line };
    }
    else if (/^[A-Za-z_]\w*$/.test(token.value)) {
      if (token.value === 'true' || token.value === 'false') left = { kind: 'number', value: Number(token.value === 'true'), line: token.line };
      else left = this.variable(token.value, token.line);
    } else this.fail(`无效表达式 “${token.value}”`);
    const precedence: Record<string, number> = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };
    while (precedence[this.token.value] !== undefined && precedence[this.token.value] >= min) {
      // cout's << separators are handled by the statement parser.
      if (output && this.is('<<')) break;
      const op = this.take(); const right = this.expression(precedence[op.value] + 1, output);
      left = { kind: 'binary', op: op.value, left, right, line: op.line };
    }
    return left;
  }
}

export function compile(source: string): Program {
  if (source.length > 30000) throw new Error('程序超过 30,000 字符限制');
  const ast = new Parser(tokenize(source)).parse();
  const instructions: Instruction[] = [], variables: Variable[] = [];
  const symbols = new Map<string, Variable>(); let address = 0x1000;
  const objects = new Map<string, ClassDefinition>();
  const emit = (instruction: Instruction) => { instructions.push(instruction); return instructions.length - 1; };
  const check = (name: string, line: number) => {
    if (objects.has(name)) throw new Error(`第 ${line} 行：对象 ${name} 不能作为整数使用，请访问具体成员`);
    if (name.includes('.')) {
      const [objectName, fieldName] = name.split('.'), definition = objects.get(objectName);
      if (!definition) throw new Error(`第 ${line} 行：${symbols.has(objectName) ? `${objectName} 不是类对象` : `对象 ${objectName} 未声明`}`);
      const field = definition.fields.find(item => item.name === fieldName);
      if (!field) throw new Error(`第 ${line} 行：类 ${definition.name} 没有成员 ${fieldName}`);
      if (field.access !== 'public') throw new Error(`第 ${line} 行：成员 ${name} 为 ${field.access}，不能在 main 中访问`);
    }
    if (!symbols.has(name)) throw new Error(`第 ${line} 行：变量 ${name} 未声明`);
  };
  const expression = (expr: Expr): void => {
    const line = expr.line;
    if (expr.kind === 'number') emit({ op: 'CONST', value: expr.value, line });
    if (expr.kind === 'variable') { check(expr.name, line); if (expr.index) expression(expr.index); emit({ op: 'LOAD', name: expr.name, indexed: !!expr.index, line }); }
    if (expr.kind === 'unary') { expression(expr.value); emit({ op: 'UNARY', operator: expr.op, line }); }
    if (expr.kind === 'binary') {
      expression(expr.left);
      if (expr.op === '&&' || expr.op === '||') {
        if (expr.op === '||') emit({ op: 'UNARY', operator: '!', line });
        const branch = emit({ op: 'JZ', line }); expression(expr.right);
        emit({ op: 'UNARY', operator: '!', line }); emit({ op: 'UNARY', operator: '!', line });
        const end = emit({ op: 'JMP', line }); instructions[branch].target = instructions.length;
        emit({ op: 'CONST', value: expr.op === '||' ? 1 : 0, line }); instructions[end].target = instructions.length;
      } else { expression(expr.right); emit({ op: 'BINARY', operator: expr.op, line }); }
    }
  };
  const statement = (stmt: Statement): void => {
    const line = stmt.line;
    switch (stmt.kind) {
      case 'block': stmt.body.forEach(statement); break;
      case 'declare': {
        if (symbols.has(stmt.name) || objects.has(stmt.name)) throw new Error(`第 ${line} 行：教学子集不支持同名变量或变量遮蔽：${stmt.name}`);
        if (address + stmt.size * 4 > 0x2000) throw new Error('变量内存超过 4 KiB');
        const variable = { name: stmt.name, size: stmt.size, address }; symbols.set(stmt.name, variable); variables.push(variable); address += stmt.size * 4;
        for (let i = 0; i < stmt.size; i++) {
          if (stmt.size > 1) emit({ op: 'CONST', value: i, line });
          expression(stmt.values[i] || { kind: 'number', value: 0, line }); emit({ op: 'STORE', name: stmt.name, indexed: stmt.size > 1, line });
        }
        break;
      }
      case 'object': {
        if (symbols.has(stmt.name) || objects.has(stmt.name)) throw new Error(`第 ${line} 行：教学子集不支持同名变量或变量遮蔽：${stmt.name}`);
        objects.set(stmt.name, stmt.definition);
        // Flatten fields in declaration order so existing memory views and IR retain member names.
        for (const field of stmt.definition.fields) statement({ kind: 'declare', name: `${stmt.name}.${field.name}`, size: field.size, values: [], line });
        if (!stmt.definition.fields.length) {
          if (address + 4 > 0x2000) throw new Error('变量内存超过 4 KiB');
          address += 4;
        }
        break;
      }
      case 'assign':
        check(stmt.target.name, line); if (stmt.target.index) expression(stmt.target.index);
        if (stmt.op !== '=') { expression(stmt.target); expression(stmt.value); emit({ op: 'BINARY', operator: stmt.op[0], line }); } else expression(stmt.value);
        emit({ op: 'STORE', name: stmt.target.name, indexed: !!stmt.target.index, line }); break;
      case 'if': {
        expression(stmt.condition); const branch = emit({ op: 'JZ', line }); statement(stmt.yes);
        if (stmt.no) { const end = emit({ op: 'JMP', line }); instructions[branch].target = instructions.length; statement(stmt.no); instructions[end].target = instructions.length; }
        else instructions[branch].target = instructions.length; break;
      }
      case 'for': case 'while': {
        if (stmt.kind === 'for') statement(stmt.init);
        const start = instructions.length; expression(stmt.condition); const branch = emit({ op: 'JZ', line }); statement(stmt.body);
        if (stmt.kind === 'for') statement(stmt.update);
        emit({ op: 'JMP', target: start, line }); instructions[branch].target = instructions.length; break;
      }
      case 'print': stmt.values.forEach(value => { expression(value); emit({ op: 'PRINT', line }); }); break;
      case 'return': expression(stmt.value); emit({ op: 'HALT', line }); break;
    }
  };
  statement(ast);
  emit({ op: 'CONST', value: 0, line: source.split('\n').length }); emit({ op: 'HALT', line: source.split('\n').length });
  return { instructions, variables, source };
}

export type Trace = { cycle: number; pc: number; text: string; detail: string };
export type ExecutionEvent = {
  pc: number; nextPc: number; instruction: Instruction; operands: number[]; result?: number;
  memory?: { address: number; name: string; index: number; value: number; direction: 'read' | 'write' };
  branch?: { target: number; taken: boolean }; error?: string;
};
export type Machine = {
  arch: Architecture; pc: number; cycles: number; registers: number[]; stack: number[]; memory: Record<string, number[]>;
  flags: { Z: boolean; N: boolean; C: boolean; V: boolean }; output: number[]; halted: boolean; result?: number; error?: string;
  changedRegisters: number[]; changedMemory: string[]; trace: Trace[]; lastPc: number | null; reads: number; writes: number; branches: number;
  execution?: ExecutionEvent;
};
export function createMachine(program: Program, arch: Architecture): Machine {
  return { arch, pc: 0, cycles: 0, registers: [0, 0, 0, 0, 0, 0, 0x8000, 0x8000], stack: [], memory: Object.fromEntries(program.variables.map(v => [v.name, Array(v.size).fill(0)])), flags: { Z: false, N: false, C: false, V: false }, output: [], halted: false, changedRegisters: [], changedMemory: [], trace: [], lastPc: null, reads: 0, writes: 0, branches: 0 };
}
export function instructionText(instruction: Instruction, arch: Architecture): string {
  const arm = arch.startsWith('arm'), r = architectures[arch].registers;
  const operand = instruction.name ? `[${instruction.name}${instruction.indexed ? ' + index*4' : ''}]` : '';
  switch (instruction.op) {
    case 'CONST': return `MOV ${r[0]}, ${arm ? '#' : ''}${instruction.value}`;
    case 'LOAD': return `${arm ? 'LDR' : 'MOV'} ${r[0]}, ${operand}`;
    case 'STORE': return `${arm ? 'STR' : 'MOV'} ${arm ? `${r[0]}, ${operand}` : `${operand}, ${r[0]}`}`;
    case 'BINARY': {
      const mnemonic: Record<string, string> = { '+': 'ADD', '-': 'SUB', '*': arm ? 'MUL' : 'IMUL', '/': arm ? 'SDIV' : 'IDIV', '%': 'REM', '&': 'AND', '|': arm ? 'ORR' : 'OR', '^': arm ? 'EOR' : 'XOR', '<<': arm ? 'LSL' : 'SHL', '>>': arm ? 'ASR' : 'SAR' };
      return `${mnemonic[instruction.operator!] || `CMP.${({ '==': 'EQ', '!=': 'NE', '<': 'LT', '>': 'GT', '<=': 'LE', '>=': 'GE' } as Record<string, string>)[instruction.operator!]}`} ${r[0]}, ${r[1]}`;
    }
    case 'UNARY': return `${instruction.operator === '-' ? 'NEG' : instruction.operator === '~' ? 'NOT' : instruction.operator === '!' ? 'LNOT' : 'MOV'} ${r[0]}`;
    case 'JZ': return `${arm ? 'CBZ' : 'JZ'} ${arm ? r[0] + ', ' : ''}0x${(0x400000 + instruction.target! * 4).toString(16)}`;
    case 'JMP': return `${arm ? 'B' : 'JMP'} 0x${(0x400000 + instruction.target! * 4).toString(16)}`;
    case 'PRINT': return 'OUT stdout';
    case 'HALT': return 'RET';
  }
}

export function step(program: Program, previous: Machine): Machine {
  if (previous.halted) return previous;
  const m: Machine = { ...previous, registers: [...previous.registers], stack: [...previous.stack], memory: { ...previous.memory }, flags: { ...previous.flags }, output: [...previous.output], changedRegisters: [], changedMemory: [], trace: [...previous.trace] };
  const instruction = program.instructions[m.pc];
  if (!instruction) return { ...m, halted: true, error: '指令地址越界' };
  if (m.cycles >= 100000) return { ...m, halted: true, error: '执行超过 100,000 条指令，请检查循环条件' };
  const oldPc = m.pc; m.lastPc = oldPc; m.pc++; m.cycles++; let detail = '';
  const execution: ExecutionEvent = { pc: oldPc, nextPc: m.pc, instruction, operands: [] };
  m.execution = execution;
  const setRegister = (index: number, value: number) => { m.registers[index] = value; if (previous.registers[index] !== value) m.changedRegisters.push(index); };
  const pop = () => { const value = m.stack.pop(); if (value === undefined) throw new Error('表达式栈下溢'); return value; };
  const push = (value: number) => { const n = value | 0; m.stack.push(n); setRegister(0, n); return n; };
  const flags = (value: number, raw = value) => { m.flags = { Z: value === 0, N: value < 0, C: raw > 0xffffffff || raw < 0, V: raw > 2147483647 || raw < -2147483648 }; };
  const indexFor = (name: string, indexed?: boolean) => {
    const index = indexed ? pop() : 0;
    if (index < 0 || index >= m.memory[name].length) throw new Error(`数组越界：${name}[${index}]`);
    return index;
  };
  try {
    switch (instruction.op) {
      case 'CONST': execution.result = push(instruction.value!); detail = `常量 ${instruction.value} → ${architectures[m.arch].registers[0]}`; break;
      case 'LOAD': {
        const index = indexFor(instruction.name!, instruction.indexed); const value = m.memory[instruction.name!][index]; push(value); m.reads++;
        const address = program.variables.find(v => v.name === instruction.name)!.address + index * 4;
        execution.memory = { address, name: instruction.name!, index, value, direction: 'read' }; execution.result = value;
        setRegister(2, address); detail = `读取 ${instruction.name}[${index}] = ${value}`; break;
      }
      case 'STORE': {
        const value = pop(), index = indexFor(instruction.name!, instruction.indexed); m.memory[instruction.name!] = [...m.memory[instruction.name!]]; m.memory[instruction.name!][index] = value;
        const address = program.variables.find(v => v.name === instruction.name)!.address + index * 4;
        execution.memory = { address, name: instruction.name!, index, value, direction: 'write' }; execution.operands = [value];
        m.changedMemory.push(`${instruction.name}:${index}`); setRegister(0, value); setRegister(2, address); m.writes++; detail = `写入 ${instruction.name}[${index}] ← ${value}`; break;
      }
      case 'BINARY': {
        const b = pop(), a = pop(); execution.operands = [a, b]; setRegister(1, b); let raw = 0;
        switch (instruction.operator) {
          case '+': raw = a + b; break; case '-': raw = a - b; break; case '*': raw = Number(BigInt.asIntN(32, BigInt(a) * BigInt(b))); break;
          case '/': if (!b) throw new Error('除数不能为 0'); raw = Math.trunc(a / b); break;
          case '%': if (!b) throw new Error('除数不能为 0'); raw = a % b; break;
          case '<': raw = Number(a < b); break; case '>': raw = Number(a > b); break; case '<=': raw = Number(a <= b); break; case '>=': raw = Number(a >= b); break;
          case '==': raw = Number(a === b); break; case '!=': raw = Number(a !== b); break;
          case '&': raw = a & b; break; case '|': raw = a | b; break; case '^': raw = a ^ b; break;
          case '<<': case '>>': if (b < 0 || b >= 32) throw new Error('移位位数须在 0–31 范围内'); raw = instruction.operator === '<<' ? a << b : a >> b; break;
        }
        const value = push(raw); execution.result = value; flags(value, raw); detail = `${a} ${instruction.operator} ${b} = ${value}`; break;
      }
      case 'UNARY': { const a = pop(); execution.operands = [a]; const value = push(instruction.operator === '-' ? -a : instruction.operator === '!' ? Number(!a) : instruction.operator === '~' ? ~a : a); execution.result = value; flags(value); detail = `${instruction.operator}${a} = ${value}`; break; }
      case 'JZ': { const value = pop(); execution.operands = [value]; execution.branch = { target: instruction.target!, taken: value === 0 }; flags(value); if (value === 0) { m.pc = instruction.target!; m.branches++; } detail = value === 0 ? '条件为假，跳转至目标指令' : '条件为真，继续执行'; break; }
      case 'JMP': execution.branch = { target: instruction.target!, taken: true }; m.pc = instruction.target!; m.branches++; detail = '无条件跳转'; break;
      case 'PRINT': { const value = pop(); execution.operands = [value]; m.output.push(value); detail = `标准输出：${value}`; break; }
      case 'HALT': m.result = pop(); execution.result = m.result; setRegister(0, m.result); m.halted = true; detail = `程序结束，返回值 ${m.result}`; break;
    }
    setRegister(7, 0x8000 - m.stack.length * (architectures[m.arch].bits / 8));
  } catch (error) { m.error = (error as Error).message; execution.error = m.error; m.halted = true; detail = m.error; }
  execution.nextPc = m.pc;
  m.trace.push({ cycle: m.cycles, pc: oldPc, text: instructionText(instruction, m.arch), detail });
  if (m.trace.length > 160) m.trace.shift();
  return m;
}

export function run(program: Program, arch: Architecture): Machine {
  let machine = createMachine(program, arch);
  while (!machine.halted) machine = step(program, machine);
  return machine;
}

export function hex(value: number, bits = 32) { return BigInt.asUintN(bits, BigInt(value)).toString(16).toUpperCase().padStart(bits / 4, '0'); }
