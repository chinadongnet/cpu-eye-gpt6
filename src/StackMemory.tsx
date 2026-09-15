import { useEffect, useRef } from 'react';
import { ArrowDown, Layers3 } from 'lucide-react';
import { architectures, hex, type Machine, type Program } from './engine';
import './stack-memory.css';

const address = (value: number) => `0x${hex(value)}`;

export default function StackMemory({ program, machine }: { program: Program; machine: Machine }) {
  const localsRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef<HTMLDivElement>(null);
  const word = architectures[machine.arch].bits / 8;
  const access = machine.execution?.memory;
  const frame = machine.frames.at(-1)!;
  const fn = program.functions.find(item => item.name === frame.name)!;
  const locals = program.variables.filter(variable => variable.functionName === frame.name).flatMap(variable => machine.memory[variable.name].map((value, index) => ({
    name: variable.size > 1 ? `${variable.localName}[${index}]` : variable.localName, parameter: variable.parameter,
    address: variable.address + index * 4, value, key: `${variable.name}:${index}`,
  })));
  useEffect(() => {
    const container = localsRef.current;
    const row = container?.querySelector<HTMLElement>('[data-accessed="true"]');
    if (container && row) {
      const top = row.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientTop;
      if (top < 0 || top + row.offsetHeight > container.clientHeight) container.scrollTop += top - (container.clientHeight - row.offsetHeight) / 2;
    }
  }, [access?.address, machine.cycles]);
  useEffect(() => {
    const container = valuesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [machine.stack.length, program, machine.arch]);

  return <div className="stack-memory-view" data-testid="diagram-stack">
    {machine.frames.length > 1 && <ol className="stack-call-chain" aria-label="函数调用链">
      {machine.frames.map((item, index) => <li key={item.name} aria-current={item === frame ? 'step' : undefined}><code>{item.name}()</code><span>{item === frame ? '当前执行' : '等待返回'} · FRAME {String(index + 1).padStart(2, '0')}</span></li>)}
    </ol>}
    <div className="stack-frame" data-state={machine.error ? 'error' : machine.halted ? 'returned' : 'active'}>
      <div className="stack-frame-header">
        <div className="stack-frame-name"><Layers3 size={15} aria-hidden="true" /><strong>{frame.name}()</strong><small>FRAME {String(machine.frames.length).padStart(2, '0')}</small></div>
        <span><i />{machine.error ? '异常暂停' : machine.halted ? '已返回 · 最终快照' : machine.cycles ? `执行中 · ${machine.frames.length} 个栈帧` : '入口帧 · 就绪'}</span>
      </div>
      <div className="stack-frame-body">
        <div className="stack-locals-section">
          <div className="stack-section-title"><span>参数 / 局部变量 / 对象成员</span><small>{locals.length * 4} B 数据</small></div>
          <div className="stack-local-list" ref={localsRef} role="list" aria-label={`${frame.name} 局部数据`}>
            {locals.map(cell => <div key={cell.key} role="listitem" data-accessed={access?.address === cell.address} className={`stack-local-row ${access?.address === cell.address ? 'accessed' : ''} ${machine.changedMemory.includes(cell.key) ? 'written' : ''}`}>
              <div className="stack-local-value"><span title={cell.name}>{cell.name}</span><strong>{cell.value}</strong></div>
              <div className="stack-local-address"><code>{address(cell.address)}</code><small>{cell.parameter ? '参数 · ' : ''}{machine.changedMemory.includes(cell.key) ? '写入' : access?.address === cell.address ? '读取' : '4 B'}</small></div>
              <small className="stack-local-bytes">{[0, 1, 2, 3].map(byte => ((cell.value >>> (byte * 8)) & 255).toString(16).toUpperCase().padStart(2, '0')).join(' ')}</small>
            </div>)}
            {!locals.length && <p className="stack-empty">当前函数没有局部变量</p>}
          </div>
        </div>
        <div className="stack-section-title"><span>临时求值栈</span><small>{machine.stack.length} 层 · {machine.stack.length * word} B</small></div>
        <div className="stack-pointers"><span>栈基 <code>0x00008000</code></span><span>SP <code data-testid="stack-sp">{address(machine.registers[7])}</code></span></div>
        <div className="stack-well">
          <div className="stack-growth"><span>向低地址增长</span><i /><ArrowDown size={13} aria-hidden="true" /></div>
          <div className="stack-column">
            <div className="stack-base"><span>栈底 · 高地址</span><small>{machine.stack.length ? 'BOTTOM' : 'SP → 栈基'}</small></div>
            <div className="stack-value-list" ref={valuesRef} data-testid="stack-values" role="list" aria-label="临时求值栈数据槽，高地址到低地址">
              {machine.stack.map((value, index) => <div key={index} role="listitem" className={`stack-slot ${index === machine.stack.length - 1 ? 'stack-top' : ''}`}>
                <div className="stack-slot-value"><code>{address(0x8000 - (index + 1) * word)}</code><strong>{value}</strong></div>
                <div className="stack-slot-label"><small>#{String(index + 1).padStart(2, '0')} · {word} B</small><span>{index === machine.stack.length - 1 ? 'SP → 栈顶' : '临时值'}</span></div>
              </div>)}
              {!machine.stack.length && <div className="stack-empty-slots"><div aria-hidden="true" /><p className="stack-empty">栈为空<span>表达式执行时自动入栈 / 出栈</span></p></div>}
            </div>
          </div>
        </div>
        <div className="stack-footprint">后进先出 LIFO <span>每槽 {word} B</span></div>
      </div>
      <div className="stack-frame-meta"><span>入口 <code>{address(0x400000 + fn.entry * 4)}</code></span><span>返回至 <code>{frame.returnPc === null ? '浏览器宿主' : address(0x400000 + frame.returnPc * 4)}</code></span></div>
    </div>
    <p className="stack-model-note">教学调用帧：展示当前函数参数、局部数据和调用链。参数先进入求值栈，再逐项写入局部数据；返回地址单独保存，不计入 SP。各函数使用独立固定数据区，暂不支持递归或原生 ABI。</p>
  </div>;
}
