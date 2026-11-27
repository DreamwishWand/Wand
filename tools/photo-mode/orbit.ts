export const fullTurn = 2 * Math.PI;
export function wrapYaw(radians: number): number {
  if (!Number.isFinite(radians)) throw new RangeError('Invalid orbit angle');
  return ((radians % fullTurn) + fullTurn) % fullTurn;
}
export function dragYaw(yaw: number, deltaX: number, viewportWidth: number): number {
  if (!Number.isFinite(deltaX) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) throw new RangeError('Invalid orbit drag');
  return wrapYaw(yaw + fullTurn * deltaX / viewportWidth);
}
