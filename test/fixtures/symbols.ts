import { helper } from './helper';

export * from './helper';
export { helper as aliased } from './helper';

export function overloaded(input: string): string;
export function overloaded(input: number): string;
export function overloaded(input: string | number): string {
  return String(input);
}

export interface Shape {
  size: number;
}

export type Alias = Shape | string;

export enum Level {
  Low,
  High,
}

export const settings = { verbose: true };

let mutable = 1;

export class Alpha {
  run() {
    return helper();
  }

  send = () => 'alpha';
}

export class Beta {
  run() {
    return mutable;
  }
}
