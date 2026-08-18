// gloss

export function detached() {}

// gloss
import { unused } from './unused';

// gloss
// gloss
export function stacked() {
  return unused;
}

// gloss
const first = 1,
  second = 2;

// gloss: see ZLT-1
export function annotated() {
  return first + second;
}

export function trailingMarker() {} // gloss

// gloss
