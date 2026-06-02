/**
 * ============================================================================
 * LeanPrompts Studio - Drag Select Auto-Scroll Helper
 * @author       Ivica Vrgoc
 * @license      AGPL-3.0
 * ============================================================================
 * Prevents browser selection stall when dragging mouse outside native textareas.
 * Clean, lightweight, and completely layout-neutral.
 */

export function enableDragSelectScroll(element) {
  if (!element || element.dataset.lpDragScroll === 'true') return;
  element.dataset.lpDragScroll = 'true'; // Prevent duplicate binding

  let isMouseDown = false;
  let scrollInterval = null;

  const handleMouseDown = (e) => {
    // Only trigger on left-click
    if (e.button !== 0) return;
    isMouseDown = true;

    const handleMouseMove = (moveEvent) => {
      if (!isMouseDown) return;
      const rect = element.getBoundingClientRect();
      const mouseY = moveEvent.clientY;

      // Reset existing interval to re-evaluate speed
      if (scrollInterval) {
        clearInterval(scrollInterval);
        scrollInterval = null;
      }

      if (mouseY < rect.top) {
        // Mouse is ABOVE the textarea -> scroll up proportional to distance
        const distance = rect.top - mouseY;
        const speed = Math.min(30, distance * 0.4); // Bound max speed
        scrollInterval = setInterval(() => {
          element.scrollTop -= speed;
        }, 16); // ~60fps
      } else if (mouseY > rect.bottom) {
        // Mouse is BELOW the textarea -> scroll down proportional to distance
        const distance = mouseY - rect.bottom;
        const speed = Math.min(30, distance * 0.4);
        scrollInterval = setInterval(() => {
          element.scrollTop += speed;
        }, 16);
      }
    };

    const handleMouseUp = () => {
      isMouseDown = false;
      if (scrollInterval) {
        clearInterval(scrollInterval);
        scrollInterval = null;
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  element.addEventListener('mousedown', handleMouseDown);
}
