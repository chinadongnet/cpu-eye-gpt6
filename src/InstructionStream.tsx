import { useLayoutEffect, useRef } from 'react';
import { ListOrdered } from 'lucide-react';
import { architectures, hex, instructionText, type Machine, type Program } from './engine';
import './instruction-stream.css';

export default function InstructionStream({ program, machine, dirty, expanded }: { program: Program; machine: Machine; dirty: boolean; expanded: boolean }) {
  const listRef = useRef<HTMLDivElement>(null);
  const focusPc = machine.halted ? machine.lastPc : machine.pc;
  // Rapid expand/restore can finish within one ResizeObserver delivery.
  // Follow on each layout change as well, before the compact view is painted.
  useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[data-focused="true"]');
    if (!list || !row) return;
    const follow = () => {
      if (row.offsetTop < list.scrollTop || row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = Math.max(0, row.offsetTop - (list.clientHeight - row.offsetHeight) / 2);
      }
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(list);
    return () => observer.disconnect();
  }, [focusPc, program, machine.arch, expanded]);

  return <section className="instruction-stream" aria-label="指令流" data-testid="instruction-stream">
    <div className="stream-heading"><h3><ListOrdered size={15} />指令流</h3><span>{program.instructions.length} 条</span></div>
    <div className={`stream-summary${dirty ? ' is-stale' : ''}`}><span>{architectures[machine.arch].label} · 教学汇编</span><span>{dirty ? '待编译 · 上次快照' : '自动跟随执行'}</span></div>
    <div className="stream-columns" aria-hidden="true"><span>地址</span><span>指令 / 操作数</span><span>行</span><span>状态</span></div>
    <div className="stream-list" ref={listRef} tabIndex={0} aria-label="完整指令列表">
      {program.instructions.map((instruction, pc) => {
        const text = instructionText(instruction, machine.arch), space = text.indexOf(' ');
        const next = !machine.halted && pc === machine.pc, executed = pc === machine.lastPc;
        return <div key={pc} className={`stream-row${next ? ' is-next' : ''}${executed ? ' is-executed' : ''}`} data-pc={pc} data-focused={pc === focusPc} aria-current={next ? 'step' : undefined} title={`0x${hex(0x400000 + pc * 4)} · C++ 第 ${instruction.line} 行 · ${text}${next ? ' · 下一条指令 PC' : ''}${executed ? ' · 最近执行 IR' : ''}`}>
          <span className="stream-address">{(0x400000 + pc * 4).toString(16).toUpperCase()}</span>
          <code><b className={['JMP', 'JZ', 'CALL', 'RET'].includes(instruction.op) ? 'stream-branch' : instruction.op === 'STORE' ? 'stream-store' : ''}>{space < 0 ? text : text.slice(0, space)}</b>{space < 0 ? '' : text.slice(space)}</code>
          <span className="stream-source">{instruction.line}</span>
          <span className={`stream-marker${next ? ' marker-pc' : executed ? ' marker-ir' : ''}`}>{next && executed ? 'PC·IR' : next ? 'PC' : executed ? 'IR' : ''}</span>
        </div>;
      })}
    </div>
    <div className="stream-legend"><span><i className="legend-pc" />PC 下一条</span><span><i className="legend-ir" />IR 最近执行</span><span>{machine.error ? '执行异常' : machine.halted ? '执行结束' : `${machine.cycles} steps`}</span></div>
  </section>;
}
