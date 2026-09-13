import { useEffect, useRef } from 'react';
import { architectures, hex, type Machine, type Program } from './engine';

const address = (value: number) => `0x${hex(value)}`;

export default function StackMemory({ program, machine }: { program: Program; machine: Machine }) {
  const localsRef = useRef<HTMLDivElement>(null);
  const word = architectures[machine.arch].bits / 8;
  const access = machine.execution?.memory;
  const locals = program.variables.flatMap(variable => machine.memory[variable.name].map((value, index) => ({
    name: variable.size > 1 ? `${variable.name}[${index}]` : variable.name,
    address: variable.address + index * 4, value, key: `${variable.name}:${index}`,
  })));
  useEffect(() => {
    const container = localsRef.current;
    const row = container?.querySelector<HTMLElement>('[data-accessed="true"]');
    if (container && row) {
      const top = row.offsetTop - container.scrollTop;
      if (top < 0 || top + row.offsetHeight > container.clientHeight) container.scrollTop = row.offsetTop - container.clientHeight / 2;
    }
  }, [access?.address, machine.cycles]);

  return <div className="stack-memory-view" data-testid="diagram-stack">
    <div className="stack-frame-header"><strong>main()</strong><span>{machine.error ? '异常暂停' : machine.halted ? '已返回 · 最终快照' : machine.cycles ? '执行中 · 1 个栈帧' : '入口帧 · 就绪'}</span></div>
    <div className="stack-frame-meta"><span>入口 <code>0x00400000</code></span><span>返回至 <code>浏览器宿主</code></span></div>
    <div className="stack-section-title">局部变量 / 对象成员 <small>{locals.length * 4} B 数据</small></div>
    <div className="stack-local-list" ref={localsRef}>
      {locals.map(cell => <div key={cell.key} data-accessed={access?.address === cell.address} className={`stack-local-row ${access?.address === cell.address ? 'accessed' : ''} ${machine.changedMemory.includes(cell.key) ? 'written' : ''}`}>
        <div><code>{address(cell.address)}</code><span title={cell.name}>{cell.name}</span><strong>{cell.value}</strong></div>
        <small>{[0, 1, 2, 3].map(byte => ((cell.value >>> (byte * 8)) & 255).toString(16).toUpperCase().padStart(2, '0')).join(' ')}{machine.changedMemory.includes(cell.key) ? ' · 写入' : access?.address === cell.address ? ' · 读取' : ''}</small>
      </div>)}
      {!locals.length && <p className="stack-empty">当前函数没有局部变量</p>}
    </div>
    <div className="stack-section-title">临时求值栈 <small>↓ 向低地址增长</small></div>
    <div className="stack-pointers"><span>栈基 <code>0x00008000</code></span><span>SP <code data-testid="stack-sp">{address(machine.registers[7])}</code></span></div>
    <div className="stack-value-list" data-testid="stack-values">
      {[...machine.stack].reverse().map((value, index) => <div key={index} className={index === 0 ? 'stack-top' : ''}><small>{index === 0 ? 'SP →' : ''}</small><code>{address(machine.registers[7] + index * word)}</code><strong>{value}</strong><span>{index === 0 ? '栈顶' : `${word} B`}</span></div>)}
      {!machine.stack.length && <p className="stack-empty">栈为空 · 表达式执行时自动入栈 / 出栈</p>}
    </div>
    <div className="stack-footprint">临时栈占用 {machine.stack.length * word} B · 每槽 {word} B</div>
    <p className="stack-model-note">main 教学帧：局部数据地址与解释器求值栈分别显示。当前支持 main 单帧，不模拟原生 ABI、CALL / RET 返回地址栈或递归调用。</p>
  </div>;
}
