export const GRID = 60;
export const BOARD_WIDTH = 840;
export const BOARD_HEIGHT = 600;

export type PieceKind = 'rail' | 'ramp' | 'curve' | 'bumper';
export interface Piece { id: string; kind: PieceKind; col: number; row: number; rotation: number }
export interface Segment { a: { x: number; y: number }; b: { x: number; y: number }; bounce?: number }
export interface Design {
  version: 1;
  pieces: Piece[];
  spawn: { x: number; y: number };
  goal: { x: number; y: number; width: number; height: number };
}
export interface Ball { x: number; y: number; vx: number; vy: number; radius: number }
export interface World {
  ball: Ball;
  status: 'ready' | 'running' | 'paused' | 'won' | 'lost';
  elapsed: number;
  collisions: number;
}

export const PIECE_LABELS: Record<PieceKind, string> = {
  rail: 'Straight rail', ramp: 'Sloping ramp', curve: 'Quarter curve', bumper: 'Spring bumper',
};

const RADIUS = 9;
const GRAVITY = 180;
const MAX_SPEED = 600;
const SUBSTEP = 1 / 240;
const FRICTION = 0.1;
const kinds: PieceKind[] = ['rail', 'ramp', 'curve', 'bumper'];

export function getPieceSegments(piece: Piece): Segment[] {
  let local: Segment[];
  switch (piece.kind) {
    case 'rail':
      local = [{ a: { x: -30, y: 0 }, b: { x: 30, y: 0 } }];
      break;
    case 'ramp':
      local = [{ a: { x: -30, y: -30 }, b: { x: 30, y: 30 } }];
      break;
    case 'curve': {
      // A concave quarter-circle: horizontal at its bottom and vertical at its right.
      const points = Array.from({ length: 13 }, (_, i) => {
        const angle = (i / 12) * Math.PI / 2;
        return { x: -30 + 60 * Math.sin(angle), y: -30 + 60 * Math.cos(angle) };
      });
      local = points.slice(1).map((b, i) => ({ a: points[i], b }));
      break;
    }
    case 'bumper': {
      const points = [{ x: 0, y: -22 }, { x: 22, y: 0 }, { x: 0, y: 22 }, { x: -22, y: 0 }];
      local = points.map((a, i) => ({ a, b: points[(i + 1) % 4], bounce: 0.92 }));
      break;
    }
    default:
      return [];
  }
  const rotate = (p: { x: number; y: number }) => {
    let { x, y } = p;
    for (let i = 0; i < ((piece.rotation % 4) + 4) % 4; i++) [x, y] = [-y, x];
    return { x: x + (piece.col + 0.5) * GRID, y: y + (piece.row + 0.5) * GRID };
  };
  return local.map(segment => ({ ...segment, a: rotate(segment.a), b: rotate(segment.b) }));
}

export function createWorld(design: Design): World {
  return {
    ball: { ...design.spawn, vx: 0, vy: 0, radius: RADIUS },
    status: 'ready', elapsed: 0, collisions: 0,
  };
}

function closest(ball: { x: number; y: number }, segment: Segment) {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((ball.x - segment.a.x) * dx + (ball.y - segment.a.y) * dy) / lengthSquared));
  return { x: segment.a.x + t * dx, y: segment.a.y + t * dy };
}

function resolve(ball: Ball, segment: Segment): boolean {
  const point = closest(ball, segment);
  let nx = ball.x - point.x;
  let ny = ball.y - point.y;
  const distance = Math.hypot(nx, ny);
  if (distance >= ball.radius) return false;
  if (distance > 1e-8) {
    nx /= distance;
    ny /= distance;
  } else {
    const dx = segment.b.x - segment.a.x;
    const dy = segment.b.y - segment.a.y;
    const length = Math.hypot(dx, dy) || 1;
    nx = dy / length;
    ny = -dx / length;
    if (ball.vx * nx + ball.vy * ny > 0) { nx = -nx; ny = -ny; }
  }
  ball.x += nx * (ball.radius - distance + 0.001);
  ball.y += ny * (ball.radius - distance + 0.001);
  const normalSpeed = ball.vx * nx + ball.vy * ny;
  if (normalSpeed >= 0) return false;
  const restitution = Math.abs(normalSpeed) < 20 ? 0 : (segment.bounce ?? 0.12);
  const impulse = -(1 + restitution) * normalSpeed;
  ball.vx += impulse * nx;
  ball.vy += impulse * ny;
  const tangentSpeed = ball.vx * -ny + ball.vy * nx;
  const friction = Math.min(Math.abs(tangentSpeed), FRICTION * impulse) * Math.sign(tangentSpeed);
  ball.vx -= friction * -ny;
  ball.vy -= friction * nx;
  return normalSpeed < -1;
}

function touchingGoal(ball: Ball, goal: Design['goal']) {
  const x = Math.max(goal.x, Math.min(goal.x + goal.width, ball.x));
  const y = Math.max(goal.y, Math.min(goal.y + goal.height, ball.y));
  return Math.hypot(ball.x - x, ball.y - y) <= ball.radius;
}

export function stepWorld(world: World, design: Design, dt: number): World {
  const next: World = { ...world, ball: { ...world.ball } };
  if (world.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return next;
  // Ignore long background-tab stalls; never perform a single tunnelling-sized step.
  const duration = Math.min(dt, 0.25);
  const steps = Math.ceil(duration / SUBSTEP);
  const h = duration / steps;
  const segments = design.pieces.flatMap(getPieceSegments);
  for (let i = 0; i < steps; i++) {
    const ball = next.ball;
    ball.vy += GRAVITY * h;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > MAX_SPEED) { ball.vx *= MAX_SPEED / speed; ball.vy *= MAX_SPEED / speed; }
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    // Multiple passes settle corners where two different segment normals meet.
    for (let pass = 0; pass < 3; pass++) {
      for (const segment of segments) if (resolve(ball, segment)) next.collisions++;
    }
    next.elapsed += h;
    if (touchingGoal(ball, design.goal)) next.status = 'won';
    else if (ball.x < -ball.radius || ball.x > BOARD_WIDTH + ball.radius ||
      ball.y > BOARD_HEIGHT + ball.radius || ball.y < -ball.radius) next.status = 'lost';
    if (next.status !== 'running') break;
  }
  return next;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const bounded = (value: unknown, min: number, max: number): value is number =>
  finite(value) && value >= min && value <= max;

function structuralIssues(value: unknown): string[] {
  if (!record(value) || value.version !== 1) return ['Use a version 1 design object.'];
  const errors: string[] = [];
  if (!Array.isArray(value.pieces) || value.pieces.length > 140) {
    errors.push('A design may contain at most 140 pieces.');
  } else {
    const ids = new Set<string>();
    const cells = new Set<string>();
    for (const piece of value.pieces) {
      if (!record(piece) || typeof piece.id !== 'string' || piece.id.trim().length === 0 ||
        piece.id.length > 100 || !kinds.includes(piece.kind as PieceKind) ||
        !bounded(piece.col, 0, 13) || !Number.isInteger(piece.col) ||
        !bounded(piece.row, 0, 9) || !Number.isInteger(piece.row) ||
        !bounded(piece.rotation, 0, 3) || !Number.isInteger(piece.rotation)) {
        errors.push('Each piece needs an ID, a known kind, a board cell, and a quarter-turn rotation (0–3).');
        continue;
      }
      if (ids.has(piece.id)) errors.push(`Duplicate piece ID: ${piece.id}.`);
      const cell = `${piece.col},${piece.row}`;
      if (cells.has(cell)) errors.push(`More than one piece occupies cell ${cell}.`);
      ids.add(piece.id);
      cells.add(cell);
    }
  }
  if (!record(value.spawn) || !bounded(value.spawn.x, RADIUS, BOARD_WIDTH - RADIUS) ||
    !bounded(value.spawn.y, RADIUS, BOARD_HEIGHT - RADIUS)) {
    errors.push('Keep the entire starting marble inside the board.');
  }
  if (!record(value.goal) || !bounded(value.goal.x, 0, BOARD_WIDTH) ||
    !bounded(value.goal.y, 0, BOARD_HEIGHT) || !bounded(value.goal.width, 18, BOARD_WIDTH) ||
    !bounded(value.goal.height, 18, BOARD_HEIGHT) ||
    (finite(value.goal.x) && finite(value.goal.width) && value.goal.x + value.goal.width > BOARD_WIDTH) ||
    (finite(value.goal.y) && finite(value.goal.height) && value.goal.y + value.goal.height > BOARD_HEIGHT)) {
    errors.push('The goal must be at least 18 × 18 pixels and entirely inside the board.');
  }
  return errors;
}

export function validateDesign(design: Design): string[] {
  const issues = structuralIssues(design);
  if (issues.length) return issues;
  const segments = design.pieces.flatMap(getPieceSegments);
  if (segments.some(s => {
    const p = closest(design.spawn, s);
    return Math.hypot(p.x - design.spawn.x, p.y - design.spawn.y) < RADIUS;
  })) issues.push('The starting marble overlaps a piece; move the spawn or rotate that piece.');
  if (touchingGoal({ ...design.spawn, vx: 0, vy: 0, radius: RADIUS }, design.goal)) {
    issues.push('The starting marble already touches the goal.');
  }
  if (design.pieces.length === 0) issues.push('No pieces yet: the marble will free-fall. Place a ramp to guide it.');
  else {
    const below = segments.some(s => Math.max(s.a.y, s.b.y) > design.spawn.y &&
      design.spawn.x >= Math.min(s.a.x, s.b.x) - RADIUS &&
      design.spawn.x <= Math.max(s.a.x, s.b.x) + RADIUS);
    if (!below) issues.push('There is a gap below the spawn: the marble will free-fall until it meets a piece or the goal.');
    const groups = design.pieces.map(piece => getPieceSegments(piece).flatMap(s => [s.a, s.b]));
    const visited = new Set<number>();
    let components = 0;
    for (let root = 0; root < groups.length; root++) {
      if (visited.has(root)) continue;
      components++;
      const pending = [root];
      visited.add(root);
      while (pending.length) {
        const index = pending.pop()!;
        groups.forEach((points, other) => {
          if (!visited.has(other) && groups[index].some(a =>
            points.some(b => Math.hypot(a.x - b.x, a.y - b.y) <= RADIUS * 2))) {
            visited.add(other);
            pending.push(other);
          }
        });
      }
    }
    if (components > 1) issues.push(`${components} separate track sections: gaps mean free-fall. Intentional jumps are welcome — test your landing.`);
  }
  return issues;
}

export function serializeDesign(design: Design): string {
  const issues = structuralIssues(design);
  if (issues.length) throw new Error(issues.join(' '));
  return JSON.stringify(design);
}

export function deserializeDesign(value: string): Design | null {
  if (typeof value !== 'string' || value.length > 100_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (structuralIssues(parsed).length) return null;
    const design = parsed as Design;
    // Copy only the public schema, not arbitrary fields from an imported object.
    return {
      version: 1,
      pieces: design.pieces.map(({ id, kind, col, row, rotation }) => ({ id, kind, col, row, rotation })),
      spawn: { x: design.spawn.x, y: design.spawn.y },
      goal: { x: design.goal.x, y: design.goal.y, width: design.goal.width, height: design.goal.height },
    };
  } catch {
    return null;
  }
}

function diagonal(id: string, startCol: number, mirrored = false): Design {
  return {
    version: 1,
    pieces: Array.from({ length: 7 }, (_, index) => ({
      id: `${id}-${index}`, kind: 'ramp' as const,
      col: mirrored ? startCol - index : startCol + index,
      row: index + 1, rotation: mirrored ? 1 : 0,
    })),
    spawn: { x: (startCol + 0.5) * GRID, y: 34 },
    goal: { x: mirrored ? 100 : 450, y: 520, width: 240, height: 65 },
  };
}

export const EXAMPLE_TRACKS: Array<{ id: string; name: string; description: string; design: Design }> = [
  { id: 'cascade', name: 'Golden cascade', description: 'Seven connected slopes carry the marble into a wide landing zone.', design: diagonal('cascade', 1) },
  { id: 'mirror', name: 'Mirror descent', description: 'A leftward cascade explores quarter-turn rotation and gravity.', design: diagonal('mirror', 11, true) },
  {
    id: 'leap', name: 'Leap of faith', description: 'An intentional free-fall gap leads to the final ramps.',
    design: { ...diagonal('leap', 2), pieces: diagonal('leap', 2).pieces.filter((_, i) => i !== 3),
      goal: { x: 480, y: 520, width: 280, height: 65 } },
  },
];
