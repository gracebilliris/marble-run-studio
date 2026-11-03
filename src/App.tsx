import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import {
  BOARD_HEIGHT, BOARD_WIDTH, GRID, EXAMPLE_TRACKS, PIECE_LABELS,
  createWorld, deserializeDesign, serializeDesign, stepWorld, validateDesign,
} from './physics';
import type { Design, Piece, PieceKind, World } from './physics';
import { drawBoard } from './render';
import './styles.css';

type Point = { x: number; y: number };
type Cell = { col: number; row: number };
const STORAGE_KEY = 'marble-run-studio.design.v1';
const kinds: PieceKind[] = ['rail', 'ramp', 'curve', 'bumper'];
const descriptions = { rail: 'Keep things rolling', ramp: 'A little downhill energy', curve: 'Take a gentler turn', bumper: 'Add a happy surprise' };
const shortNames = { rail: 'Straight', ramp: 'Ramp', curve: 'Curve', bumper: 'Bumper' };

function initialDesign(): Design {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return deserializeDesign(saved) ?? EXAMPLE_TRACKS[0].design;
  } catch { /* Storage is optional; the playground still works without it. */ }
  return EXAMPLE_TRACKS[0].design;
}

function PartDiagram({ kind, rotation = 0 }: { kind: PieceKind; rotation?: number }) {
  return <svg viewBox="0 0 64 64" aria-hidden="true" className={`part-diagram ${kind}`}>
    <g transform={`rotate(${rotation * 90} 32 32)`} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'rail' && <path d="M10 32H54" />}
      {kind === 'ramp' && <path d="M12 12L52 52" />}
      {kind === 'curve' && <path d="M10 54A44 44 0 0 0 54 10" />}
      {kind === 'bumper' && <><path d="M32 10L54 32 32 54 10 32Z" /><circle cx="32" cy="32" r="4" fill="currentColor" stroke="none" /></>}
    </g>
  </svg>;
}

function Icon({ name }: { name: 'play' | 'pause' | 'reset' | 'rotate' | 'trash' | 'undo' | 'arrow' }) {
  const paths = {
    play: 'M8 5l11 7-11 7Z', pause: 'M8 5v14M16 5v14',
    reset: 'M4 10a8 8 0 1 1 2 8M4 4v6h6',
    rotate: 'M20 10a8 8 0 1 0-2 8M20 4v6h-6',
    trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
    undo: 'M8 5l-5 5 5 5M3 10h10a7 7 0 0 1 7 7',
    arrow: 'M5 12h14M14 7l5 5-5 5',
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill={name === 'play' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function App() {
  const [design, setDesign] = useState(initialDesign);
  const [world, setWorld] = useState<World>(() => createWorld(design));
  const [tool, setTool] = useState<PieceKind>('ramp');
  const [rotation, setRotation] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [message, setMessage] = useState('Your first little adventure is ready. Release the marble!');
  const [saved, setSaved] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const history = useRef<Design[]>([]);
  const trail = useRef<Point[]>([]);
  const worldRef = useRef(world);
  const designRef = useRef(design);
  const viewRef = useRef({ selected, hover, keyboard, tool, rotation });
  designRef.current = design;
  viewRef.current = { selected, hover, keyboard, tool, rotation };

  function updateWorld(next: World) {
    worldRef.current = next;
    setWorld(next);
  }

  function resetBall() {
    trail.current = [];
    updateWorld(createWorld(designRef.current));
    setMessage('Marble back at the start. Give it another go.');
  }

  function edit(next: Design, announcement: string) {
    history.current = [...history.current.slice(-39), designRef.current];
    setHistoryCount(history.current.length);
    designRef.current = next;
    setDesign(next);
    trail.current = [];
    updateWorld(createWorld(next));
    setMessage(announcement);
  }

  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    setHistoryCount(history.current.length);
    designRef.current = previous;
    setDesign(previous);
    setSelected(null);
    trail.current = [];
    updateWorld(createWorld(previous));
    setMessage('Last change undone. Your marble is back at the start.');
  }

  function rotate() {
    const item = designRef.current.pieces.find(piece => piece.id === selected);
    if (item) {
      edit({ ...designRef.current, pieces: designRef.current.pieces.map(piece => piece.id === item.id ? { ...piece, rotation: (piece.rotation + 1) % 4 } : piece) }, `${PIECE_LABELS[item.kind]} rotated a quarter turn.`);
    } else {
      setRotation(value => (value + 1) % 4);
      setMessage('Next piece rotated a quarter turn.');
    }
  }

  function remove() {
    if (!selected) return;
    edit({ ...designRef.current, pieces: designRef.current.pieces.filter(piece => piece.id !== selected) }, 'Piece removed. A little more room for possibility.');
    setSelected(null);
  }

  function place(cell: Cell) {
    const existing = designRef.current.pieces.find(piece => piece.col === cell.col && piece.row === cell.row);
    if (existing) {
      setSelected(existing.id);
      setMessage(`${PIECE_LABELS[existing.kind]} selected, column ${cell.col + 1}, row ${cell.row + 1}. Rotate or remove to adjust it.`);
      return;
    }
    const piece: Piece = { id: `piece-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind: tool, ...cell, rotation };
    edit({ ...designRef.current, pieces: [...designRef.current.pieces, piece] }, `${PIECE_LABELS[tool]} placed, column ${cell.col + 1}, row ${cell.row + 1}.`);
    setSelected(piece.id);
  }

  function transport() {
    const current = worldRef.current;
    if (current.status === 'running') {
      updateWorld({ ...current, status: 'paused' });
      setMessage('Paused. Take a moment to admire your handiwork.');
    } else {
      const next = current.status === 'paused' ? current : createWorld(designRef.current);
      if (current.status !== 'paused') trail.current = [];
      updateWorld({ ...next, status: 'running' });
      setMessage(current.status === 'paused' ? 'Rolling again!' : 'And away we go! Follow the marble to the landing zone.');
    }
  }

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, serializeDesign(design)); setSaved(true); }
    catch { setSaved(false); }
  }, [design]);

  useEffect(() => {
    let frame = 0;
    let previous = 0;
    let accumulator = 0;
    let lastStats = 0;
    let lastTrail = 0;
    function animate(time: number) {
      const delta = previous ? Math.min((time - previous) / 1000, 0.1) : 0;
      previous = time;
      const before = worldRef.current.status;
      if (before === 'running') {
        accumulator += delta;
        while (accumulator >= 1 / 120 && worldRef.current.status === 'running') {
          worldRef.current = stepWorld(worldRef.current, designRef.current, 1 / 120);
          accumulator -= 1 / 120;
        }
        if (time - lastTrail > 35) {
          const { x, y } = worldRef.current.ball;
          trail.current = [...trail.current.slice(-74), { x, y }];
          lastTrail = time;
        }
      } else accumulator = 0;
      if (before !== worldRef.current.status) {
        setMessage(worldRef.current.status === 'won' ? 'Beautiful landing! Your marble made it. Try another track or make this one your own.' : 'Out of bounds — that’s part of the fun. Adjust your track and try again!');
      }
      if (time - lastStats > 100 || before !== worldRef.current.status) {
        setWorld(worldRef.current);
        lastStats = time;
      }
      if (canvas.current) {
        const view = viewRef.current;
        drawBoard(canvas.current, designRef.current, worldRef.current, {
          selected: view.selected, hover: view.hover, keyboard: view.keyboard, trail: trail.current,
          preview: view.hover ? { id: 'preview', kind: view.tool, ...view.hover, rotation: view.rotation } : null,
        });
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('input, select, textarea, button, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
      else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'r') { event.preventDefault(); rotate(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(); }
      else if (event.key === 'Escape') { setSelected(null); setHover(null); }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });

  function cellAt(event: PointerEvent<HTMLCanvasElement>): Cell {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      col: Math.max(0, Math.min(13, Math.floor((event.clientX - rect.left) / rect.width * BOARD_WIDTH / GRID))),
      row: Math.max(0, Math.min(9, Math.floor((event.clientY - rect.top) / rect.height * BOARD_HEIGHT / GRID))),
    };
  }

  function boardKey(event: KeyboardEvent<HTMLCanvasElement>) {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault();
      const [x, y] = moves[event.key];
      setKeyboard(true);
      const next = { col: Math.max(0, Math.min(13, (hover?.col ?? 0) + x)), row: Math.max(0, Math.min(9, (hover?.row ?? 0) + y)) };
      setHover(next);
      const occupant = design.pieces.find(piece => piece.col === next.col && piece.row === next.row);
      setMessage(`Column ${next.col + 1}, row ${next.row + 1}. ${occupant ? PIECE_LABELS[occupant.kind] : 'Empty cell'}.`);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setKeyboard(true);
      const cell = hover ?? { col: 0, row: 0 };
      setHover(cell);
      place(cell);
    }
  }

  const selectedPiece = design.pieces.find(piece => piece.id === selected);
  const validationFeedback = validateDesign(design);
  const example = EXAMPLE_TRACKS.find(track => serializeDesign(track.design) === serializeDesign(design));
  const running = world.status === 'running';
  const statusLabels = { ready: 'Ready to roll', running: 'Marble in motion', paused: 'Taking a breather', won: 'Beautiful landing!', lost: 'Try a little tweak' };

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="./" aria-label="Marble Run Studio home"><span className="marble-logo" aria-hidden="true" /><span>marble run<span className="brand-studio"> / studio</span></span></a>
      <span className="topbar-note"><span className="tiny-spark">✳</span> Made for the joy of tinkering</span>
    </header>

    <main>
      <section className="intro" aria-labelledby="page-title">
        <div><p className="eyebrow"><span /> A little gravity playground</p><h1 id="page-title">Small pieces.<br /><span>Big possibilities.</span></h1><p className="intro-copy">A ramp here. A curve there. A tiny moment of <em>“what if?”</em><br className="desktop-break" /> Build a little marble run and see where gravity takes you.</p></div>
        <div className="intro-stamp" aria-hidden="true"><svg viewBox="0 0 160 110"><path d="M13 25h28q12 0 21 15l21 32q7 12 23 12h36" fill="none" stroke="#9bb6a5" strokeWidth="6" strokeLinecap="round" /><circle cx="43" cy="13" r="11" fill="#e38b56" /><path d="M122 22l4-9m8 17 10-2m-30-13-3-7" stroke="#d3a05c" strokeWidth="2" strokeLinecap="round" /><path d="M22 51v36m38-17v17m48 4v9" stroke="#c7d5c7" strokeWidth="2" strokeLinecap="round" /></svg><span>Less planning.<br />More playing.</span></div>
      </section>

      <section className="workshop" aria-label="Marble run builder">
        <aside className="parts-panel">
          <div className="panel-title"><span className="section-index">01</span><h2>Your building blocks</h2></div>
          <p className="panel-description">Pick a piece. Find its place.</p>
          <div className="palette" aria-label="Choose a building piece">
            {kinds.map(kind => <button key={kind} className={`part-button ${tool === kind ? 'active' : ''}`} aria-pressed={tool === kind} aria-label={`Choose ${PIECE_LABELS[kind]}`} onClick={() => { setTool(kind); setSelected(null); setMessage(`${PIECE_LABELS[kind]} ready. Tap an empty spot on the board to place it.`); }}>
              <span className={`diagram-tile ${kind}`}><PartDiagram kind={kind} rotation={tool === kind ? rotation : 0} /></span>
              <span className="part-copy"><strong>{shortNames[kind]}</strong><span>{descriptions[kind]}</span></span><span className="choice-dot" aria-hidden="true" />
            </button>)}
          </div>
          <div className="piece-editor">
            <div className="editor-label">{selectedPiece ? 'SELECTED PIECE' : 'NEXT PIECE'}<span>{selectedPiece ? PIECE_LABELS[selectedPiece.kind] : `${shortNames[tool]} · ${rotation * 90}°`}</span></div>
            <div className="editor-actions"><button onClick={rotate} title="Rotate a quarter turn (R)"><Icon name="rotate" />Rotate <kbd>R</kbd></button><button onClick={remove} disabled={!selectedPiece} aria-label="Remove selected piece" title="Remove selected piece (Delete)"><Icon name="trash" /></button></div>
          </div>
          <div className="little-tip"><span aria-hidden="true">✦</span><p>There’s no wrong way to play.<br /><strong>Even a detour is a discovery.</strong></p></div>
          <div className="sidebar-bottom"><button className="text-button" onClick={undo} disabled={!historyCount}><Icon name="undo" />Undo</button><button className="text-button" disabled={!design.pieces.length} onClick={() => { edit({ ...designRef.current, pieces: [] }, 'A fresh canvas. Previous pieces are one Undo away.'); setSelected(null); }}><Icon name="trash" />Clear board</button></div>
        </aside>

        <div className="board-panel">
          <div className="board-header"><div className="board-heading"><span className="section-index">02</span><h2>The playground</h2></div><div className="example-picker"><label htmlFor="example">Try a track</label><select id="example" value={example?.id ?? 'custom'} onChange={event => { const track = EXAMPLE_TRACKS.find(item => item.id === event.target.value); if (track) { edit(track.design, `${track.name} loaded. ${track.description}`); setSelected(null); } }}><option value="custom" disabled>Your own creation</option>{EXAMPLE_TRACKS.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}</select></div></div>
          <div className="board-meta"><span className={`status-label ${world.status}`}><span />{statusLabels[world.status]}</span><span>{design.pieces.length} pieces <span className="meta-divider">/</span> endless possibilities</span></div>
          <div className="canvas-wrap">
            <canvas ref={canvas} width={BOARD_WIDTH} height={BOARD_HEIGHT} tabIndex={0} role="application" aria-label="Marble run board, 14 columns by 10 rows" aria-describedby="board-instructions" onPointerMove={event => { setKeyboard(false); setHover(cellAt(event)); }} onPointerLeave={() => { if (!keyboard) setHover(null); }} onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.focus({ preventScroll: true }); setKeyboard(false); const cell = cellAt(event); setHover(cell); place(cell); }} onFocus={() => { setHover(value => value ?? { col: 0, row: 0 }); }} onKeyDown={boardKey} />
            {world.status === 'won' && <div className="result-badge" role="status"><span>✦</span> A little gravity. A great landing.</div>}
            {world.status === 'lost' && <div className="result-badge retry-badge">A happy accident. Tweak the track & try again.</div>}
          </div>
          <div className="transport">
            <div className="transport-actions"><button className="release-button" onClick={transport}><Icon name={running ? 'pause' : 'play'} />{running ? 'Pause marble' : world.status === 'paused' ? 'Keep rolling' : world.status === 'won' || world.status === 'lost' ? 'Roll again' : 'Release marble'}</button><button className="reset-button" onClick={resetBall} aria-label="Reset marble" title="Reset marble to the start"><Icon name="reset" /><span>Reset</span></button></div>
            <div className="stats" aria-label="Run statistics"><div><strong>{world.elapsed.toFixed(1)}<span>s</span></strong><span>TIME ELAPSED</span></div><div><strong>{world.collisions.toString().padStart(2, '0')}</strong><span>CONTACTS</span></div></div>
          </div>
          <div className={`board-feedback ${validationFeedback.length ? 'has-notice' : ''}`}><span aria-hidden="true">{validationFeedback.length ? '◌' : '✓'}</span><p>{validationFeedback.length ? validationFeedback.join(' ') : 'All set for a little adventure. The landing zone is your destination.'}</p><span className="save-label">{saved ? 'Autosaved' : 'Saving unavailable'}</span></div>
        </div>
      </section>

      <section className="how-to" aria-labelledby="how-to-title"><div className="how-to-heading"><p className="eyebrow">A few friendly pointers</p><h2 id="how-to-title">Follow your curiosity.</h2></div><div className="how-step"><span>1</span><div><h3>Make a path</h3><p>Choose a piece, then tap an empty spot. Tap any placed piece to edit it.</p></div></div><div className="how-step"><span>2</span><div><h3>Give it a twist</h3><p>Rotate to change direction. Remove, undo, and try something unexpected.</p></div></div><div className="how-step"><span>3</span><div><h3>Let gravity play</h3><p>Release your marble. Guide it to the green landing zone. Repeat with delight.</p></div></div></section>
      <p id="board-instructions" className="keyboard-hint"><span className="keyboard-symbol" aria-hidden="true">⌨</span> Keyboard-friendly, too: focus the board, use arrow keys to explore, Enter or Space to place / select, R to rotate, Delete to remove, and Ctrl / ⌘ Z to undo.</p>
      <p className="live-message" aria-live="polite" aria-atomic="true">{message}</p>
    </main>
    <footer><span className="footer-tagline">Real gravity. Real happy accidents.</span><span>Built for a little less hurry, a little more wonder. <span aria-hidden="true">✳</span></span></footer>
  </div>;
}
