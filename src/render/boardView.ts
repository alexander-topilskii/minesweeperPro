import * as THREE from 'three';
import type { Board, Cell } from '../core/board';

/** Classic Minesweeper palette. */
const FACE = '#c0c0c0';
const LIGHT = '#ffffff';
const SHADOW = '#808080';
const NUM_COLORS = ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000000', '#808080'];
const TEX = 32; // low-res + nearest filter = crisp pixel look

type TileKind = 'hidden' | 'hover' | 'pressed' | 'flag' | 'slotFlag' | 'slotGlow' | 'mine' | 'exploded' | 'wrongFlag' | 'defused' | 'checking' | `n${number}`;

function makeTexture(draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx, TEX);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function raised(ctx: CanvasRenderingContext2D, s: number, face = FACE) {
  const b = 4;
  ctx.fillStyle = face;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(0, 0, s, b);
  ctx.fillRect(0, 0, b, s);
  ctx.fillStyle = SHADOW;
  for (let i = 0; i < b; i++) {
    ctx.fillRect(i + 1, s - 1 - i, s - i - 1, 1);
    ctx.fillRect(s - 1 - i, i + 1, 1, s - i - 1);
  }
}

function sunken(ctx: CanvasRenderingContext2D, s: number, bg = FACE) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = SHADOW;
  ctx.fillRect(0, 0, s, 1);
  ctx.fillRect(0, 0, 1, s);
}

function digit(ctx: CanvasRenderingContext2D, s: number, n: number) {
  ctx.fillStyle = NUM_COLORS[n];
  ctx.font = `bold ${s * 0.78}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), s / 2 + 0.5, s / 2 + 1.5);
}

function flag(ctx: CanvasRenderingContext2D, s: number) {
  const u = s / 16;
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.moveTo(9 * u, 3 * u);
  ctx.lineTo(9 * u, 9 * u);
  ctx.lineTo(3.5 * u, 6 * u);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(8.5 * u, 3 * u, 1.2 * u, 8 * u);
  ctx.fillRect(6 * u, 11 * u, 5 * u, 1.2 * u);
  ctx.fillRect(4.5 * u, 12 * u, 8 * u, 1.5 * u);
}

function mine(ctx: CanvasRenderingContext2D, s: number) {
  const u = s / 16;
  const c = s / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(c - 0.5 * u, 2 * u, u, 12 * u);
  ctx.fillRect(2 * u, c - 0.5 * u, 12 * u, u);
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-0.5 * u, -4.5 * u, u, 9 * u);
  ctx.fillRect(-4.5 * u, -0.5 * u, 9 * u, u);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(c, c, 4.2 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(c - 2.2 * u, c - 2.2 * u, 1.6 * u, 1.6 * u);
}

function defusedMine(ctx: CanvasRenderingContext2D, s: number) {
  const u = s / 16;
  const c = s / 2;
  // Neutralized dark mine body
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(c, c, 4.2 * u, 0, Math.PI * 2);
  ctx.fill();
  // Bright neon checkmark spark
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.moveTo(c - 2.5 * u, c);
  ctx.lineTo(c - 0.5 * u, c + 2.2 * u);
  ctx.lineTo(c + 2.8 * u, c - 2 * u);
  ctx.stroke();
}

function wrongFlag(ctx: CanvasRenderingContext2D, s: number) {
  flag(ctx, s);
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = Math.max(2, s / 8);
  ctx.beginPath();
  ctx.moveTo(2, 2);
  ctx.lineTo(s - 2, s - 2);
  ctx.moveTo(s - 2, 2);
  ctx.lineTo(2, s - 2);
  ctx.stroke();
}

function slotMachine(ctx: CanvasRenderingContext2D, s: number, glow = false) {
  const u = s / 16;
  const c = s / 2;

  // Outer casing of the slot cabinet
  ctx.fillStyle = glow ? '#ff0055' : '#8b0000';
  ctx.fillRect(2.5 * u, 2 * u, 11 * u, 12 * u);

  // Gold trim / bezel
  ctx.strokeStyle = glow ? '#ffe600' : '#d4af37';
  ctx.lineWidth = 1.2 * u;
  ctx.strokeRect(3 * u, 2.5 * u, 10 * u, 11 * u);

  // Top marquee (neon header)
  ctx.fillStyle = glow ? '#ffea00' : '#ffa500';
  ctx.fillRect(4 * u, 3.2 * u, 8 * u, 2.4 * u);
  ctx.fillStyle = '#000';
  ctx.font = `bold ${4 * u}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('777', c, 4.5 * u);

  // Reel window (cyan screen)
  ctx.fillStyle = '#051b2c';
  ctx.fillRect(4 * u, 6.2 * u, 8 * u, 4.2 * u);
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 0.8 * u;
  ctx.strokeRect(4 * u, 6.2 * u, 8 * u, 4.2 * u);

  // 3 Reels: 🍒 7 ⚡
  ctx.fillStyle = glow ? '#ffffff' : '#00ffff';
  ctx.font = `bold ${3.2 * u}px monospace`;
  ctx.fillText('7', 5.3 * u, 8.4 * u);
  ctx.fillText('7', c, 8.4 * u);
  ctx.fillText('7', 10.7 * u, 8.4 * u);

  // Mini side lever
  ctx.fillStyle = '#silver';
  ctx.fillRect(13.5 * u, 5 * u, 1.2 * u, 4 * u);
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(14.1 * u, 4.5 * u, 1.3 * u, 0, Math.PI * 2);
  ctx.fill();
}

function buildMaterials(): Record<TileKind, THREE.MeshBasicMaterial> {
  const mk = (draw: (c: CanvasRenderingContext2D, s: number) => void) =>
    new THREE.MeshBasicMaterial({ map: makeTexture(draw) });
  const mats: Record<string, THREE.MeshBasicMaterial> = {
    hidden: mk((c, s) => raised(c, s)),
    hover: mk((c, s) => raised(c, s, '#d4d4d4')),
    pressed: mk((c, s) => sunken(c, s)),
    flag: mk((c, s) => (raised(c, s), flag(c, s))),
    slotFlag: mk((c, s) => (raised(c, s, '#ffe8ec'), slotMachine(c, s, false))),
    slotGlow: mk((c, s) => {
      raised(c, s, '#fff5a0');
      slotMachine(c, s, true);
      c.strokeStyle = '#ff0055';
      c.lineWidth = 2;
      c.strokeRect(1, 1, s - 2, s - 2);
    }),
    mine: mk((c, s) => (sunken(c, s), mine(c, s))),
    exploded: mk((c, s) => (sunken(c, s, '#ff0000'), mine(c, s))),
    defused: mk((c, s) => (sunken(c, s, '#0d2818'), defusedMine(c, s))),
    wrongFlag: mk((c, s) => (sunken(c, s, '#ffebeb'), wrongFlag(c, s))),
    checking: mk((c, s) => {
      raised(c, s, '#fffae0');
      slotMachine(c, s, true);
      c.strokeStyle = '#ffaa00';
      c.lineWidth = 2;
      c.strokeRect(1, 1, s - 2, s - 2);
    }),
  };
  for (let n = 0; n <= 8; n++) mats[`n${n}`] = mk((c, s) => (sunken(c, s), n && digit(c, s, n)));
  return mats as Record<TileKind, THREE.MeshBasicMaterial>;
}

/** Three.js view of the board. Knows nothing about rules — only renders Cell state and reports input. */
export class BoardView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private raycaster = new THREE.Raycaster();
  private geometry = new THREE.PlaneGeometry(1, 1);
  private materials = buildMaterials();
  private meshes: THREE.Mesh[] = [];
  /** mesh → animation time; negative = delayed (ripple). */
  private pop = new Map<THREE.Mesh, number>();
  private glow: THREE.Mesh;
  private board?: Board;
  private hover?: Cell;
  private pressed?: Cell;
  private origin?: { x: number; y: number };
  private shake = 0;
  private time = 0;
  private longPress?: number;
  private checkingCell?: Cell;
  private glowingSlotCells = new Set<Cell>();
  public locked = false;

  setCheckingCell(c?: Cell): void {
    this.checkingCell = c;
    if (c && this.board) {
      const idx = c.y * this.board.w + c.x;
      const mesh = this.meshes[idx];
      if (mesh) this.pop.set(mesh, 0);
    }
    this.sync();
  }

  setGlowingSlotCells(cells: Cell[]): void {
    this.glowingSlotCells = new Set(cells);
    this.sync();
  }

  constructor(
    private container: HTMLElement,
    private onAction: (x: number, y: number, action: 'reveal' | 'flag') => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    this.camera.position.z = 10;

    // Modern layer: soft additive hover glow on top of the retro grid.
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.glow.position.z = 1;
    this.glow.visible = false;
    this.scene.add(this.glow);

    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(container);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  build(board: Board): void {
    for (const m of this.meshes) this.scene.remove(m);
    this.meshes = [];
    this.pop.clear();
    this.board = board;
    for (const c of board.cells) {
      const mesh = new THREE.Mesh(this.geometry, this.materials.hidden);
      mesh.position.copy(this.cellPos(c.x, c.y));
      mesh.userData.cell = c;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      // Board boot-up wave.
      mesh.scale.setScalar(0);
      this.pop.set(mesh, -(c.x + c.y) * 0.08);
    }
    this.resize();
    this.sync();
  }

  sync(): void {
    for (const mesh of this.meshes) {
      const c = mesh.userData.cell as Cell;
      const next = this.materials[this.kindOf(c)];
      if (mesh.material === next) continue;
      const wasHidden = [this.materials.hidden, this.materials.hover, this.materials.pressed].includes(
        mesh.material as THREE.MeshBasicMaterial,
      );
      if (c.revealed && wasHidden && !this.pop.has(mesh)) {
        const o = this.origin ?? c;
        const dist = Math.max(Math.abs(c.x - o.x), Math.abs(c.y - o.y));
        this.pop.set(mesh, -dist * 0.18);
        mesh.scale.setScalar(0.85);
      }
      mesh.material = next;
    }
  }

  kick(amount = 0.3): void {
    this.shake = amount;
  }

  /** CSS pixel position of a cell centre relative to the container. */
  cellToScreen(x: number, y: number): { x: number; y: number } {
    const v = this.cellPos(x, y).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.container.clientWidth,
      y: ((1 - v.y) / 2) * this.container.clientHeight,
    };
  }

  private cellPos(x: number, y: number): THREE.Vector3 {
    const b = this.board!;
    return new THREE.Vector3(x - (b.w - 1) / 2, (b.h - 1) / 2 - y, 0);
  }

  private kindOf(c: Cell): TileKind {
    if (c === this.checkingCell) return 'checking';
    if (c.exploded) return 'exploded';
    if (c.defused) return 'defused';
    if (c.wrong) return 'wrongFlag';
    if (c.revealed) return c.mine ? 'mine' : `n${c.adjacent}`;
    if (c.slotFlag) return this.glowingSlotCells.has(c) ? 'slotGlow' : 'slotFlag';
    if (c.flagged) return 'flag';
    if (c === this.pressed) return 'pressed';
    return c === this.hover ? 'hover' : 'hidden';
  }

  private frame(): void {
    this.time += 1 / 60;
    for (const [mesh, t] of this.pop) {
      const nt = t + 0.1;
      if (nt < 0) {
        this.pop.set(mesh, nt);
        continue;
      }
      const k = Math.min(nt, 1);
      // ease-out-back
      const s = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
      mesh.scale.setScalar(0.85 + 0.15 * s);
      if (nt >= 1) (mesh.scale.setScalar(1), this.pop.delete(mesh));
      else this.pop.set(mesh, nt);
    }

    if (this.hover && !this.hover.revealed) {
      this.glow.visible = true;
      this.glow.position.set(this.cellPos(this.hover.x, this.hover.y).x, this.cellPos(this.hover.x, this.hover.y).y, 1);
      const hue = (this.time * 0.15) % 1;
      (this.glow.material as THREE.MeshBasicMaterial).color.setHSL(hue, 0.9, 0.5);
      (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(this.time * 5) * 0.1;
    } else this.glow.visible = false;

    if (this.shake > 0.001) {
      this.camera.position.x = (Math.random() - 0.5) * this.shake;
      this.camera.position.y = (Math.random() - 0.5) * this.shake;
      this.shake *= 0.85;
    } else this.camera.position.set(0, 0, 10);
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const bw = this.board?.w ?? 10;
    const bh = this.board?.h ?? 10;
    const aspect = w / h;
    const halfH = Math.max(bh, bw / aspect) / 2;
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  private pick(e: PointerEvent): Cell | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(this.meshes)[0]?.object.userData.cell as Cell | undefined;
  }

  private act(c: Cell, action: 'reveal' | 'flag') {
    if (this.locked) return;
    this.origin = { x: c.x, y: c.y };
    this.onAction(c.x, c.y, action);
  }

  private bindInput(): void {
    const el = this.renderer.domElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointermove', (e) => {
      const c = this.pick(e);
      if (c !== this.hover) (this.hover = c), this.sync();
    });
    el.addEventListener('pointerleave', () => ((this.hover = this.pressed = undefined), this.sync()));
    el.addEventListener('pointerdown', (e) => {
      const c = this.pick(e);
      if (!c) return;
      if (e.pointerType === 'mouse' && e.button === 2) return this.act(c, 'flag');
      if (e.button !== 0) return;
      // Classic feel: tile looks pressed while held, action fires on release.
      this.pressed = c;
      this.sync();
      document.body.classList.add('pressing');
      if (e.pointerType !== 'mouse') {
        this.longPress = window.setTimeout(() => {
          this.longPress = undefined;
          this.pressed = undefined;
          document.body.classList.remove('pressing');
          this.act(c, 'flag');
          navigator.vibrate?.(30);
        }, 350);
      }
    });
    window.addEventListener('pointerup', (e) => {
      document.body.classList.remove('pressing');
      if (this.longPress !== undefined) clearTimeout(this.longPress), (this.longPress = undefined);
      const p = this.pressed;
      this.pressed = undefined;
      if (!p) return;
      const c = e.target === el ? this.pick(e) : undefined;
      if (c === p) this.act(c, 'reveal');
      else this.sync();
    });
  }
}

function makeGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
