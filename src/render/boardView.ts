import * as THREE from 'three';
import type { Board, Cell } from '../core/board';

const AMBER = '#ffb000';
const AMBER_DIM = '#7a4f00';
const RED = '#ff3b1f';
const NUM_COLORS = ['', '#ffd36b', '#ffb000', '#ff8c00', '#ff6a00', '#ff4d00', '#ff2e2e', '#ff2e8a', '#ffffff'];

type TileKind = 'hidden' | 'hover' | 'flag' | 'mine' | 'exploded' | `n${number}`;

function makeTexture(draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function hiddenTile(ctx: CanvasRenderingContext2D, s: number, hover: boolean) {
  ctx.fillStyle = hover ? '#4a3006' : '#2a1b03';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = hover ? AMBER : AMBER_DIM;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, s - 12, s - 12);
}

function openTile(ctx: CanvasRenderingContext2D, s: number, bg = '#0c0800') {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#2a1b03';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, s - 4, s - 4);
}

function glyph(ctx: CanvasRenderingContext2D, s: number, text: string, color: string) {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.font = `bold ${s * 0.62}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, s / 2, s / 2 + 4);
}

function buildMaterials(): Record<TileKind, THREE.MeshBasicMaterial> {
  const mk = (draw: (c: CanvasRenderingContext2D, s: number) => void) =>
    new THREE.MeshBasicMaterial({ map: makeTexture(draw) });
  const mats: Record<string, THREE.MeshBasicMaterial> = {
    hidden: mk((c, s) => hiddenTile(c, s, false)),
    hover: mk((c, s) => hiddenTile(c, s, true)),
    flag: mk((c, s) => (hiddenTile(c, s, false), glyph(c, s, '▲', RED))),
    mine: mk((c, s) => (openTile(c, s), glyph(c, s, '✱', RED))),
    exploded: mk((c, s) => (openTile(c, s, '#3a0800'), glyph(c, s, '✱', '#ffffff'))),
  };
  for (let n = 0; n <= 8; n++) mats[`n${n}`] = mk((c, s) => (openTile(c, s), n && glyph(c, s, String(n), NUM_COLORS[n])));
  return mats as Record<TileKind, THREE.MeshBasicMaterial>;
}

/** Three.js view of the board. Knows nothing about rules — only renders Cell state and reports input. */
export class BoardView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private raycaster = new THREE.Raycaster();
  private geometry = new THREE.PlaneGeometry(0.94, 0.94);
  private materials = buildMaterials();
  private meshes: THREE.Mesh[] = [];
  private pop = new Map<THREE.Mesh, number>();
  private board?: Board;
  private hover?: Cell;
  private shake = 0;
  private longPress?: number;

  constructor(
    private container: HTMLElement,
    private onAction: (x: number, y: number, action: 'reveal' | 'flag') => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x050300);
    container.appendChild(this.renderer.domElement);
    this.camera.position.z = 10;
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(container);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  build(board: Board): void {
    for (const m of this.meshes) this.scene.remove(m);
    this.meshes = [];
    this.board = board;
    for (const c of board.cells) {
      const mesh = new THREE.Mesh(this.geometry, this.materials.hidden);
      mesh.position.set(c.x - (board.w - 1) / 2, (board.h - 1) / 2 - c.y, 0);
      mesh.userData.cell = c;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.resize();
    this.sync();
  }

  sync(): void {
    for (const mesh of this.meshes) {
      const c = mesh.userData.cell as Cell;
      const next = this.materials[this.kindOf(c)];
      if (mesh.material !== next) {
        if (c.revealed && mesh.material !== this.materials.hidden && mesh.material !== this.materials.hover) {
          // already revealed, no pop
        } else if (c.revealed) {
          this.pop.set(mesh, 0);
        }
        mesh.material = next;
      }
    }
  }

  /** Screen shake, e.g. on mine hit. */
  kick(amount = 0.25): void {
    this.shake = amount;
  }

  private kindOf(c: Cell): TileKind {
    if (c.exploded) return 'exploded';
    if (c.revealed) return c.mine ? 'mine' : `n${c.adjacent}`;
    if (c.flagged) return 'flag';
    return c === this.hover ? 'hover' : 'hidden';
  }

  private frame(): void {
    for (const [mesh, t] of this.pop) {
      const nt = t + 0.12;
      const k = Math.min(nt, 1);
      mesh.scale.setScalar(0.5 + 0.5 * (1 - (1 - k) ** 3) + Math.sin(k * Math.PI) * 0.12);
      if (nt >= 1) (mesh.scale.setScalar(1), this.pop.delete(mesh));
      else this.pop.set(mesh, nt);
    }
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
    const bw = (this.board?.w ?? 10) + 1;
    const bh = (this.board?.h ?? 10) + 1;
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

  private bindInput(): void {
    const el = this.renderer.domElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointermove', (e) => {
      const c = this.pick(e);
      if (c !== this.hover) (this.hover = c), this.sync();
    });
    el.addEventListener('pointerleave', () => ((this.hover = undefined), this.sync()));
    el.addEventListener('pointerdown', (e) => {
      const c = this.pick(e);
      if (!c) return;
      if (e.pointerType === 'mouse') {
        if (e.button === 0) this.onAction(c.x, c.y, 'reveal');
        else if (e.button === 2) this.onAction(c.x, c.y, 'flag');
        return;
      }
      // Touch: tap = reveal, long press = flag.
      this.longPress = window.setTimeout(() => {
        this.longPress = undefined;
        this.onAction(c.x, c.y, 'flag');
        navigator.vibrate?.(30);
      }, 350);
      const up = () => {
        el.removeEventListener('pointerup', up);
        if (this.longPress !== undefined) {
          clearTimeout(this.longPress);
          this.longPress = undefined;
          this.onAction(c.x, c.y, 'reveal');
        }
      };
      el.addEventListener('pointerup', up);
    });
  }
}
