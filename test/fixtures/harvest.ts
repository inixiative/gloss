export function compute(total: number) {
  // this note lives inside the body
  return total * 2;
}

// this note sits above the declaration
export const rate = 0.5;

const seed = 1; // trailing note on a code line

console.log(seed);
// stray note between statements
console.log(rate);
