// Shared utilities for image <-> PDF pages
export const PAGE_SIZES = {
  A4: { w: 595.28, h: 841.89 },
  Letter: { w: 612, h: 792 },
};

export function mmToPoints(mm) {
  return (mm / 25.4) * 72;
}
