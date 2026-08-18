// gloss:file

import { thing } from './thing';

// gloss
// why: hydration order is load-bearing here
@sealed
@logged
export class Widget {
  // gloss
  render() {
    return thing;
  }
}

// gloss
// biome-ignore lint/suspicious/noExplicitAny: fixture
export function tagged(value: any) {
  return value;
}

// gloss
export const config = { retries: 2 };
