/**
 * Purpose: ASCII post-processing effect rendering helpers.
 */

export type AsciiEffectRuntime = {
  tinyCanvas: HTMLCanvasElement;
  tinyCtx: CanvasRenderingContext2D | null;
};

export type AsciiEffectResult = {
  cols: number;
  rows: number;
};

export function applyAsciiEffect(
  runtime: AsciiEffectRuntime,
  src: HTMLCanvasElement,
  dstCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  effect: { cellSize: number }
): AsciiEffectResult | null {
  const { tinyCanvas, tinyCtx } = runtime;
  if (!tinyCtx || !tinyCanvas) return null;

  const cellSize = Math.max(1, Math.min(100, Math.round(Number(effect.cellSize))));
  const cols = Math.max(24, Math.floor(width / cellSize));
  const rows = Math.max(18, Math.floor(height / (cellSize * 1.05)));

  if (tinyCanvas.width !== cols) tinyCanvas.width = cols;
  if (tinyCanvas.height !== rows) tinyCanvas.height = rows;

  try {
    tinyCtx.drawImage(src, 0, 0, cols, rows);
  } catch {
    // Cross-origin or invalid source; skip this frame
    return null;
  }

  let data: Uint8ClampedArray;
  try {
    data = tinyCtx.getImageData(0, 0, cols, rows).data;
  } catch {
    // Canvas tainted (likely cross-origin media without CORS)
    return null;
  }

  dstCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dstCtx.fillStyle = '#0a0a0f';
  dstCtx.fillRect(0, 0, width, height);
  dstCtx.textAlign = 'center';
  dstCtx.textBaseline = 'middle';
  const fontSize = Math.max(9, Math.round(height / rows));
  dstCtx.font = `${fontSize}px "IBM Plex Mono", "SFMono-Regular", "Menlo", monospace`;

  const ramp = ['.', '`', ',', ':', ';', '-', '~', '+', '*', 'x', 'o', 'O', '%', '#', '@'];
  const strokes = ['/', '\\', '|', '-', '='];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = (y * cols + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3] / 255;
      if (a === 0) continue;

      const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (brightness < 0.08) continue; // deep black stays empty

      const posX = (x + 0.5) * (width / cols);
      const posY = (y + 0.5) * (height / rows);

      // bright -> solid block
      if (brightness >= 0.82) {
        dstCtx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.94)`;
        dstCtx.fillRect(
          posX - width / cols / 2,
          posY - height / rows / 2,
          width / cols + 0.75,
          height / rows + 0.75
        );
        continue;
      }

      const glyphIndex =
        brightness > 0.62
          ? Math.floor((x + y) % strokes.length)
          : Math.min(ramp.length - 1, Math.floor(brightness * ramp.length));
      const glyph = brightness > 0.62 ? strokes[glyphIndex] : ramp[glyphIndex];

      const alpha = 0.35 + brightness * 0.55;
      dstCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha)})`;
      dstCtx.fillText(glyph, posX, posY);
    }
  }

  return { cols, rows };
}

export function drawAsciiBorder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cols: number,
  rows: number,
  edgeColor = 'rgba(255, 228, 210, 0.55)'
): void {
  ctx.fillStyle = edgeColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const charW = width / cols;
  const charH = height / rows;
  ctx.font = `${Math.max(10, Math.round(charH * 0.95))}px "IBM Plex Mono", "SFMono-Regular", "Menlo", monospace`;

  const topChars = ['=', '-', '='];
  const sideChars = ['|', '!', '|'];

  for (let c = 0; c < cols; c++) {
    const ch = topChars[c % topChars.length];
    const x = c * charW + charW / 2;
    ctx.fillText(ch, x, charH * 0.55);
    ctx.fillText(ch, x, height - charH * 0.45);
  }

  for (let r = 0; r < rows; r++) {
    const ch = sideChars[r % sideChars.length];
    const y = r * charH + charH / 2;
    ctx.fillText(ch, charW * 0.45, y);
    ctx.fillText(ch, width - charW * 0.45, y);
  }

  ctx.fillText('+', charW * 0.45, charH * 0.55);
  ctx.fillText('+', width - charW * 0.45, charH * 0.55);
  ctx.fillText('+', charW * 0.45, height - charH * 0.45);
  ctx.fillText('+', width - charW * 0.45, height - charH * 0.45);
}
