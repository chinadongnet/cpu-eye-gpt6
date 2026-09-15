import { useId } from 'react';
import { Cpu } from 'lucide-react';
import { architectures, hex, instructionText, type Machine } from './engine';
import './simple-cpu.css';

const address = (value: number) => `0x${hex(value)}`;
const codeAddress = (pc: number) => address(0x400000 + pc * 4);

export default function SimpleCpu({ machine, running }: { machine: Machine; running: boolean }) {
  const id = useId();
  const model = architectures[machine.arch];
  const event = machine.execution, instruction = event?.instruction;
  const memory = event?.memory, branch = event?.branch;
  const alu = instruction?.op === 'BINARY' || instruction?.op === 'UNARY';
  const valid = !!event && !machine.error;
  const read = memory?.direction === 'read', write = memory?.direction === 'write';
  const writeback = event?.result !== undefined;
  const status = machine.error ? 'error' : machine.halted ? 'halted' : running ? 'running' : event ? 'paused' : 'idle';
  const statusText = { error: '执行异常', halted: '已完成', running: '运行中', paused: '单步快照', idle: '准备就绪' }[status];
  const call = instruction?.op === 'CALL', returned = instruction?.op === 'RET';
  const operation = call ? '函数调用' : returned ? '函数返回' : alu ? '算术 / 逻辑' : read ? '读取内存' : write ? '写入内存' : branch ? '分支判断' : instruction?.op === 'PRINT' ? '标准输出' : instruction?.op === 'HALT' ? '程序返回' : instruction ? '数据传送' : '等待指令';
  const summary = machine.error || (call || returned ? machine.trace.at(-1)?.detail : alu ? `${event?.operands.join(` ${instruction.operator} `)} = ${event?.result}` : branch ? `${branch.taken ? '已跳转' : '未跳转'} → ${codeAddress(machine.pc)}` : machine.halted ? `程序已结束 · 返回值 ${machine.result}` : machine.trace.at(-1)?.detail || '等待第一条指令唤醒数据通路');
  const stages = ['取指', '译码', alu ? '运算' : memory ? '访存' : branch ? '分支' : '执行', branch ? '更新 PC' : write ? '写入内存' : instruction?.op === 'PRINT' ? '输出' : instruction?.op === 'HALT' ? '返回' : '写回'];
  const active = (condition: boolean) => condition && valid ? ' is-active' : '';
  // Paths follow this teaching engine's execution event, including writes whose value is unchanged.
  const routes = [
    { name: 'fetch', color: 'address', on: !!event, d: 'M 4 75 H 52' },
    { name: 'next-pc', color: 'address', on: !!event, d: 'M 410 42 V 22 H 28 V 55 H 4' },
    { name: 'decode', color: 'control', on: alu, d: 'M 178 76 H 258 V 99' },
    { name: 'control', color: 'control', on: !!event, d: 'M 178 59 H 354' },
    { name: 'immediate', color: 'data', on: instruction?.op === 'CONST', d: 'M 115 105 V 135' },
    { name: 'operands', color: 'data', on: alu, d: 'M 178 156 H 200 V 112 H 222' },
    { name: 'writeback', color: 'data', on: alu && writeback, d: 'M 260 180 V 212 H 194 V 179 H 178' },
    { name: 'memory-control', color: 'control', on: !!memory, d: 'M 334 59 V 150 H 354' },
    { name: 'memory-data', color: 'data', on: !!memory, d: read ? 'M 354 188 H 324 V 230 H 114 V 199' : 'M 114 199 V 230 H 324 V 188 H 354' },
    { name: 'memory-bus', color: 'data', on: !!memory, d: read ? 'M 516 171 H 466' : 'M 466 171 H 516' },
    { name: 'branch', color: 'control', on: !!branch, d: 'M 178 144 H 190 V 119 H 410 V 105' },
  ];

  return <div className="diagram-chip simple-cpu" data-testid="simple-cpu" data-status={status}>
    <div className="simple-heading">
      <span><Cpu size={16} /><strong>{model.label}</strong><small>CPU CORE</small></span>
      <span className="simple-clock"><svg viewBox="0 0 36 16" aria-hidden="true"><path d="M0 12 H5 V4 H13 V12 H21 V4 H29 V12 H36" /></svg><i />{statusText}</span>
    </div>
    <div className="simple-instruction" data-testid="simple-ir">
      <span>IR <small>当前指令</small></span>
      <code title={instruction ? instructionText(instruction, machine.arch) : '等待取指'}>{instruction ? instructionText(instruction, machine.arch) : '等待取指 · 点击单步或运行'}</code>
    </div>

    <svg className="simple-silicon" viewBox="0 0 520 250" role="img" aria-label="CPU 芯片：控制单元、寄存器、ALU 与内存接口；亮线表示本条指令的数据通路">
      <defs>
        <linearGradient id={`${id}-package`} x2="0.8" y2="1"><stop stopColor="#344b50" /><stop offset=".5" stopColor="#1b2b33" /><stop offset="1" stopColor="#293c42" /></linearGradient>
        <linearGradient id={`${id}-die`} x2="1" y2="1"><stop stopColor="#172b32" /><stop offset="1" stopColor="#101c27" /></linearGradient>
        <pattern id={`${id}-grid`} width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0 H0 V12" fill="none" stroke="#98c4c5" strokeOpacity=".055" /></pattern>
      </defs>
      <g className="silicon-pins" aria-hidden="true">
        {Array.from({ length: 26 }, (_, i) => <g key={i}><rect x={54 + i * 16} y="3" width="7" height="15" rx="1" /><rect x={54 + i * 16} y="234" width="7" height="13" rx="1" /></g>)}
        {Array.from({ length: 11 }, (_, i) => <g key={i}><rect x="5" y={36 + i * 17} width="17" height="7" rx="1" /><rect x="498" y={36 + i * 17} width="17" height="7" rx="1" /></g>)}
      </g>
      <rect x="20" y="14" width="480" height="222" rx="12" fill={`url(#${id}-package)`} className="silicon-package" />
      <rect x="37" y="31" width="446" height="188" rx="6" fill={`url(#${id}-die)`} className="silicon-die" />
      <rect x="37" y="31" width="446" height="188" rx="6" fill={`url(#${id}-grid)`} />
      <g className="silicon-screws" aria-hidden="true">{[[28, 23], [492, 23], [28, 227], [492, 227]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" />)}</g>
      <g fill="none" aria-hidden="true">
        {routes.map(route => <path key={route.name} d={route.d} className={`silicon-trace trace-${route.color}${active(route.on)}`} data-route={route.name} />)}
        {valid && !machine.halted && <g key={running ? 'running' : machine.cycles} className="silicon-packets">
          {routes.filter(route => route.on).map(route => <path key={route.name} d={route.d} pathLength="100" className={`silicon-packet trace-${route.color}`} />)}
        </g>}
      </g>

      <g className={`silicon-module silicon-cu${active(!!event)}`}>
        <rect x="52" y="42" width="126" height="63" rx="5" />
        <text x="64" y="63" className="silicon-label">控制单元 <tspan className="silicon-abbr">CU</tspan></text>
        <text x="64" y="86" className="silicon-value">{operation}</text>
        <g className="silicon-gates" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={64 + i * 17} y="94" width="10" height="3" />)}</g>
      </g>
      <g className={`silicon-module silicon-pc${active(!!event)}`} data-testid="simple-pc">
        <rect x="354" y="42" width="112" height="63" rx="5" />
        <text x="365" y="62" className="silicon-label">下一条 <tspan className="silicon-abbr">PC</tspan></text>
        <text x="410" y="82" textAnchor="middle" className="silicon-address">{codeAddress(machine.pc)}</text>
        <text x="410" y="97" textAnchor="middle" className="silicon-note">{machine.error ? '执行停止' : machine.halted ? '停止后的地址' : branch ? branch.taken ? '跳转到目标' : '顺序执行' : '指向指令内存'}</text>
      </g>
      <g className={`silicon-module silicon-registers${active(writeback || machine.changedRegisters.length > 0)}`} data-testid="simple-registers">
        <rect x="52" y="135" width="126" height="64" rx="5" />
        <text x="64" y="153" className="silicon-label">寄存器组</text>
        {model.registers.slice(0, 2).map((name, i) => <g key={name} className={machine.changedRegisters.includes(i) && valid ? 'register-lit' : ''}>
          <text x="64" y={172 + i * 17} className="silicon-register-name">{name}</text>
          <text x="166" y={172 + i * 17} textAnchor="end" className="silicon-register-value" fontSize={String(machine.registers[i]).length > 8 ? 10 : 12}>{machine.registers[i]}</text>
        </g>)}
      </g>
      <g className={`silicon-alu${active(alu)}${alu && machine.error ? ' is-error' : ''}`} data-testid="simple-alu">
        <text x="260" y="85" textAnchor="middle" className="silicon-label">算术逻辑单元</text>
        <path d="M214 99 H246 L260 115 L274 99 H306 L285 178 H235 Z" />
        <text x="260" y="145" textAnchor="middle" className="silicon-operator">{alu ? instruction.operator : 'ALU'}</text>
        <text x="260" y="166" textAnchor="middle" className="silicon-note">{alu ? 'EXECUTE' : 'STANDBY'}</text>
        <text x="260" y="199" textAnchor="middle" className="silicon-result" fontSize={String(event?.result ?? '').length > 8 ? 12 : 16}>{alu ? machine.error ? '运算异常' : `= ${event?.result ?? '—'}` : '等待运算'}</text>
        <title>{alu ? `${event?.operands.join(` ${instruction.operator} `)} → ${event?.result ?? machine.error}` : '本条指令未使用 ALU'}</title>
      </g>
      <g className={`silicon-module silicon-memory${active(!!memory)}`} data-testid="simple-memory">
        <rect x="354" y="135" width="112" height="64" rx="5" />
        <text x="365" y="155" className="silicon-label">内存接口</text>
        <text x="410" y="176" textAnchor="middle" className="silicon-value" style={memory && String(memory.value).length > 6 ? { fontSize: 9 } : undefined}>{memory ? `${read ? '↓ READ' : '↑ WRITE'} ${memory.value}` : 'I/O · 空闲'}</text>
        <text x="410" y="191" textAnchor="middle" className="silicon-address">{memory ? address(memory.address) : '等待数据传送'}</text>
      </g>
      <text x="260" y="48" textAnchor="middle" className="silicon-note silicon-sp">SP {address(machine.registers[7])} · {model.bits}-BIT</text>
    </svg>

    <div className={`simple-cycle${active(!!event)}`} aria-label="本条指令处理流程">
      {stages.map((stage, index) => <span key={index}><b>{String(index + 1).padStart(2, '0')}</b>{stage}{index < stages.length - 1 && <i aria-hidden="true">›</i>}</span>)}
    </div>
    <div className="simple-result" data-testid="simple-result"><i /><span title={summary}>{summary}</span></div>
  </div>;
}
