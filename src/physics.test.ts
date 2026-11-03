import { describe, expect, it } from 'vitest';
import {
  BOARD_HEIGHT, BOARD_WIDTH, EXAMPLE_TRACKS, GRID, createWorld, deserializeDesign,
  getPieceSegments, serializeDesign, stepWorld, validateDesign,
  type Design, type Piece, type World,
} from './physics';

function emptyDesign(): Design {
  return {
    version: 1, pieces: [], spawn: { x: 90, y: 30 },
    goal: { x: 700, y: 540, width: 100, height: 40 },
  };
}

function running(design: Design, ball: Partial<World['ball']> = {}): World {
  const world = createWorld(design);
  return { ...world, status: 'running', ball: { ...world.ball, ...ball } };
}

function simulate(design: Design, seconds = 12, dt = 1 / 60) {
  let world = running(design);
  for (let frame = 0; frame < Math.ceil(seconds / dt) && world.status === 'running'; frame++) {
    world = stepWorld(world, design, dt);
  }
  return world;
}

describe('piece geometry', () => {
  it('uses exact clockwise quarter turns about a cell center', () => {
    const piece: Piece = { id: 'rail', kind: 'rail', col: 2, row: 3, rotation: 0 };
    expect(getPieceSegments(piece)).toEqual([{ a: { x: 120, y: 210 }, b: { x: 180, y: 210 } }]);
    expect(getPieceSegments({ ...piece, rotation: 1 })).toEqual([
      { a: { x: 150, y: 180 }, b: { x: 150, y: 240 } },
    ]);
    expect(getPieceSegments({ ...piece, rotation: 2 })[0].a).toEqual({ x: 180, y: 210 });
    expect(getPieceSegments({ ...piece, rotation: 3 })[0].a).toEqual({ x: 150, y: 240 });
  });

  it('keeps every curve and bumper segment within its cell at every rotation', () => {
    for (const kind of ['curve', 'bumper'] as const) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const segments = getPieceSegments({ id: kind, kind, col: 4, row: 4, rotation });
        expect(segments.length).toBeGreaterThan(3);
        for (const { a, b } of segments) {
          for (const point of [a, b]) {
            expect(point.x).toBeGreaterThanOrEqual(4 * GRID);
            expect(point.x).toBeLessThanOrEqual(5 * GRID);
            expect(point.y).toBeGreaterThanOrEqual(4 * GRID);
            expect(point.y).toBeLessThanOrEqual(5 * GRID);
          }
        }
      }
    }
  });
});

describe('gravity and finite-segment collisions', () => {
  it('accelerates downward without mutating the world or design', () => {
    const design = emptyDesign();
    const world = running(design);
    const before = JSON.stringify({ design, world });
    const next = stepWorld(world, design, 1 / 60);
    expect(next.ball.y).toBeGreaterThan(world.ball.y);
    expect(next.ball.vy).toBeCloseTo(3);
    expect(next.ball.vx).toBe(0);
    expect(next).not.toBe(world);
    expect(next.ball).not.toBe(world.ball);
    expect(JSON.stringify({ design, world })).toBe(before);
  });

  it('only advances running worlds and rejects invalid time deltas', () => {
    const design = emptyDesign();
    for (const status of ['ready', 'paused', 'won', 'lost'] as const) {
      const world = { ...createWorld(design), status };
      expect(stepWorld(world, design, 0.1)).toEqual(world);
    }
    const world = running(design);
    for (const dt of [0, -1, NaN, Infinity]) expect(stepWorld(world, design, dt)).toEqual(world);
  });

  it('substeps large frames so a fast marble cannot tunnel through a rail', () => {
    const design = emptyDesign();
    design.pieces = [{ id: 'floor', kind: 'rail', col: 1, row: 2, rotation: 0 }];
    const world = running(design, { x: 90, y: 120, vx: 80, vy: 600 });
    const next = stepWorld(world, design, 0.1);
    expect(next.collisions).toBeGreaterThan(0);
    expect(next.ball.y).toBeLessThanOrEqual(150 - 9);
    expect(next.ball.vx).toBeLessThan(80);
    expect(Math.abs(next.ball.vy)).toBeLessThan(100);
  });

  it('collides from below and with a finite rail endpoint, not an infinite line', () => {
    const design = emptyDesign();
    design.pieces = [{ id: 'rail', kind: 'rail', col: 1, row: 2, rotation: 0 }];
    const below = stepWorld(running(design, { x: 90, y: 165, vy: -200 }), design, 0.05);
    expect(below.collisions).toBeGreaterThan(0);
    expect(below.ball.y).toBeGreaterThanOrEqual(159);
    expect(below.ball.vy).toBeGreaterThan(0);
    const endpoint = stepWorld(running(design, { x: 125, y: 130, vy: 220 }), design, 0.1);
    expect(endpoint.collisions).toBeGreaterThan(0);
    expect(endpoint.ball.vx).toBeGreaterThan(0);
    const missed = stepWorld(running(design, { x: 140, y: 130, vy: 220 }), design, 0.1);
    expect(missed.collisions).toBe(0);
    expect(missed.ball.y).toBeGreaterThan(150);
  });

  it('resolves rotated rails and deflects a marble down a ramp', () => {
    const design = emptyDesign();
    design.pieces = [{ id: 'wall', kind: 'rail', col: 2, row: 2, rotation: 1 }];
    const wall = stepWorld(running(design, { x: 130, y: 150, vx: 250 }), design, 0.1);
    expect(wall.collisions).toBeGreaterThan(0);
    expect(wall.ball.x).toBeLessThan(141);
    expect(wall.ball.vx).toBeLessThan(0);
    design.pieces = [{ id: 'ramp', kind: 'ramp', col: 2, row: 2, rotation: 0 }];
    const ramp = stepWorld(running(design, { x: 150, y: 125, vy: 200 }), design, 0.15);
    expect(ramp.collisions).toBeGreaterThan(0);
    expect(ramp.ball.vx).toBeGreaterThan(0);
  });

  it('gives bumpers stronger restitution without adding speed', () => {
    const design = emptyDesign();
    design.pieces = [{ id: 'spring', kind: 'bumper', col: 2, row: 2, rotation: 0 }];
    const next = stepWorld(running(design, { x: 139, y: 110, vy: 250 }), design, 0.07);
    expect(next.collisions).toBeGreaterThan(0);
    expect(next.ball.vx).toBeLessThan(-100);
    expect(Math.hypot(next.ball.vx, next.ball.vy)).toBeLessThan(265);
  });

  it('caps speed and background-tab delta, with consistent fixed-size substeps', () => {
    const design = emptyDesign();
    const capped = stepWorld(running(design, { vx: 100_000, vy: 100_000 }), design, 100);
    expect(Math.hypot(capped.ball.vx, capped.ball.vy)).toBeLessThanOrEqual(600.000001);
    expect(capped.elapsed).toBeCloseTo(0.25);
    const start = running(design);
    const one = stepWorld(start, design, 0.1);
    let split = start;
    for (let i = 0; i < 6; i++) split = stepWorld(split, design, 1 / 60);
    expect(one.ball.y).toBeCloseTo(split.ball.y, 8);
    expect(one.ball.vy).toBeCloseTo(split.ball.vy, 8);
  });
});

describe('actual goals and escape', () => {
  it('wins only on physical contact with the goal, never just after elapsed time', () => {
    const design = emptyDesign();
    design.goal = { x: 70, y: 100, width: 40, height: 30 };
    expect(simulate(design).status).toBe('won');
    const missing = emptyDesign();
    expect(simulate(missing).status).toBe('lost');
    const stopped = simulate(design);
    expect(stepWorld(stopped, design, 1)).toEqual(stopped);
  });

  it('detects all four board escape directions', () => {
    const design = emptyDesign();
    for (const ball of [
      { x: -8, vx: -100 }, { x: BOARD_WIDTH + 8, vx: 100 },
      { y: -8, vy: -100 }, { y: BOARD_HEIGHT + 8, vy: 100 },
    ]) expect(stepWorld(running(design, ball), design, 0.05).status).toBe('lost');
  });

  it.each(EXAMPLE_TRACKS)('$name wins unmodified using collision physics', ({ design }) => {
    const before = serializeDesign(design);
    const world = simulate(design);
    expect(world.status).toBe('won');
    expect(world.elapsed).toBeGreaterThanOrEqual(3);
    expect(world.elapsed).toBeLessThanOrEqual(12);
    expect(world.collisions).toBeGreaterThan(0);
    expect(serializeDesign(design)).toBe(before);
    if (design.pieces.length === 7) expect(validateDesign(design)).toEqual([]);
  });

  it('default track also wins at 30 and 120 fps', () => {
    for (const dt of [1 / 30, 1 / 120]) expect(simulate(EXAMPLE_TRACKS[0].design, 12, dt).status).toBe('won');
  });
});

describe('design persistence and validation', () => {
  it('flags disconnected sections without blocking intentional physics jumps', () => {
    const track = EXAMPLE_TRACKS.find(track => track.id === 'leap')!;
    expect(validateDesign(track.design).join(' ')).toContain('gaps mean free-fall');
    expect(simulate(track.design).status).toBe('won');
  });
  it('round-trips the design and returns independent owned objects', () => {
    const design = EXAMPLE_TRACKS[0].design;
    const restored = deserializeDesign(serializeDesign(design));
    expect(restored).toEqual(design);
    expect(restored).not.toBe(design);
    expect(restored?.pieces[0]).not.toBe(design.pieces[0]);
    expect(deserializeDesign(JSON.stringify({ ...design, extra: true }))).toEqual(design);
  });

  it.each([
    '', '{', 'null', '[]', '{}', '{"version":2}', '{"version":1,"pieces":null}',
    ' '.repeat(100_001),
  ])('rejects malformed or oversized input %#', value => {
    expect(deserializeDesign(value)).toBeNull();
  });

  it('rejects unknown kinds, fractional or out-of-range geometry, IDs, cells and nonfinite fields', () => {
    const design = EXAMPLE_TRACKS[0].design;
    const invalid: unknown[] = [
      { ...design, version: 2 },
      { ...design, pieces: Array.from({ length: 141 }, () => design.pieces[0]) },
      { ...design, pieces: [null] },
      { ...design, pieces: [design.pieces[0], design.pieces[0]] },
      { ...design, pieces: [design.pieces[0], { ...design.pieces[1], id: design.pieces[0].id }] },
      { ...design, pieces: [design.pieces[0], { ...design.pieces[0], id: 'other' }] },
      ...[
        { kind: 'teleporter' }, { col: -1 }, { col: 14 }, { row: 10 }, { row: 0.5 },
        { rotation: 4 }, { rotation: 1.5 }, { id: '' }, { id: '  ' }, { id: 'x'.repeat(101) },
      ].map(patch => ({ ...design, pieces: [{ ...design.pieces[0], ...patch }] })),
      { ...design, spawn: { x: -1, y: 30 } },
      { ...design, spawn: { x: 90, y: Infinity } },
      { ...design, goal: { ...design.goal, width: -1 } },
      { ...design, goal: { ...design.goal, height: 0 } },
      { ...design, goal: { ...design.goal, x: BOARD_WIDTH - 10 } },
      { ...design, goal: { ...design.goal, y: NaN } },
    ];
    for (const value of invalid) {
      expect(deserializeDesign(JSON.stringify(value))).toBeNull();
      expect(() => serializeDesign(value as Design)).toThrow();
    }
    expect(deserializeDesign('{"version":1,"pieces":[],"spawn":{"x":1e999,"y":30},"goal":{"x":0,"y":500,"width":100,"height":40}}')).toBeNull();
  });

  it('advises on overlaps and free-fall without requiring a connected track', () => {
    const design = emptyDesign();
    expect(validateDesign(design).join(' ')).toMatch(/free-fall/i);
    design.pieces = [{ id: 'rail', kind: 'rail', col: 1, row: 0, rotation: 0 }];
    expect(validateDesign(design).join(' ')).toMatch(/overlaps/i);
    const disconnected = EXAMPLE_TRACKS[2].design;
    expect(deserializeDesign(serializeDesign(disconnected))).toEqual(disconnected);
    expect(validateDesign(disconnected).join(' ')).toContain('separate track sections');
  });
});
