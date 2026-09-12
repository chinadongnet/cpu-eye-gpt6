import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowDownToLine, ArrowRight, BookOpen, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Code2, Cpu, FileCode2, FlaskConical, GitBranch, Layers, Maximize2, MemoryStick, Pause, Play, RotateCcw, Settings2, SkipForward, Square, Terminal, X, Zap } from 'lucide-react';
import { architectures, compile, createMachine, hex, instructionText, step, type Architecture, type Machine } from './engine';
import { examples, validateExample } from './examples';
import CpuDiagram from './CpuDiagram';

const initialProgram = compile(examples[0].source);
type BottomTab = 'console' | 'trace' | 'validation';

function Highlight({ line }: { line: string }) {
  const parts = line.split(/(\/\/.*$|#.*$|\b(?:int|bool|class|struct|public|private|protected|for|while|if|else|return|true|false|std|cout|endl|main)\b|\b\d+\b)/g);
  return <>{parts.map((part, i) => <span key={i} className={part.startsWith('//') ? 'syntax-comment' : part.startsWith('#') ? 'syntax-include' : /^(int|bool|class|struct|public|private|protected|for|while|if|else|return|true|false)$/.test(part) ? 'syntax-keyword' : /^\d+$/.test(part) ? 'syntax-number' : /^(std|cout|endl|main)$/.test(part) ? 'syntax-function' : ''}>{part}</span>)}</>;
}

export default function App() {
  const [arch, setArch] = useState<Architecture>('x64');
  const [exampleId, setExampleId] = useState('sum');
  const [source, setSource] = useState(examples[0].source);
  const [program, setProgram] = useState(initialProgram);
  const [machine, setMachine] = useState<Machine>(() => createMachine(initialProgram, 'x64'));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [error, setError] = useState('');
  const [bottomTab, setBottomTab] = useState<BottomTab>('console');
  const [memoryTab, setMemoryTab] = useState<'variables' | 'memory' | 'stack'>('variables');
  const [radix, setRadix] = useState<'hex' | 'dec'>('hex');
  const [dialog, setDialog] = useState<'help' | 'examples' | null>(null);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [notice, setNotice] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const assemblyRef = useRef<HTMLDivElement>(null);
  const example = examples.find(item => item.id === exampleId)!;
  const model = architectures[arch];
  const dirty = source !== program.source;
  const currentInstruction = program.instructions[machine.pc];
  const activeLine = !dirty && !machine.halted ? currentInstruction?.line : undefined;
  const lastInstruction = machine.lastPc === null ? undefined : program.instructions[machine.lastPc];
  const checks = validateExample(example, machine.memory, machine.output, machine.result);
  const isExample = program.source === example.source;
  const validationPassed = machine.halted && !machine.error && isExample && checks.every(item => item.pass);
  const status = error || machine.error ? '执行错误' : dirty ? '待编译' : running ? '运行中' : machine.halted ? '已完成' : machine.cycles ? '已暂停' : '就绪';

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setMachine(previous => step(program, previous)), 1000 / speed);
    return () => window.clearInterval(timer);
  }, [running, program, speed]);
  useEffect(() => { if (machine.halted) setRunning(false); }, [machine.halted]);
  useEffect(() => {
    const row = assemblyRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (row && assemblyRef.current) {
      const container = assemblyRef.current;
      if (row.offsetTop < container.scrollTop || row.offsetTop + row.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = row.offsetTop - container.clientHeight / 2;
    }
  }, [machine.pc]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 2500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!dialog) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setDialog(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [dialog]);

  function build() {
    setRunning(false);
    try { const next = compile(source); setProgram(next); setMachine(createMachine(next, arch)); setError(''); setNotice(`编译成功 · ${next.instructions.length} 条教学指令`); return next; }
    catch (e) { setError((e as Error).message); setBottomTab('console'); return null; }
  }
  function play() {
    if (running) { setRunning(false); return; }
    if (dirty || error) { if (!build()) return; }
    else if (machine.halted) setMachine(createMachine(program, arch));
    setRunning(true);
  }
  function singleStep() {
    setRunning(false);
    if (dirty || error) { const next = build(); if (next) setMachine(step(next, createMachine(next, arch))); }
    else if (!machine.halted) setMachine(previous => step(program, previous));
  }
  function reset() { setRunning(false); setMachine(createMachine(program, arch)); setError(''); }
  function changeArchitecture(next: Architecture) { setRunning(false); setArch(next); setMachine(createMachine(program, next)); setNotice(`已切换至 ${architectures[next].label}，执行状态已重置`); }
  function loadExample(id: string) {
    const next = examples.find(item => item.id === id)!;
    if (source !== example.source && !window.confirm('切换示例将替换当前编辑内容，是否继续？')) return;
    const compiled = compile(next.source); setExampleId(id); setSource(next.source); setProgram(compiled); setMachine(createMachine(compiled, arch)); setRunning(false); setError(''); setDialog(null);
  }
  function download() {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${exampleId}.cpp`; a.click(); URL.revokeObjectURL(url); setNotice('C++ 源代码已导出');
  }
  function verify() {
    setBottomTab('validation');
    if (!machine.halted || dirty) { if (dirty && !build()) return; setSpeed(120); setRunning(true); }
  }
  const formatRegister = (value: number) => radix === 'hex' ? hex(value, model.bits) : String(value);
  const memoryCells = program.variables.flatMap(variable => machine.memory[variable.name].map((value, index) => ({ name: variable.name, index, value, address: variable.address + index * 4 })));

  return <div className="app-shell">
    <aside className="rail">
      <a className="brand-icon" href="#" aria-label="CPU 观测站"><Cpu size={25} /></a>
      <button className="rail-button active" title="模拟工作台" onClick={() => setDialog(null)}><Layers size={21} /><span>工作台</span></button>
      <button className="rail-button" title="示例程序" onClick={() => setDialog('examples')}><FileCode2 size={21} /><span>示例库</span></button>
      <button className="rail-button" title="程序验证" onClick={verify}><FlaskConical size={21} /><span>验证</span></button>
      <div className="rail-spacer" />
      <button className="rail-button" title="使用指南" onClick={() => setDialog('help')}><CircleHelp size={21} /><span>指南</span></button>
      <div className="avatar">C</div>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <div className="brand-name">CPU<span>Observatory</span><span className="version">BETA 1.0</span></div>
        <div className="topbar-right"><span className="local-badge"><i />本地浏览器运行</span><span className="topbar-divider" /><button className="text-button" onClick={() => setDialog('help')}><BookOpen size={15} />使用指南<ArrowRight size={14} /></button></div>
      </header>

      <main>
        <section className="page-heading">
          <div><div className="eyebrow">COMPUTER ARCHITECTURE, MADE VISIBLE</div><h1>让代码的每一步，<span>清晰可见。</span></h1><p>编写 C++，走进 CPU 内部。实时探索指令、寄存器与内存之间的联系。</p></div>
          <div className="heading-chip"><Activity size={16} /><span>交互式 CPU 模拟实验室</span></div>
        </section>

        <section className="toolbar">
          <div className="toolbar-group"><span className="field-label">CPU 架构</span><div className="select-wrap architecture-select"><Cpu size={16} /><select aria-label="CPU 架构" value={arch} onChange={e => changeArchitecture(e.target.value as Architecture)}>{Object.entries(architectures).map(([id, item]) => <option key={id} value={id}>{item.label} · {item.bits}-bit</option>)}</select><ChevronDown size={14} /></div><span className="toolbar-separator" /><div className="select-wrap example-select"><FileCode2 size={16} /><select aria-label="示例程序" value={exampleId} onChange={e => loadExample(e.target.value)}>{examples.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><ChevronDown size={14} /></div></div>
          <div className="toolbar-group toolbar-actions"><button className="button compile-button" onClick={build}><Zap size={15} />编译</button><button className={`button primary ${running ? 'is-running' : ''}`} onClick={play}>{running ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}{running ? '暂停' : '运行'}</button><button className="button" onClick={singleStep} disabled={machine.halted && !dirty}><SkipForward size={16} />单步</button><button className="icon-button reset-button" onClick={reset} title="重置执行"><RotateCcw size={17} /></button><span className="toolbar-separator" /><div className="speed-control"><span>速度</span><select aria-label="执行速度" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1 指令/s</option><option value={4}>4 指令/s</option><option value={12}>12 指令/s</option><option value={30}>30 指令/s</option><option value={120}>120 指令/s</option></select></div></div>
        </section>

        <CpuDiagram program={program} machine={machine} running={running} dirty={dirty} />

        <div className={`workspace ${editorExpanded ? 'editor-expanded' : ''}`}>
          <section className="panel editor-panel">
            <div className="panel-header"><div className="panel-title"><Code2 size={17} /><h2>源代码</h2><span className="subtle-tag">C++</span></div><div className="panel-tools"><button className="icon-button" title="下载源代码" onClick={download}><ArrowDownToLine size={15} /></button><button className="icon-button" title={editorExpanded ? '恢复布局' : '展开编辑器'} onClick={() => setEditorExpanded(!editorExpanded)}><Maximize2 size={15} /></button></div></div>
            <div className="file-tabs"><div className="file-tab"><span className="cpp-icon">C++</span>main.cpp{dirty ? <i className="unsaved-dot" /> : <span className="file-dot" />}</div><span className="editable-label">可编辑</span></div>
            <div className="code-editor">
              <pre ref={highlightRef} className="code-highlight" aria-hidden="true">{source.split('\n').map((line, index) => <div key={index} className={`code-line ${activeLine === index + 1 ? 'current-line' : ''}`}><span className="line-number">{activeLine === index + 1 ? <ChevronRight size={13} /> : index + 1}</span><span><Highlight line={line} />{'\n'}</span></div>)}</pre>
              <textarea ref={editorRef} aria-label="C++ 源代码编辑器" spellCheck={false} value={source} onChange={e => { setSource(e.target.value); setRunning(false); setError(''); }} onScroll={e => { if (highlightRef.current) { highlightRef.current.scrollTop = e.currentTarget.scrollTop; highlightRef.current.scrollLeft = e.currentTarget.scrollLeft; } }} onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); const start = e.currentTarget.selectionStart, end = e.currentTarget.selectionEnd; setSource(source.slice(0, start) + '    ' + source.slice(end)); setRunning(false); requestAnimationFrame(() => editorRef.current?.setSelectionRange(start + 4, start + 4)); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); build(); } }} />
            </div>
            <div className="editor-footer"><span><i className={`tiny-dot ${dirty ? 'orange' : ''}`} />{dirty ? '有未编译的修改' : '教学 C++ 子集'}</span><span>UTF-8<span className="footer-gap">{source.split('\n').length} 行</span></span></div>
            <div className="source-tip"><div className="tip-icon"><GitBranch size={17} /></div><div><strong>{example.title}<span>{example.tag.split(' · ')[0]}</span></strong><p>{example.subtitle}</p></div><button title="查看所有示例" onClick={() => setDialog('examples')}><ChevronRight size={17} /></button></div>
          </section>

          <section className="panel assembly-panel">
            <div className="panel-header"><div className="panel-title"><Terminal size={17} /><h2>指令流</h2></div><span className="subtle-tag">{model.label}</span></div>
            <div className="assembly-summary"><span><i className="tiny-dot" />{program.instructions.length} 条指令</span><span>教学汇编 · IR 映射</span></div>
            <div className="assembly-columns"><span>地址</span><span>指令 / 操作数</span></div>
            <div className="assembly-list" ref={assemblyRef}>{program.instructions.map((instruction, index) => {
              const text = instructionText(instruction, arch), space = text.indexOf(' '), active = index === machine.pc && !machine.halted;
              return <div key={index} data-active={active} className={`instruction-row ${active ? 'active' : ''} ${index === machine.lastPc ? 'executed' : ''}`} title={`C++ 第 ${instruction.line} 行 · ${instruction.op}`}><span className="instruction-marker">{active ? <ArrowRight size={12} /> : index === machine.lastPc ? <Check size={11} /> : ''}</span><span className="instruction-address">{(0x400000 + index * 4).toString(16).toUpperCase()}</span><code><span className={['JMP', 'JZ'].includes(instruction.op) ? 'op-branch' : instruction.op === 'STORE' ? 'op-store' : 'op-normal'}>{space < 0 ? text : text.slice(0, space)}</span>{space < 0 ? '' : text.slice(space)}</code>{active && <span className="pc-label">PC</span>}</div>;
            })}</div>
            <div className="assembly-footer"><span className="legend"><i />下一条指令</span><span>PC <b>0x{(0x400000 + machine.pc * 4).toString(16).toUpperCase()}</b></span></div>
          </section>

          <section className="panel cpu-panel">
            <div className="panel-header"><div className="panel-title"><Cpu size={17} /><h2>CPU 实时状态</h2></div><span className={`status-badge ${running ? 'running' : ''} ${machine.error || error ? 'error' : ''}`}><i />{status}</span></div>
            <div className="cpu-content">
              <div className="processor-card"><div className="processor-icon"><Cpu size={31} strokeWidth={1.3} /></div><div><h3>{model.label}<span>{model.bits}-BIT</span></h3><p>{model.family} / 教学模型</p></div><div className="processor-activity"><span /><span /><span /><span /><span /><span /><span /></div></div>
              <div className="section-label"><span>通用寄存器 <small>REGISTERS</small></span><div className="segmented"><button className={radix === 'hex' ? 'selected' : ''} onClick={() => setRadix('hex')}>HEX</button><button className={radix === 'dec' ? 'selected' : ''} onClick={() => setRadix('dec')}>DEC</button></div></div>
              <div className="register-grid">{model.registers.map((name, index) => <div key={name} className={`register ${machine.changedRegisters.includes(index) ? 'changed' : ''}`} title={`${name} = ${machine.registers[index]}（十进制）`}><span>{name}</span><code>{formatRegister(machine.registers[index])}</code><i /></div>)}</div>
              <div className="flags-row"><span>状态标志</span><div>{Object.entries(machine.flags).map(([flag, enabled]) => <span key={flag} className={`flag ${enabled ? 'on' : ''}`} title={({ Z: '零标志', N: '负数标志', C: '教学进位标志', V: '教学溢出标志' })[flag]}>{flag}<b>{Number(enabled)}</b></span>)}</div></div>
              <div className="datapath-heading"><span>数据通路</span><span>简化执行视图<Settings2 size={11} /></span></div>
              <div className={`datapath ${running ? 'flowing' : ''}`}><div className={`data-node ${lastInstruction?.op === 'LOAD' || lastInstruction?.op === 'STORE' ? 'lit' : ''}`}><MemoryStick size={18} /><span>内存</span><small>MEMORY</small></div><div className="data-link"><span /><ArrowRight size={14} /></div><div className={`data-node ${lastInstruction?.op === 'CONST' || lastInstruction?.op === 'LOAD' ? 'lit' : ''}`}><Layers size={18} /><span>寄存器</span><small>REGISTER</small></div><div className="data-link"><span /><ArrowRight size={14} /></div><div className={`data-node ${lastInstruction?.op === 'BINARY' || lastInstruction?.op === 'UNARY' ? 'lit' : ''}`}><Zap size={18} /><span>运算单元</span><small>ALU</small></div></div>
              <div className="execution-detail"><span className="tiny-dot" /><span>{machine.trace.at(-1)?.detail || '准备就绪，点击运行或单步开始观察'}</span></div>
              <div className="cpu-metrics"><div><span>已执行指令</span><strong>{machine.cycles.toLocaleString()}<small>steps</small></strong></div><div><span>内存访问</span><strong>{machine.reads + machine.writes}<small>次</small></strong></div><div><span>分支跳转</span><strong>{machine.branches}<small>次</small></strong></div></div>
            </div>
          </section>

          <section className="panel bottom-panel">
            <div className="bottom-header"><div className="bottom-tabs"><button className={bottomTab === 'console' ? 'selected' : ''} onClick={() => setBottomTab('console')}><Terminal size={15} />控制台{machine.output.length > 0 && <span className="count-badge">{machine.output.length}</span>}</button><button className={bottomTab === 'trace' ? 'selected' : ''} onClick={() => setBottomTab('trace')}><Activity size={15} />执行轨迹</button><button className={bottomTab === 'validation' ? 'selected' : ''} onClick={() => setBottomTab('validation')}><CheckCheck size={16} />结果验证{validationPassed && <i className="tiny-dot" />}</button></div><span className="bottom-header-note">{bottomTab === 'trace' ? '最近 160 条指令' : 'PROGRAM OUTPUT'}</span></div>
            <div className="console-content" aria-live="polite">
              {bottomTab === 'console' && <><div className="console-line muted"><span className="console-time">SYSTEM</span><span>CPU Observatory v1.0 — 浏览器端教学模拟引擎</span></div><div className="console-line"><span className="console-time">BUILD</span><span className="green-text">✓</span><span>已加载 {model.label} 模型，{program.instructions.length} 条指令，{program.variables.length} 个变量</span></div>{!machine.cycles && !error && <div className="console-line muted"><span className="console-time">READY</span><span>点击「运行」开始模拟，或使用「单步」逐条观察。</span><span className="terminal-cursor" /></div>}{machine.output.map((value, i) => <div className="console-line output-line" key={i}><span className="console-time">STDOUT</span><span>{value}</span></div>)}{machine.halted && !machine.error && <div className="console-line green-text"><span className="console-time">EXIT</span><span>程序执行完成 · 返回值 {machine.result} · 共 {machine.cycles} 条指令</span></div>}{(error || machine.error) && <div className="console-line error-text"><span className="console-time">ERROR</span><span>{error || machine.error}</span></div>}</>}
              {bottomTab === 'trace' && (machine.trace.length ? [...machine.trace].reverse().map(item => <div className="trace-line" key={item.cycle}><span>#{String(item.cycle).padStart(4, '0')}</span><code>{item.text}</code><span>{item.detail}</span></div>) : <div className="empty-state"><Activity size={22} />开始执行后，这里会记录每一步指令和数据变化。</div>)}
              {bottomTab === 'validation' && <>{!isExample ? <div className="empty-state"><FlaskConical size={22} />自定义程序：请结合返回值、输出和变量自行验证；预期断言适用于原始示例。</div> : !machine.halted ? <div className="validation-pending"><FlaskConical size={26} /><div><strong>让每一次探索，都有答案。</strong><p>运行完成后，将自动核对示例的变量、输出与返回值。</p></div><button className="button" onClick={verify}><Play size={13} />运行验证</button></div> : <><div className={`validation-summary ${validationPassed ? 'green-text' : 'error-text'}`}>{validationPassed ? <CheckCheck size={17} /> : <X size={17} />}{validationPassed ? '验证通过' : '验证未通过'}<span>{checks.filter(item => item.pass).length} / {checks.length} 项预期结果一致</span></div><div className="validation-checks">{checks.map(item => <div key={item.label} className={item.pass ? '' : 'failed'}>{item.pass ? <Check size={13} /> : <X size={13} />}<code>{item.label}</code><span>{item.actual ?? '未定义'}</span>{!item.pass && <small>预期 {item.expected}</small>}</div>)}</div></>}</>}
            </div>
          </section>

          <section className="panel memory-panel">
            <div className="bottom-header"><div className="bottom-tabs"><button className={memoryTab === 'variables' ? 'selected' : ''} onClick={() => setMemoryTab('variables')}><Layers size={15} />变量</button><button className={memoryTab === 'memory' ? 'selected' : ''} onClick={() => setMemoryTab('memory')}><MemoryStick size={15} />内存</button><button className={memoryTab === 'stack' ? 'selected' : ''} onClick={() => setMemoryTab('stack')}>求值栈</button></div><span className="subtle-tag">{memoryTab === 'stack' ? `${model.bits}-bit` : 'int32'}</span></div>
            <div className="memory-content">{memoryTab === 'variables' ? <table><thead><tr><th>名称</th><th>类型</th><th>值</th><th>地址</th></tr></thead><tbody>{program.variables.map(variable => <tr key={variable.name} className={machine.changedMemory.some(key => key.startsWith(variable.name + ':')) ? 'memory-changed' : ''}><td><span className="variable-dot" />{variable.name}</td><td>int{variable.size > 1 ? `[${variable.size}]` : ''}</td><td className="variable-value">{variable.size > 1 ? `[${machine.memory[variable.name].join(', ')}]` : machine.memory[variable.name][0]}</td><td>0x{variable.address.toString(16).toUpperCase()}</td></tr>)}</tbody></table> : memoryTab === 'memory' ? <table className="byte-table"><thead><tr><th>地址</th><th>小端序字节</th><th>变量</th></tr></thead><tbody>{memoryCells.map(cell => <tr key={cell.address} className={machine.changedMemory.includes(`${cell.name}:${cell.index}`) ? 'memory-changed' : ''}><td>0x{cell.address.toString(16)}</td><td>{[0, 1, 2, 3].map(byte => <span className="byte" key={byte}>{((cell.value >>> (byte * 8)) & 255).toString(16).toUpperCase().padStart(2, '0')}</span>)}</td><td>{cell.name}[{cell.index}]</td></tr>)}</tbody></table> : machine.stack.length ? <div className="stack-items">{[...machine.stack].reverse().map((value, index) => <div key={index}><span>{index === 0 ? 'SP →' : ''} 0x{(machine.registers[7] + index * model.bits / 8).toString(16)}</span><code>{value}</code><small>{index === 0 ? '栈顶' : '临时操作数'}</small></div>)}</div> : <div className="empty-state"><ArrowDown size={22} />求值栈为空，表达式执行时可查看临时操作数。</div>}</div>
          </section>
        </div>

        <footer className="page-footer"><span><span className="tiny-dot" />所有代码仅在你的浏览器中执行<span className="footer-dot">·</span>无需服务器</span><button onClick={() => setDialog('help')}>教学级指令模拟<span className="footer-dot">·</span>了解模型边界<ArrowRight size={12} /></button><span className="footer-signature">BUILT FOR CURIOSITY <span>✳</span></span></footer>
      </main>
      <div className="statusbar"><span><Cpu size={12} />{model.label}<span>·</span>{model.bits}-bit<span>·</span>Little Endian</span><span>{dirty ? '源代码已修改' : '编译器就绪'}<span>·</span>模拟时钟 {speed} Hz <Activity size={12} /></span></div>
    </div>

    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    {dialog && <div className="modal-overlay" onClick={() => setDialog(null)}><section className="modal" role="dialog" aria-modal="true" aria-label={dialog === 'help' ? '使用指南' : '示例程序库'} onClick={e => e.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">{dialog === 'help' ? 'A LITTLE GUIDE' : 'LEARN BY EXPLORING'}</span><h2>{dialog === 'help' ? '欢迎来到 CPU 观测站' : '选择一个好奇的起点'}</h2></div><button className="icon-button" title="关闭" onClick={() => setDialog(null)} autoFocus><X size={20} /></button></div>{dialog === 'examples' ? <div className="example-cards">{examples.map((item, index) => <button key={item.id} onClick={() => loadExample(item.id)}><span className="example-number">0{index + 1}</span><div><h3>{item.title}<span>{item.tag}</span></h3><p>{item.subtitle}</p></div><ArrowRight size={18} /></button>)}</div> : <div className="help-content"><p>将 C++ 代码变成看得见的数据流，理解一次运算如何发生。</p><ol><li><strong>选择架构与示例</strong> — 支持 x86、x86-64、ARM32 和 ARM64；切换架构会重置执行状态。</li><li><strong>编写与编译</strong> — 可直接编辑 main.cpp，点击编译或按 Ctrl / ⌘ + Enter。</li><li><strong>观察每一步</strong> — 运行、暂停或单步；绿色标记显示下一条指令，变化的寄存器和内存会高亮。</li><li><strong>验证结果</strong> — 原始示例包含结果断言，运行完成后可在「结果验证」查看。</li></ol><h3>支持的 C++ 子集</h3><p><code>int main()</code>、int / bool 声明、固定长度 int 数组、赋值和复合赋值、后置 ++ / --、算术 / 比较 / 位运算、短路逻辑、if / else、for、while、整数 cout 输出和 return。每个变量名在程序中须唯一；变量初始值默认为 0。bool 在当前教学模型中按 int 存储。</p><p>支持在 main 前定义基础 class / struct，声明对象并读写 public 数据成员（如 <code>a.x = 1;</code>），支持成员数组、复合赋值和自增。class 默认 private，struct 默认 public；private / protected 成员禁止在 main 中访问。对象成员按声明顺序以 4 字节单元分配，并以 a.x 等名称显示在变量和内存视图中；初始值按教学规则置零。</p><h3>模型说明</h3><p>这是解释执行中间指令的教学模拟器。汇编是架构风格的伪指令映射，并非原生机器码或完整 ISA 仿真。四种模型提供不同寄存器命名、32/64 位展示和求值栈槽宽度；C++ int 数据统一为 32 位，小端序，溢出按补码截断。</p><p>固定 4 字节的指令地址、状态标志、寄存器分配与数据通路均为教学简化；计数表示教学指令数，不是真实 CPU 周期。求值栈属于解释器，不代表原生函数调用栈。不包含缓存、流水线、操作系统、指针、函数调用、构造函数、成员函数、继承、嵌套对象、对象数组、对象复制、类内成员初始化、STL、浮点数或完整 C++ 语义。</p><div className="help-note"><Square size={14} />每次运行最多 100,000 条指令；数组越界与除零会停止运行并显示原因。</div></div>}</section></div>}
  </div>;
}
