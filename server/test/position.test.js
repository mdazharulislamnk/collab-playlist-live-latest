const { calculatePosition } = require('../playlistLogic');

describe('Position Calculation', () => {
  test('should calculate middle position', () => {
    const result = calculatePosition(1.0, 2.0);
    expect(result).toBe(1.5);
  });

  test('should handle first position', () => {
    const result = calculatePosition(null, 1.0);
    expect(result).toBe(0);
  });

  test('should handle last position', () => {
    const result = calculatePosition(3.0, null);
    expect(result).toBe(4.0);
  });

  test('should handle empty list', () => {
    const result = calculatePosition(null, null);
    expect(result).toBe(1.0);
  });
});