import React from 'react';

export function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement | HTMLDivElement>) {
  if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
    const active = document.activeElement as HTMLElement;
    if (!active) return;

    if (active.tagName === 'TEXTAREA') return;

    // Only handle if currently focused on an input, button, or select
    if (['INPUT', 'BUTTON', 'SELECT'].includes(active.tagName)) {
      // Find focusable elements WITHIN the current form/container
      const focusableElements = 'input:not([disabled]):not([type="hidden"]), button:not([disabled]), select:not([disabled]), textarea:not([disabled])';
      
      const elements = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(focusableElements)).filter(el => {
        return el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).visibility !== 'hidden';
      });
      
      const index = elements.indexOf(active);
      if (index > -1) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          if (e.key === 'Enter' && active.tagName === 'BUTTON') {
            // Let the button click normally
            return;
          }
          if (index < elements.length - 1) {
            e.preventDefault();
            elements[index + 1].focus();
          }
        } else if (e.key === 'ArrowUp') {
          if (index > 0) {
            e.preventDefault();
            elements[index - 1].focus();
          }
        }
      }
    }
  }
}
