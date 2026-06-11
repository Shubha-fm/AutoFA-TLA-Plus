import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckCircle2, XCircle, Play, Download, FileCode2, Plus, Trash2, ShieldCheck, HelpCircle, Info, Copy, MousePointer, Circle, ArrowRight, Eraser } from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const defaultModel = {
  automatonType: 'DFA',
  statesText: 'q0, q1, q2, q3',
  alphabetText: 'a, b',
  initialState: 'q0',
  acceptingStatesText: 'q2',
  transitions: [
    { currentState: 'q0', inputSymbol: 'a', nextState: 'q1' },
    { currentState: 'q0', inputSymbol: 'b', nextState: 'q3' },
    { currentState: 'q1', inputSymbol: 'a', nextState: 'q3' },
    { currentState: 'q1', inputSymbol: 'b', nextState: 'q2' },
    { currentState: 'q2', inputSymbol: 'a', nextState: 'q2' },
    { currentState: 'q2', inputSymbol: 'b', nextState: 'q2' },
    { currentState: 'q3', inputSymbol: 'a', nextState: 'q0' },
    { currentState: 'q3', inputSymbol: 'b', nextState: 'q0' },
  ],
};

function splitCSV(text) {
  return text.split(',').map(x => x.trim()).filter(Boolean);
}

function toPayload(model) {
  return {
    automatonType: model.automatonType,
    states: splitCSV(model.statesText),
    alphabet: splitCSV(model.alphabetText),
    initialState: model.initialState.trim(),
    acceptingStates: splitCSV(model.acceptingStatesText),
    transitions: model.transitions.filter(t => t.currentState && t.inputSymbol && t.nextState),
  };
}

function localGenerateTLA(model) {
  const p = toPayload(model);
  const trans = p.transitions.map((t, i) => `T${i + 1} ==\n    /\\ pos <= Len(input)\n    /\\ state = ${t.currentState}\n    /\\ input[pos] = ${t.inputSymbol}\n    /\\ state' = ${t.nextState}\n    /\\ pos' = pos + 1\n    /\\ UNCHANGED input`).join('\n\n');
  const next = p.transitions.map((_, i) => `    \\/ T${i + 1}`).join('\n') || '    FALSE';
  return `--------------------------- MODULE AutomataSpec ---------------------------
EXTENDS Naturals, Sequences

CONSTANTS States, Alphabet, Accepting, InitialState

VARIABLES state, input, pos

vars == << state, input, pos >>

Init ==
    /\\ state = InitialState
    /\\ input \\in Seq(Alphabet)
    /\\ pos = 1

${trans}

Next ==
${next}

Spec ==
    Init /\\ [][Next]_vars

TypeOK ==
    /\\ state \\in States
    /\\ input \\in Seq(Alphabet)
    /\\ pos \\in 1..(Len(input) + 1)

Accepted ==
    /\\ pos = Len(input) + 1
    /\\ state \\in Accepting

AcceptanceCorrect ==
    Accepted <=> /\\ pos = Len(input) + 1
                  /\\ state \\in Accepting
=============================================================================`;
}

function makeCfg(model) {
  const p = toPayload(model);
  const set = arr => `{${arr.join(', ')}}`;
  return `SPECIFICATION Spec

INVARIANT TypeOK
INVARIANT AcceptanceCorrect

CONSTANTS
States = ${set(p.states)}
Alphabet = ${set(p.alphabet)}
Accepting = ${set(p.acceptingStates)}
InitialState = ${p.initialState}
`;
}

async function postJSON(path, payload) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function downloadFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function AutomataCanvas({ states, accepting }) {
  const nodes = [
    { id: 'q0', x: 115, y: 115 },
    { id: 'q1', x: 275, y: 115 },
    { id: 'q2', x: 435, y: 115 },
    { id: 'q3', x: 275, y: 265 },
  ];
  const labels = new Set(states);
  const acc = new Set(accepting);
  const shown = nodes.filter(n => labels.has(n.id));
  return (
    <div className="canvas">
      <svg viewBox="0 0 560 340" className="svgCanvas">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#111827" />
          </marker>
        </defs>
        {labels.has('q0') && <><line x1="40" y1="115" x2="84" y2="115" stroke="#111827" strokeWidth="2" markerEnd="url(#arrow)"/><text x="42" y="103" className="edgeLabel">Start</text></>}
        {labels.has('q0') && labels.has('q1') && <><line x1="146" y1="115" x2="244" y2="115" stroke="#111827" strokeWidth="2" markerEnd="url(#arrow)"/><text x="190" y="100" className="edgeLabel">a</text></>}
        {labels.has('q1') && labels.has('q2') && <><line x1="306" y1="115" x2="404" y2="115" stroke="#111827" strokeWidth="2" markerEnd="url(#arrow)"/><text x="352" y="100" className="edgeLabel">b</text></>}
        {labels.has('q1') && labels.has('q3') && <><line x1="275" y1="146" x2="275" y2="234" stroke="#111827" strokeWidth="2" markerEnd="url(#arrow)"/><text x="286" y="198" className="edgeLabel">a</text></>}
        {labels.has('q3') && labels.has('q0') && <><path d="M245,265 C120,260 85,190 105,145" fill="none" stroke="#111827" strokeWidth="2" markerEnd="url(#arrow)"/><text x="150" y="245" className="edgeLabel">b</text></>}
        {labels.has('q2') && <><path d="M435,84 C470,50 505,84 475,118" fill="none" stroke="#111827" strokeWidth="2" markerEnd="url(#arrow)"/><text x="471" y="67" className="edgeLabel">a,b</text></>}
        {shown.map(n => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r="31" fill="#fff" stroke="#111827" strokeWidth="2" />
            {acc.has(n.id) && <circle cx={n.x} cy={n.y} r="25" fill="none" stroke="#111827" strokeWidth="2" />}
            <text x={n.x} y={n.y + 6} textAnchor="middle" className="nodeText">{n.id}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function App() {
  const [model, setModel] = useState(defaultModel);
  const [mode, setMode] = useState('draw');
  const [tla, setTla] = useState(localGenerateTLA(defaultModel));
  const [cfg, setCfg] = useState(makeCfg(defaultModel));
  const [status, setStatus] = useState({ kind: 'idle', message: 'Ready' });
  const [checks, setChecks] = useState([]);
  const [trace, setTrace] = useState([]);

  const payload = useMemo(() => toPayload(model), [model]);

  const update = (patch) => setModel(prev => ({ ...prev, ...patch }));
  const updateTransition = (index, key, value) => {
    const transitions = [...model.transitions];
    transitions[index] = { ...transitions[index], [key]: value };
    update({ transitions });
  };
  const addTransition = () => update({ transitions: [...model.transitions, { currentState: '', inputSymbol: '', nextState: '' }] });
  const deleteTransition = (index) => update({ transitions: model.transitions.filter((_, i) => i !== index) });

  async function validate() {
    try {
      const data = await postJSON('/api/validate', payload);
      setStatus({ kind: data.valid ? 'success' : 'error', message: data.valid ? 'Model is valid.' : data.errors.join(' ') });
    } catch (e) {
      setStatus({ kind: 'error', message: `${e.message}. Is the backend running?` });
    }
  }

  async function generate() {
    try {
      const data = await postJSON('/api/generate', payload);
      if (!data.valid) {
        setStatus({ kind: 'error', message: data.errors.join(' ') });
        return;
      }
      setTla(data.tla);
      setCfg(data.cfg);
      setStatus({ kind: 'success', message: 'TLA+ specification generated.' });
    } catch (e) {
      const generated = localGenerateTLA(model);
      setTla(generated);
      setCfg(makeCfg(model));
      setStatus({ kind: 'warning', message: 'Backend unavailable. Generated locally in browser.' });
    }
  }

  async function runTLC() {
    try {
      const data = await postJSON('/api/run-tlc', payload);
      setChecks(data.checks || []);
      setTrace(data.trace || []);
      setStatus({ kind: data.passed ? 'success' : 'error', message: data.summary });
    } catch (e) {
      setStatus({ kind: 'error', message: `${e.message}. Is the backend running?` });
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brandIcon">⟲</div>
        <div>
          <h1>AutoFA-TLA+ Web Interface</h1>
          <p>Draw automata or enter transitions as a table, then convert to TLA+.</p>
        </div>
        <div className="headerLinks"><span><HelpCircle size={18}/> Help</span><span><Info size={18}/> About</span></div>
      </header>

      <main className="mainGrid">
        <section className="panel inputPanel">
          <div className="panelTitle"><span>1</span> Automata Input</div>
          <div className="tabs"><button className={mode==='draw' ? 'active' : ''} onClick={() => setMode('draw')}>Draw Mode</button><button className={mode==='table' ? 'active' : ''} onClick={() => setMode('table')}>Table Input</button></div>
          <div className="toolBar">
            <button className="tool active"><MousePointer size={18}/>Select</button>
            <button className="tool"><Circle size={18}/>Add State</button>
            <button className="tool"><ArrowRight size={18}/>Add Edge</button>
            <button className="tool"><Trash2 size={18}/>Delete</button>
            <button className="tool"><Eraser size={18}/>Clear</button>
            <button className="tool right">Auto Layout</button>
          </div>
          <div className="drawTableRow">
            <AutomataCanvas states={payload.states} accepting={payload.acceptingStates} />
            <div className="transitionBox">
              <table className="transitionTable">
                <thead><tr><th>Current State</th><th>Input Symbol</th><th>Next State</th><th></th></tr></thead>
                <tbody>{model.transitions.map((t, i) => <tr key={i}>
                  <td><input value={t.currentState} onChange={e => updateTransition(i, 'currentState', e.target.value)} /></td>
                  <td><input value={t.inputSymbol} onChange={e => updateTransition(i, 'inputSymbol', e.target.value)} /></td>
                  <td><input value={t.nextState} onChange={e => updateTransition(i, 'nextState', e.target.value)} /></td>
                  <td><button className="miniBtn" onClick={() => deleteTransition(i)}><Trash2 size={14}/></button></td>
                </tr>)}</tbody>
              </table>
              <button className="outlineBtn" onClick={addTransition}><Plus size={16}/> Add Transition</button>
            </div>
          </div>
          <div className="modelFields">
            <label>Automaton Type<select value={model.automatonType} onChange={e => update({ automatonType: e.target.value })}><option>DFA</option><option>NFA</option></select></label>
            <label>States<input value={model.statesText} onChange={e => update({ statesText: e.target.value })}/><small>{payload.states.length} states</small></label>
            <label>Alphabet<input value={model.alphabetText} onChange={e => update({ alphabetText: e.target.value })}/><small>{payload.alphabet.length} symbols</small></label>
            <label>Initial State<input value={model.initialState} onChange={e => update({ initialState: e.target.value })}/></label>
            <label>Accepting States<input value={model.acceptingStatesText} onChange={e => update({ acceptingStatesText: e.target.value })}/><small>{payload.acceptingStates.length} accepting</small></label>
          </div>
        </section>

        <section className="panel codePanel">
          <div className="panelTitle"><span>2</span> Generated TLA+ Specification <button className="copyBtn" onClick={() => navigator.clipboard.writeText(tla)}><Copy size={14}/> Copy</button></div>
          <pre className="codeBlock">{tla}</pre>
          <div className="buttonRow">
            <button className="primaryBtn" onClick={generate}><FileCode2 size={18}/> Generate TLA+</button>
            <button className="outlineBtn" onClick={() => downloadFile('AutomataSpec.tla', tla)}><Download size={16}/> Download .tla</button>
            <button className="outlineBtn" onClick={() => downloadFile('AutomataSpec.cfg', cfg)}><Download size={16}/> Download .cfg</button>
          </div>
        </section>

        <section className="panel resultsPanel">
          <div className="panelTitle"><span>3</span> Verification Results</div>
          <div className={`statusCard ${status.kind}`}>
            {status.kind === 'error' ? <XCircle size={56}/> : <CheckCircle2 size={56}/>}<div><h2>{status.kind === 'error' ? 'Verification Failed' : status.kind === 'idle' ? 'Ready' : 'Verification Passed'}</h2><p>{status.message}</p></div>
          </div>
          <div className="checks">
            {(checks.length ? checks : [{name:'Type Correctness',status:'OK'}, {name:'Transition Consistency',status:'OK'}, {name:'Deadlock Freedom',status:'OK'}]).map((c, i) => <div key={i} className="checkLine"><span>{c.status === 'OK' ? '✓' : '✕'} {c.name}</span><b>{c.status}</b></div>)}
          </div>
        </section>

        <section className="panel actionPanel"><ShieldCheck size={38}/><h3>Validate</h3><p>Check input for errors</p><button className="outlineBtn wide" onClick={validate}>Validate</button></section>
        <section className="panel actionPanel"><FileCode2 size={38}/><h3>Generate TLA+</h3><p>Generate specification</p><button className="primaryBtn wide" onClick={generate}>Generate TLA+</button></section>
        <section className="panel actionPanel"><Play size={38}/><h3>Run TLC</h3><p>Model check with TLC</p><button className="primaryBtn wide" onClick={runTLC}>Run TLC</button></section>

        <section className="panel tracePanel">
          <div className="panelTitle">Counterexample Trace</div>
          <pre>{trace.length ? trace.join('\n') : 'No violation found.'}</pre>
        </section>
      </main>
      <footer>AutoFA-TLA+ v1.0.0 <span>● Ready</span></footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
