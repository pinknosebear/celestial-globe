/**
 * Events — event listener setup and cleanup.
 */

export interface EventHandlers {
  handleMouseMove: (e: Event) => void;
  handleTouchMove: (e: Event) => void;
  handleMouseDown: () => void;
  handleWheel: () => void;
  handleResize: () => void;
}

/**
 * Create event handlers that reference provided callbacks.
 */
export function createEventHandlers(
  onMouseMove: (clientX: number, clientY: number) => void,
  onTouchMove: (clientX: number, clientY: number) => void,
  onMouseDown: () => void,
  onWheel: () => void,
  onResize: () => void
): EventHandlers {
  return {
    handleMouseMove: (e: Event) => {
      const me = e as MouseEvent;
      onMouseMove(me.clientX, me.clientY);
    },
    handleTouchMove: (e: Event) => {
      const te = e as TouchEvent;
      if (te.touches.length > 0) {
        onTouchMove(te.touches[0].clientX, te.touches[0].clientY);
      }
    },
    handleMouseDown: () => {
      onMouseDown();
    },
    handleWheel: () => {
      onWheel();
    },
    handleResize: () => {
      onResize();
    },
  };
}

/**
 * Attach event listeners.
 */
export function attachEventListeners(
  handlers: EventHandlers,
  canvas: HTMLCanvasElement
): void {
  window.addEventListener('mousemove', handlers.handleMouseMove);
  window.addEventListener('touchmove', handlers.handleTouchMove, { passive: true } as EventListenerOptions);
  canvas.addEventListener('mousedown', handlers.handleMouseDown);
  canvas.addEventListener('wheel', handlers.handleWheel, { passive: true } as EventListenerOptions);
  window.addEventListener('resize', handlers.handleResize);
}

/**
 * Detach event listeners.
 */
export function detachEventListeners(
  handlers: EventHandlers,
  canvas: HTMLCanvasElement
): void {
  window.removeEventListener('mousemove', handlers.handleMouseMove);
  window.removeEventListener('touchmove', handlers.handleTouchMove);
  canvas.removeEventListener('mousedown', handlers.handleMouseDown);
  canvas.removeEventListener('wheel', handlers.handleWheel);
  window.removeEventListener('resize', handlers.handleResize);
}
