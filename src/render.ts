import { BOARD_HEIGHT, BOARD_WIDTH, GRID, getPieceSegments } from './physics';
import type { Design, Piece, World } from './physics';

export interface BoardView {
  selected: string | null;
  hover: { col: number; row: number } | null;
  preview: Piece | null;
  trail: { x: number; y: number }[];
  keyboard: boolean;
}

const colors = { rail: '#588b80', ramp: '#e49b60', curve: '#719fc0', bumper: '#bb8cbb' };

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function piece(ctx: CanvasRenderingContext2D, item: Piece, ghost = false) {
  const segments = getPieceSegments(item);
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  segments.forEach((s, i) => {
    if (i === 0 || item.kind === 'bumper') ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
  });
  ctx.strokeStyle = '#283d3330';
  ctx.lineWidth = 12;
  ctx.shadowColor = '#2c433a35';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 5;
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = colors[item.kind];
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff70';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (item.kind === 'bumper') {
    ctx.fillStyle = '#b989b3';
    const x = (item.col + 0.5) * GRID;
    const y = (item.row + 0.5) * GRID;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6';
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawBoard(canvas: HTMLCanvasElement, design: Design, world: World, view: BoardView) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(BOARD_WIDTH * dpr);
  const height = Math.round(BOARD_HEIGHT * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  ctx.fillStyle = '#faf9f2';
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  const glow = ctx.createRadialGradient(690, 125, 10, 620, 220, 550);
  glow.addColorStop(0, '#e8f0e9');
  glow.addColorStop(1, '#faf9f200');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  ctx.fillStyle = '#c9d5cb';
  for (let x = GRID; x < BOARD_WIDTH; x += GRID) {
    for (let y = GRID; y < BOARD_HEIGHT; y += GRID) {
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.save();
  const { goal } = design;
  rounded(ctx, goal.x, goal.y, goal.width, goal.height, 18);
  ctx.fillStyle = world.status === 'won' ? '#bce2be' : '#dfeade';
  ctx.fill();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#92b8a0'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#4f7b60';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '1px';
  ctx.fillText(world.status === 'won' ? 'BEAUTIFUL LANDING!' : 'LANDING ZONE', goal.x + goal.width / 2, goal.y + goal.height / 2 + 5);
  ctx.restore();

  const { spawn } = design;
  ctx.save();
  ctx.setLineDash([3, 5]); ctx.strokeStyle = '#d1b294'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(spawn.x, spawn.y, 19, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#9b785e';
  ctx.textAlign = 'left'; ctx.fillText('START', spawn.x + 27, spawn.y + 4);
  ctx.restore();

  for (const item of design.pieces) {
    if (item.id === view.selected) {
      rounded(ctx, item.col * GRID + 4, item.row * GRID + 4, GRID - 8, GRID - 8, 12);
      ctx.fillStyle = '#dcebe3'; ctx.fill();
      ctx.strokeStyle = '#53866f'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    piece(ctx, item);
  }
  if (view.hover) {
    const { col, row } = view.hover;
    rounded(ctx, col * GRID + 3, row * GRID + 3, GRID - 6, GRID - 6, 12);
    ctx.strokeStyle = view.keyboard ? '#265e4d' : '#709c8180';
    ctx.lineWidth = view.keyboard ? 2 : 1;
    ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
  }
  if (view.preview && !design.pieces.some(p => p.col === view.preview!.col && p.row === view.preview!.row)) {
    piece(ctx, view.preview, true);
  }

  view.trail.forEach((point, index) => {
    ctx.fillStyle = `rgba(222, 125, 76, ${(index / view.trail.length) * 0.2})`;
    ctx.beginPath(); ctx.arc(point.x, point.y, 2.5 * index / view.trail.length + 1, 0, Math.PI * 2); ctx.fill();
  });
  const ball = world.ball;
  ctx.save();
  ctx.shadowColor = '#74452340'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5;
  const marble = ctx.createRadialGradient(ball.x - 3, ball.y - 4, 1, ball.x, ball.y, ball.radius + 1);
  marble.addColorStop(0, '#ffe6ad');
  marble.addColorStop(0.35, '#f3a464');
  marble.addColorStop(0.75, '#ec7948');
  marble.addColorStop(1, '#b94f2f');
  ctx.fillStyle = marble;
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#fff9'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(ball.x - 1, ball.y - 1, 5, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
  ctx.restore();
  if (world.status === 'ready') {
    ctx.save(); ctx.fillStyle = '#879b8a'; ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.fillText('A little room for experimentation.', BOARD_WIDTH - 24, 29); ctx.restore();
  }
}
