import { describe, it, expect } from 'vitest';
import { calculatePosition } from '../src/position';

describe('Position Calculation', () => {
  it('should calculate middle position', () => {
    expect(calculatePosition(1.0, 2.0)).toBe(1.5);
  });

  it('should handle first position', () => {
    expect(calculatePosition(null, 1.0)).toBe(0);
  });

  it('should handle last position', () => {
    expect(calculatePosition(3.0, null)).toBe(4);
  });

  it('should handle empty list', () => {
    expect(calculatePosition(null, null)).toBe(1.0);
  });
});