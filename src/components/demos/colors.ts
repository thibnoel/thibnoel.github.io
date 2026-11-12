export type Rgb = [number, number, number];

/** Resolves a CSS color (including custom properties) to RGB components. */
export function resolveColor(root: HTMLElement, variable: string): Rgb {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.fillStyle = getComputedStyle(root).getPropertyValue(variable).trim() || '#000';
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

export const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
