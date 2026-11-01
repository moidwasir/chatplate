import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as opentype from 'opentype.js';
import sharp, { type OverlayOptions } from 'sharp';
import { StorageService } from '../../common/storage/storage.service';
import { SessionService } from './session.service';

export interface GridTile {
  name: string;
  /** Public photo; tiles without one get a plain coloured square with the initial */
  imageUrl?: string | null;
}

/** At most 4 rows of 3 */
export const GRID_MAX_TILES = 12;

const COLS = 3;
const TILE_W = 360;
const PHOTO_W = 320;
const PHOTO_H = 240;
const TILE_H = 330;
const HEADER_H = 130;
const PADDING_BOTTOM = 24;
const BACKGROUND = '#FFF8F0';
const INK = '#1F2937';
const ACCENT = '#16A34A';
/** Generated images are reused for this long (a menu change makes a new one anyway) */
const CACHE_TTL_S = 30 * 24 * 60 * 60;
/** Bump when the layout changes so old images aren't reused */
const LAYOUT_VERSION = 1;

/**
 * Draws the menu's categories as one picture (photo grid with numbered names), like a
 * food-app home screen, so customers see every category at once. WhatsApp can't make
 * parts of an image tappable, so it is always sent with a numbered category list.
 * Images are stored once per menu version and reused.
 */
@Injectable()
export class MenuGridService {
  private readonly logger = new Logger(MenuGridService.name);
  private font?: opentype.Font;
  /** Per-instance copy of the Redis cache */
  private readonly memo = new Map<string, string>();

  constructor(
    private readonly storage: StorageService,
    private readonly session: SessionService,
  ) {}

  /** Public URL of the grid image, or null if it can't be made (no photos, storage or font) */
  async gridUrl(branchId: string, title: string, tiles: GridTile[]): Promise<string | null> {
    const shown = tiles.slice(0, GRID_MAX_TILES);
    if (shown.filter((t) => t.imageUrl).length < 2) return null;

    const hash = createHash('sha1').update(JSON.stringify({ v: LAYOUT_VERSION, title, shown })).digest('hex').slice(0, 16);
    const cacheKey = `menugrid:${branchId}:${hash}`;
    const known = this.memo.get(cacheKey) ?? (await this.session.getCached(cacheKey).catch(() => null));
    if (known) {
      this.memo.set(cacheKey, known);
      return known;
    }

    try {
      const started = Date.now();
      const image = await this.render(title, shown);
      const url = await this.storage.put(`menu-grid/${branchId}/${hash}.jpg`, image, 'image/jpeg');
      this.memo.set(cacheKey, url);
      await this.session.setCached(cacheKey, url, CACHE_TTL_S).catch(() => undefined);
      this.logger.log(`Menu grid for ${branchId} made in ${Date.now() - started} ms (${shown.length} categories)`);
      return url;
    } catch (err: any) {
      this.logger.warn(`Could not make the menu grid: ${err?.message ?? err}`);
      return null;
    }
  }

  async render(title: string, tiles: GridTile[]): Promise<Buffer> {
    const font = this.loadFont();
    const rows = Math.ceil(tiles.length / COLS);
    const width = COLS * TILE_W;
    const height = HEADER_H + rows * TILE_H + PADDING_BOTTOM;

    const svg: string[] = [];
    // Title, shrunk to fit
    svg.push(this.text(font, title, width / 2, 78, 46, width - 80, INK));
    svg.push(`<rect x="${width / 2 - 40}" y="98" width="80" height="5" rx="2.5" fill="${ACCENT}"/>`);

    const layers: OverlayOptions[] = [];
    await Promise.all(
      tiles.map(async (tile, i) => {
        const row = Math.floor(i / COLS);
        const inRow = Math.min(COLS, tiles.length - row * COLS);
        // Centre a short last row
        const offset = ((COLS - inRow) * TILE_W) / 2;
        const left = Math.round(offset + (i % COLS) * TILE_W + (TILE_W - PHOTO_W) / 2);
        const top = HEADER_H + row * TILE_H;

        const photo = (tile.imageUrl && (await this.photo(tile.imageUrl).catch(() => null))) || (await this.placeholder(font, tile.name));
        layers.push({ input: photo, left, top });

        // Number badge (matches the list sent under the picture) and the name
        svg.push(`<circle cx="${left + 30}" cy="${top + 30}" r="22" fill="${ACCENT}" stroke="#ffffff" stroke-width="3"/>`);
        svg.push(this.text(font, String(i + 1), left + 30, top + 40, 26, 40, '#ffffff'));
        svg.push(this.text(font, tile.name, left + PHOTO_W / 2, top + PHOTO_H + 46, 28, PHOTO_W, INK));
      }),
    );

    const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svg.join('')}</svg>`);
    return sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
      .composite([...layers, { input: overlay, left: 0, top: 0 }])
      .jpeg({ quality: 86 })
      .toBuffer();
  }

  /** Rounded, centre-cropped photo */
  private async photo(url: string): Promise<Buffer> {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`photo ${res.status}`);
    return sharp(Buffer.from(await res.arrayBuffer()))
      .resize(PHOTO_W, PHOTO_H, { fit: 'cover' })
      .composite([{ input: roundedMask(), blend: 'dest-in' }])
      .png()
      .toBuffer();
  }

  private placeholder(font: opentype.Font, name: string): Promise<Buffer> {
    const initial = this.text(font, name.trim().charAt(0).toUpperCase() || '?', PHOTO_W / 2, PHOTO_H / 2 + 34, 96, PHOTO_W, '#ffffff');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PHOTO_W}" height="${PHOTO_H}"><rect width="${PHOTO_W}" height="${PHOTO_H}" rx="24" fill="#F59E0B"/>${initial}</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  /** Text as a vector path (no system fonts needed), centred on x, shrunk to fit maxWidth */
  private text(font: opentype.Font, value: string, x: number, baseline: number, size: number, maxWidth: number, fill: string): string {
    let s = size;
    while (s > 16 && font.getAdvanceWidth(value, s) > maxWidth) s -= 1;
    let shown = value;
    while (shown.length > 1 && font.getAdvanceWidth(shown, s) > maxWidth) shown = `${shown.slice(0, -2)}…`;
    const w = font.getAdvanceWidth(shown, s);
    const d = font.getPath(shown, x - w / 2, baseline, s).toPathData(1);
    return `<path d="${d}" fill="${fill}"/>`;
  }

  private loadFont(): opentype.Font {
    if (this.font) return this.font;
    const candidates = [
      join(__dirname, '../../../assets/fonts/Poppins-SemiBold.ttf'),
      join(process.cwd(), 'assets/fonts/Poppins-SemiBold.ttf'),
      join(process.cwd(), 'apps/api/assets/fonts/Poppins-SemiBold.ttf'),
    ];
    const file = candidates.find((p) => existsSync(p));
    if (!file) throw new Error('Font file not found');
    const data = readFileSync(file);
    this.font = opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    return this.font;
  }
}

function roundedMask(): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PHOTO_W}" height="${PHOTO_H}"><rect width="${PHOTO_W}" height="${PHOTO_H}" rx="24" fill="#fff"/></svg>`,
  );
}
