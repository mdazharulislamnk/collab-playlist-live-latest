export function calculatePosition(prevPosition, nextPosition) {
  if (prevPosition == null && nextPosition == null) return 1.0;
  if (prevPosition == null) return nextPosition - 1;
  if (nextPosition == null) return prevPosition + 1;
  return (prevPosition + nextPosition) / 2;
}