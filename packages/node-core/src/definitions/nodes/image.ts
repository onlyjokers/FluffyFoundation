/**
 * Purpose: Image modulation node definitions.
 */
import qrcode from 'qrcode-generator';
import type { NodeDefinition } from '../../types.js';
import { coerceNumber } from '../utils.js';

// Helper to parse and merge image URL hash parameters
function mergeImageHashParam(baseRef: string, key: string, value: string | number): string {
  if (!baseRef) return '';
  const hashIndex = baseRef.indexOf('#');
  if (hashIndex < 0) {
    return `${baseRef}#${key}=${value}`;
  }
  const base = baseRef.slice(0, hashIndex);
  const params = new URLSearchParams(baseRef.slice(hashIndex + 1));
  params.set(key, String(value));
  return `${base}#${params.toString()}`;
}

function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createUrlToQrGeneratorNode(): NodeDefinition {
  return {
    type: 'url-to-qr-generator',
    label: 'URL to QR Generator',
    category: 'Image',
    inputs: [{ id: 'url', label: 'URL', type: 'string' }],
    outputs: [{ id: 'image', label: 'Image Out', type: 'image' }],
    configSchema: [],
    process: (inputs) => {
      const url = typeof inputs.url === 'string' ? inputs.url.trim() : '';
      if (!url) return { image: '' };

      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      return { image: toSvgDataUrl(qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true })) };
    },
  };
}

// Image Scale modulation node
export function createImgScaleNode(): NodeDefinition {
  return {
    type: 'img-scale',
    label: 'Img Scale',
    category: 'Image',
    inputs: [
      { id: 'in', label: 'In', type: 'image' },
      {
        id: 'scale',
        label: 'Scale',
        type: 'number',
        defaultValue: 1,
        min: 0.1,
        max: 10,
        step: 0.1,
      },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'image' }],
    configSchema: [
      {
        key: 'scale',
        label: 'Scale',
        type: 'number',
        defaultValue: 1,
        min: 0.1,
        max: 10,
        step: 0.1,
      },
    ],
    process: (inputs, config) => {
      const inRef = typeof inputs.in === 'string' ? inputs.in.trim() : '';
      if (!inRef) return { out: '' };
      const scaleRaw =
        typeof inputs.scale === 'number' ? inputs.scale : coerceNumber(config.scale, 1);
      const scale = Math.max(0.1, Math.min(10, scaleRaw));
      return { out: mergeImageHashParam(inRef, 'scale', Math.round(scale * 100) / 100) };
    },
  };
}

// Image Fit modulation node
export function createImgFitNode(): NodeDefinition {
  return {
    type: 'img-fit',
    label: 'Img Fit',
    category: 'Image',
    inputs: [{ id: 'in', label: 'In', type: 'image' }],
    outputs: [{ id: 'out', label: 'Out', type: 'image' }],
    configSchema: [
      {
        key: 'fit',
        label: 'Fit',
        type: 'select',
        defaultValue: 'contain',
        options: [
          { value: 'contain', label: 'Contain' },
          { value: 'fit-screen', label: 'Fit Screen' },
          { value: 'cover', label: 'Cover' },
          { value: 'fill', label: 'Fill' },
        ],
        connectable: true,
      },
    ],
    process: (inputs, config) => {
      const inRef = typeof inputs.in === 'string' ? inputs.in.trim() : '';
      if (!inRef) return { out: '' };
      const fitRaw =
        typeof inputs.fit === 'string' && inputs.fit.trim()
          ? inputs.fit.trim().toLowerCase()
          : typeof config.fit === 'string'
            ? config.fit.trim().toLowerCase()
            : '';
      const fit =
        fitRaw === 'cover' || fitRaw === 'fill' || fitRaw === 'fit-screen' ? fitRaw : 'contain';
      return { out: mergeImageHashParam(inRef, 'fit', fit) };
    },
  };
}

// Image XY Offset modulation node
export function createImgXYOffsetNode(): NodeDefinition {
  return {
    type: 'img-xy-offset',
    label: 'Img XY Offset',
    category: 'Image',
    inputs: [
      { id: 'in', label: 'In', type: 'image' },
      { id: 'offsetX', label: 'Offset X', type: 'number', defaultValue: 0, step: 1 },
      { id: 'offsetY', label: 'Offset Y', type: 'number', defaultValue: 0, step: 1 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'image' }],
    configSchema: [
      { key: 'offsetX', label: 'Offset X (px)', type: 'number', defaultValue: 0, step: 1 },
      { key: 'offsetY', label: 'Offset Y (px)', type: 'number', defaultValue: 0, step: 1 },
    ],
    process: (inputs, config) => {
      const inRef = typeof inputs.in === 'string' ? inputs.in.trim() : '';
      if (!inRef) return { out: '' };
      const offsetX =
        typeof inputs.offsetX === 'number' ? inputs.offsetX : coerceNumber(config.offsetX, 0);
      const offsetY =
        typeof inputs.offsetY === 'number' ? inputs.offsetY : coerceNumber(config.offsetY, 0);
      let ref = mergeImageHashParam(inRef, 'offsetX', Math.round(offsetX));
      ref = mergeImageHashParam(ref, 'offsetY', Math.round(offsetY));
      return { out: ref };
    },
  };
}

// Image Transparency modulation node
export function createImgTransparencyNode(): NodeDefinition {
  return {
    type: 'img-transparency',
    label: 'Img Transparency',
    category: 'Image',
    inputs: [
      { id: 'in', label: 'In', type: 'image' },
      {
        id: 'opacity',
        label: 'Opacity',
        type: 'number',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'image' }],
    configSchema: [
      {
        key: 'opacity',
        label: 'Opacity',
        type: 'number',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
    process: (inputs, config) => {
      const inRef = typeof inputs.in === 'string' ? inputs.in.trim() : '';
      if (!inRef) return { out: '' };
      const opacityRaw =
        typeof inputs.opacity === 'number' ? inputs.opacity : coerceNumber(config.opacity, 1);
      const opacity = Math.max(0, Math.min(1, opacityRaw));
      return { out: mergeImageHashParam(inRef, 'opacity', Math.round(opacity * 100) / 100) };
    },
  };
}
