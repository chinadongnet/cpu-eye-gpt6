import { useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, Maximize2, Minimize2 } from 'lucide-react';
import { architectures, hex, instructionText, type Machine, type Program } from './engine';
import './cpu-diagram.css';
import StackMemory from './StackMemory';
import SimpleCpu from './SimpleCpu';

const address = (value: number) => `0x${hex(value)}`;
const codeAddress = (pc: number) => address(0x400000 + pc * 4);
const groups = [
  { label: '传送', ops: ['CONST', 'LOAD', 'STORE'] },
  { label: '运算 / 逻辑', ops: ['BINARY', 'UNARY'] },
  { label: '分支', ops: ['JZ', 'JMP'] },
  { label: '输出 / 返回', ops: ['PRINT', 'HALT'] },
];

export default function CpuDiagram({ program, machine, running, dirty }: { program: Program; machine: Machine; running: boolean; dirty: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<'simple' | 'detailed'>('simple');
  const [memoryView, setMemoryView] = useState<'stack' | 'ram'>('stack');
  const root = useRef<HTMLElement>(null);
  const event = machine.execution, instruction = event?.instruction, model = architectures[machine.arch];
  const memory = event?.memory, branch = event?.branch;
  const alu = instruction?.op === 'BINARY' || instruction?.op === 'UNARY';
  const successful = !!event && !machine.error;
  const next = !machine.halted ? program.instructions[machine.pc] : undefined;
  const focusPc = event?.pc ?? machine.pc;
  const start = Math.max(0, Math.min(focusPc - 2, program.instructions.length - 6));
  const instructionSet = useMemo(() => [...new Set(program.instructions.map(item => instructionText(item, machine.arch).split(' ')[0]))], [program, machine.arch]);
  const cells = program.variables.flatMap(variable => machine.memory[variable.name].map((value, index) => ({
    name: variable.size > 1 ? `${variable.name}[${index}]` : variable.name,
    address: variable.address + index * 4, value,
  })));
  const memoryIndex = memory ? cells.findIndex(cell => cell.address === memory.address) : 0;
  const memoryStart = Math.max(0, Math.min(memoryIndex - 1, cells.length - 5));
  const active = (condition: boolean) => condition && successful ? ' active' : '';
  const mnemonic = instruction ? instructionText(instruction, machine.arch).split(' ')[0] : '';
  useEffect(() => {
    if (!expanded) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.focus();
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); };
  }, [expanded]);

  return <section ref={root} tabIndex={-1} className={`panel cpu-diagram-panel diagram-${view} ${expanded ? 'diagram-expanded' : ''} ${running ? 'diagram-running' : ''}`} aria-label="CPU 动态示意图" role={expanded ? 'dialog' : 'region'} aria-modal={expanded || undefined}>
    <div className="panel-header"><div className="panel-title"><Cpu size={18} /><h2>CPU 动态示意图</h2><span className="subtle-tag">{model.label} · {model.bits}-BIT</span></div><div className="panel-tools"><div className="diagram-view-switch" role="group" aria-label="CPU 示意图模式"><button aria-pressed={view === 'simple'} onClick={() => setView('simple')}>简单模式</button><button aria-pressed={view === 'detailed'} onClick={() => setView('detailed')}>详细模式</button></div><span className="diagram-step">STEP {machine.cycles}</span><button className="icon-button" title={expanded ? '退出示意图全屏' : '展开 CPU 示意图'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></div></div>
    <div className="diagram-caption"><span><i className="tiny-dot" />{dirty ? '源码已修改 · 图示保留上次编译状态' : machine.error ? `执行停止：${machine.error}` : event ? `已执行第 ${instruction!.line} 行 · ${instructionText(instruction!, machine.arch)}` : '点击单步或运行，观察指令如何驱动 CPU'}</span><span>蓝色：地址 / 取指　绿色：数据　紫色：控制</span></div>
    <div className="diagram-scroll"><div className="diagram-board">
      <div className="diagram-memory instruction-memory">
        <div className="diagram-box-title">指令内存 <small>INSTRUCTION MEMORY</small></div>
        <div className="diagram-table-heading"><span>指令地址</span><span>架构风格指令</span></div>
        <div className="diagram-rom">{program.instructions.slice(start, start + 6).map((item, offset) => {
          const pc = start + offset;
          return <div key={pc} className={`diagram-rom-row ${event?.pc === pc ? 'latched' : ''} ${next && machine.pc === pc ? 'next' : ''}`} title={`第 ${item.line} 行：${instructionText(item, machine.arch)}`}><code>{codeAddress(pc)}</code><code>{instructionText(item, machine.arch)}</code><small>{event?.pc === pc ? 'IR' : next && machine.pc === pc ? 'PC' : ''}</small></div>;
        })}</div>
        <div className="diagram-next"><span>{machine.halted ? '执行已停止' : '下一条指令'}</span><code>{next ? `${codeAddress(machine.pc)} · ${instructionText(next, machine.arch)}` : machine.error || `返回值 ${machine.result ?? '—'}`}</code></div>
        <div className="diagram-box-title isa-title">本程序指令集 <small>教学映射</small></div>
        <div className="diagram-isa">{instructionSet.map(item => <span key={item} className={item === mnemonic ? 'selected' : ''}>{item}</span>)}</div>
      </div>

      <div className="diagram-bus instruction-bus" aria-label="取指总线"><div className={`bus-track address-bus bus-reverse${active(!!event)}`}><span>地址</span><b>←</b></div><div className={`bus-track data-bus${active(!!event)}`}><span>指令</span><b>→</b></div></div>

      {view === 'simple' ? <SimpleCpu machine={machine} running={running} /> : <div className="diagram-chip">
        <div className="chip-heading"><span><Cpu size={17} />{model.label} CPU CORE</span><small>教学执行快照</small></div>
        <div className="chip-control-row">
          <div className={`chip-module pc-module${active(!!branch?.taken)}`} data-testid="diagram-pc"><label>PC · 程序计数器</label><strong>{codeAddress(machine.pc)}</strong><small>{machine.halted ? '停止后的 PC' : '下一条取指地址'}</small></div>
          <span className={`chip-connector${active(!!event)}`}>→</span>
          <div className={`chip-module ir-module${active(!!event)}`} data-testid="diagram-ir"><label>IR · 指令寄存器</label><strong>{instruction ? instructionText(instruction, machine.arch) : '等待取指'}</strong><small>{event ? `${codeAddress(event.pc)} · C++ 第 ${instruction!.line} 行` : '尚未执行指令'}</small></div>
        </div>
        <div className={`chip-down control-wire${active(!!event)}`}>↓ <span>译码 / 控制信号</span></div>
        <div className="chip-decoder"><span>控制单元 CU</span><div>{groups.map(group => <span key={group.label} className={instruction && group.ops.includes(instruction.op) ? 'selected' : ''}>{group.label}</span>)}</div></div>
        <div className="chip-down">↓ <span>执行 / 数据传送</span></div>
        <div className="chip-execution-row">
          <div className={`chip-module chip-registers${active(machine.changedRegisters.length > 0)}`}><label>寄存器组 · REGISTER FILE</label>{model.registers.slice(0, 4).map((name, i) => <div key={name} className={machine.changedRegisters.includes(i) ? 'changed-value' : ''}><span>{name}</span><code title={`0x${hex(machine.registers[i], model.bits)}`}>{machine.registers[i]}</code></div>)}<small>{model.registers[7]} = {address(machine.registers[7])}</small></div>
          <span className={`chip-connector${active(alu)}`}>⇄</span>
          <div className={`chip-module chip-alu${active(alu)}`} data-testid="diagram-alu"><label>ALU · 算术逻辑单元</label><div className="alu-operand"><span>A</span><code>{alu ? event?.operands[0] ?? '—' : '—'}</code><span>B</span><code>{alu ? event?.operands[1] ?? '—' : '—'}</code></div><div className="alu-symbol">{alu ? instruction.operator : 'ALU'}</div><strong>{alu ? event?.error ? '运算异常' : `结果 = ${event?.result}` : '等待运算'}</strong><small>{Object.entries(machine.flags).map(([name, value]) => `${name}=${Number(value)}`).join('  ')}</small></div>
        </div>
        <div className={`chip-down${active(!!memory)}`}>↓ <span>地址计算 / 数据读写</span></div>
        <div className={`chip-memory-interface${active(!!memory)}`} data-testid="diagram-memory-interface"><div><label>MAR · 地址寄存器</label><code>{memory ? address(memory.address) : '—'}</code></div><div><label>MDR · 数据寄存器</label><code>{memory ? `${memory.value} / 0x${hex(memory.value)}` : '—'}</code></div><span>{memory ? memory.direction === 'read' ? 'READ' : 'WRITE' : 'IDLE'}</span></div>
        <div className={`chip-branch${active(!!branch)}`} data-testid="diagram-branch"><span>↳ 分支 / PC 更新</span><code>{branch ? `${branch.taken ? '已跳转' : '未跳转'} · 目标 ${codeAddress(branch.target)} → PC ${codeAddress(machine.pc)}` : event ? `${codeAddress(event.pc)} → ${codeAddress(machine.pc)}` : '等待执行'}</code></div>
      </div>}

      <div className="diagram-bus memory-bus" aria-label="内存总线"><div className={`bus-track address-bus${active(!!memory)}`}><span>地址</span><b>→</b></div><div className={`bus-track data-bus${memory?.direction === 'read' ? ' bus-reverse' : ''}${active(!!memory)}`}><span>数据</span><b>{memory?.direction === 'read' ? '←' : '→'}</b></div><div className={`bus-track control-bus${active(!!memory)}`}><span>读 / 写</span><b>→</b></div></div>

      <div className="diagram-memory data-memory">
        <div className="diagram-box-title">{memoryView === 'stack' ? '函数栈内存' : '数据存储器'} <small>{memoryView === 'stack' ? 'STACK MEMORY' : 'DATA / RAM'}</small></div>
        <div className="diagram-memory-switch" role="group" aria-label="右侧内存视图"><button aria-pressed={memoryView === 'stack'} onClick={() => setMemoryView('stack')}>函数栈</button><button aria-pressed={memoryView === 'ram'} onClick={() => setMemoryView('ram')}>数据内存</button></div>
        <div className={`diagram-access${active(!!memory)}`} data-testid="diagram-access"><span>{memory ? memory.direction === 'read' ? 'READ · 读取内存' : 'WRITE · 写入内存' : '总线空闲'}</span><strong>{memory ? address(memory.address) : '—'}</strong><code>{memory ? `${memory.name}${instruction?.indexed ? `[${memory.index}]` : ''} = ${memory.value}` : '执行 LOAD / STORE 时更新'}</code></div>
        {memoryView === 'stack' ? <StackMemory program={program} machine={machine} /> : <><div className="diagram-ram">{cells.slice(memoryStart, memoryStart + 5).map(cell => <div key={cell.address} className={memory?.address === cell.address ? 'selected' : ''}><div><code>{address(cell.address)}</code><span title={cell.name}>{cell.name}</span></div><div><strong>{cell.value}</strong><code>{[0, 1, 2, 3].map(byte => ((cell.value >>> (byte * 8)) & 255).toString(16).toUpperCase().padStart(2, '0')).join(' ')}</code></div></div>)}{!cells.length && <p>程序未声明数据变量</p>}</div><div className="diagram-memory-note">32 位数据 · 小端字节序<br />自动跟随当前访问地址</div></>}
        <div className="diagram-io"><span>OUTPUT / RETURN</span><code>{instruction?.op === 'PRINT' ? `stdout ← ${event?.operands[0]}` : machine.halted ? machine.error || `return ${machine.result}` : '—'}</code></div>
      </div>
    </div></div>
    <div className="diagram-footer"><span>{machine.trace.at(-1)?.detail || 'PC 指向下一条指令；IR 保留最近执行指令。'}</span><span>一次单步 = 一条教学指令；连线表示本次参与的数据通路</span></div>
  </section>;
}
