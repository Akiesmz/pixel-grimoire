declare module 'pixelfx' {
  export interface PixelFrame {
    w: number;
    h: number;
    ox: number;
    oy: number;
    color: Uint32Array;
    light: Uint32Array;
  }

  export interface FxMeta {
    name?: string;
    desc?: string;
    tags?: string[];
    size?: [number, number];
    origin?: [number, number];
    duration?: number;
    loop?: boolean;
    fps?: number;
    options?: Record<string, unknown>;
  }

  export interface FxModule {
    meta?: FxMeta;
    create?: (opts: Record<string, unknown>) => unknown;
    draw?: (...args: unknown[]) => void;
    drawBack?: (...args: unknown[]) => void;
    update?: (...args: unknown[]) => void;
  }

  export interface FxOptions {
    x?: number;
    y?: number;
    flip?: boolean;
    angle?: number;
    seed?: number;
    palette?: string[];
    light?: number;
    [key: string]: unknown;
  }

  export interface FxInstance {
    meta: FxMeta;
    options: FxOptions;
    readonly t: number;
    update(dt: number): void;
    draw(frame: PixelFrame, layer?: 'back' | 'front'): void;
    stop(): void;
    done(): boolean;
  }

  export function createFrame(w: number, h: number, ox?: number, oy?: number): PixelFrame;
  export function clearFrame(frame: PixelFrame): PixelFrame;
  export function createFx(mod: FxModule, opts?: FxOptions): FxInstance;
  export function composite(
    frame: PixelFrame,
    out: Uint8ClampedArray,
    bg?: number | Uint32Array | null,
    lightK?: number
  ): Uint8ClampedArray;
}

declare module 'pixelfx/fx/*' {
  import type { FxModule } from 'pixelfx';
  export const meta: FxModule['meta'];
  export const create: FxModule['create'];
  export const draw: FxModule['draw'];
  export const drawBack: FxModule['drawBack'];
  export const update: FxModule['update'];
}
