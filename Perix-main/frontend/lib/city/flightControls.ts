/** Use KeyboardEvent.code: actual Up/Down arrows replace the numeric pad.
 * Up = nose down (old 2); Down = nose up (old 8).
 * No handler is installed outside the flight scene.
 */
export function flightSpeedKey(code: string): number {
  return code === 'KeyW' ? 1 : code === 'KeyS' ? -1 : 0;
}
export function isFlightKey(code: string): boolean {
  return ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(code);
}
export function flightHeldKeys(held: ReadonlySet<string>) {
  return {
    climb: Number(held.has('ArrowDown')) - Number(held.has('ArrowUp')),
    turn: Number(held.has('KeyD') || held.has('ArrowRight')) - Number(held.has('KeyA') || held.has('ArrowLeft')),
  };
}

/** Local pointer position -> spring-centered joystick axes. Up is positive Y.
 * Each joystick owns one pointer, so speed and steering support two thumbs.
 */
export function flightJoystickAxes(clientX: number, clientY: number,
  box: { left: number; top: number; width: number; height: number }, vertical = false) {
  if (![clientX, clientY, box.left, box.top, box.width, box.height].every(Number.isFinite)
    || box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  const radius = Math.max(1, Math.min(box.width, box.height) * 0.32);
  let x = vertical ? 0 : (clientX - box.left - box.width / 2) / radius;
  let y = (box.top + box.height / 2 - clientY) / radius;
  const length = Math.hypot(x, y);
  if (length <= 0.1) return { x: 0, y: 0 };
  const magnitude = (Math.min(1, length) - 0.1) / 0.9;
  x = x / length * magnitude; y = y / length * magnitude;
  return { x, y };
}
