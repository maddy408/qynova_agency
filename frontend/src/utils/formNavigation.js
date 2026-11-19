/**
 * Form Keyboard Navigation Utility for KC Agency
 * 
 * Provides unified, context-aware keyboard navigation across ALL forms and inputs:
 * 
 * 1. Enter Key Behavior:
 *    - In any enabled text, number, date, select, or form field, Enter advances focus
 *      to the next logical form field in natural DOM/tab order.
 *    - At the final field of a form, executes the intended submit/action (respecting HTML5 validity).
 *    - In any enabled text, number, date, select, or form field, Enter advances focus
 *      to the next logical form field in natural DOM/tab order.
 *    - At the final field of a form, executes the intended submit/action (respecting HTML5 validity).
 *    - In <textarea>, Enter advances focus to the next logical field (or primary action button if
 *      final field, without auto-submitting). Shift+Enter preserves newline insertion.
 *    - On buttons, Enter activates the button normally.
 *    - In dropdowns/comboboxes (like CustomerSelect or open select lists), Enter selects the highlighted option.
 *    - Prevents premature submission while entering intermediate data.
 *    - Prevents duplicate submits (debounced and disabled checks).
 * 
 * 2. Arrow Key Behavior:
 *    - Arrow Down: Moves focus to the next logical field or option where appropriate.
 *    - Arrow Up: Moves focus to the previous logical field or option where appropriate.
 *    - Arrow Left / Arrow Right: In text inputs and textareas, preserves native cursor movement
 *      and text selection. Only navigates horizontally between fields when at start/end boundary.
 *    - In <select>, radio groups, and date pickers: preserves native option selection and date cycling.
 *    - In number inputs: preserves digit cursor movement on Left/Right, and preserves native quantity
 *      increment/decrement unless in a tabular grid (data-table-nav="true").
 * 
 * 3. Universal Coverage:
 *    - Supports standard <form> elements, modal dialogs ([role="dialog"], .fixed), cards, and tables.
 *    - Automatically skips disabled, hidden, aria-hidden, and read-only non-editable elements.
 *    - Dynamically queries visible DOM so dynamically added rows are navigated seamlessly.
 *    - Works both via explicit onKeyDown={handleFormKeyDown} and global delegated listener.
 */

let lastSubmitTimestamp = 0;
let isGlobalInitialized = false;

/**
 * Finds the enclosing logical form container for an element:
 * 1. An enclosing <form>
 * 2. An enclosing [role="dialog"], modal container, or card/fieldset
 * 3. An enclosing table
 * 4. An enclosing .card, fieldset, or .fixed overlay
 */
export function getFormContainer(target) {
  if (!target || typeof target.closest !== 'function') return null;

  // 1. Closest explicit <form>
  const form = target.closest('form');
  if (form) return form;

  // 2. Closest modal dialog, card, or marked form container
  const dialog = target.closest('[role="dialog"], .modal-dialog, [data-form-container="true"], .card, fieldset');
  if (dialog) return dialog;

  // 3. Table container (for tabular data entry like PriceAdjustment or line items)
  const table = target.closest('table');
  if (table) return table;

  // 4. Modal overlay fallback
  const overlay = target.closest('.fixed, [data-modal="true"]');
  if (overlay) return overlay;

  // 5. Fallback to main content or parent with inputs
  return target.closest('main') || target.parentElement;
}

/**
 * Returns all enabled, visible, focusable form controls within the container.
 */
export function getFormNavigableElements(container) {
  if (!container) return [];

  const selector = [
    'input:not([type="hidden"]):not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    '[tabindex]:not([tabindex="-1"]):not([disabled])',
  ].join(', ');

  const elements = Array.from(container.querySelectorAll(selector)).filter((el) => {
    if (el.disabled || el.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    if (el.offsetParent === null && !el.closest('.fixed, [role="dialog"]')) {
      return false;
    }
    // Skip read-only inputs/textareas for data entry sequence
    const elTag = el.tagName.toLowerCase();
    if ((elTag === 'input' || elTag === 'textarea') && el.readOnly && !el.getAttribute('data-nav-allow-readonly')) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  return elements;
}

/**
 * Returns the sequence of logical input fields that Enter advances through.
 * Groups radio buttons with the same name so only the checked one (or first one) is included.
 * Excludes standalone buttons so Enter moves between input fields rather than stopping at helper buttons.
 */
export function getLogicalInputElements(container) {
  const elements = getFormNavigableElements(container);
  const seenRadioNames = new Set();
  const logicalInputs = [];

  for (const el of elements) {
    if (el.getAttribute('data-enter-ignore') === 'true') continue;

    const tag = el.tagName.toLowerCase();

    // Buttons are actionable controls, not data-entry fields
    if (tag === 'button') continue;

    // For radio buttons, keep only the checked one (or first one) in each group
    if (tag === 'input' && el.type === 'radio') {
      const name = el.name;
      if (name) {
        if (seenRadioNames.has(name)) continue;
        seenRadioNames.add(name);

        const group = elements.filter(
          (item) => item.tagName?.toLowerCase() === 'input' && item.type === 'radio' && item.name === name
        );
        const checked = group.find((r) => r.checked) || group[0];
        if (checked) logicalInputs.push(checked);
        continue;
      }
    }

    logicalInputs.push(el);
  }

  return logicalInputs;
}

/**
 * 2D Spatial geometric navigation for form controls.
 * Uses bounding rects to determine the closest control in the requested direction.
 */
export function findNextSpatialFormElement(currentEl, container, dir) {
  if (!currentEl || !container) return null;

  // For tabular lists or grids, prefer row-by-row navigation if within a table
  const table = container.closest('table') || (container.tagName.toLowerCase() === 'table' ? container : null);
  if (table && currentEl.closest('tr')) {
    const currentTr = currentEl.closest('tr');
    if (dir === 'ArrowDown' || dir === 'ArrowUp') {
      const rows = Array.from(table.querySelectorAll('tbody tr')).filter((r) => r.offsetParent !== null);
      const curRowIdx = rows.indexOf(currentTr);
      if (curRowIdx !== -1) {
        const targetRow = dir === 'ArrowDown' ? rows[curRowIdx + 1] : rows[curRowIdx - 1];
        if (targetRow) {
          const targetInputs = getLogicalInputElements(targetRow);
          if (targetInputs.length > 0) {
            // Find input at matching horizontal position or matching column
            const curInputs = getLogicalInputElements(currentTr);
            const inputIdx = curInputs.indexOf(currentEl);
            return targetInputs[Math.min(inputIdx >= 0 ? inputIdx : 0, targetInputs.length - 1)];
          }
        }
      }
    }
  }

  const elements = getFormNavigableElements(container);
  if (elements.length <= 1) return null;

  const curRect = currentEl.getBoundingClientRect();
  const cAx = curRect.left + curRect.width / 2;
  const cAy = curRect.top + curRect.height / 2;

  let bestCandidate = null;
  let bestScore = Infinity;

  for (const el of elements) {
    if (el === currentEl) continue;

    const rect = el.getBoundingClientRect();
    const cBx = rect.left + rect.width / 2;
    const cBy = rect.top + rect.height / 2;

    let isValid = false;
    let score = Infinity;

    if (dir === 'ArrowDown') {
      if (cBy > cAy + 4 && rect.bottom > curRect.bottom + 2) {
        isValid = true;
        const dy = Math.max(0, rect.top - curRect.bottom);
        const hOverlap = Math.max(0, Math.min(curRect.right, rect.right) - Math.max(curRect.left, rect.left));
        const dxCenter = Math.abs(cAx - cBx);

        if (hOverlap > 0) {
          score = dy * 1.5 + dxCenter * 0.4;
        } else {
          score = dy * 1.8 + dxCenter * 1.2 + 80;
        }
      }
    } else if (dir === 'ArrowUp') {
      if (cBy < cAy - 4 && rect.top < curRect.top - 2) {
        isValid = true;
        const dy = Math.max(0, curRect.top - rect.bottom);
        const hOverlap = Math.max(0, Math.min(curRect.right, rect.right) - Math.max(curRect.left, rect.left));
        const dxCenter = Math.abs(cAx - cBx);

        if (hOverlap > 0) {
          score = dy * 1.5 + dxCenter * 0.4;
        } else {
          score = dy * 1.8 + dxCenter * 1.2 + 80;
        }
      }
    } else if (dir === 'ArrowRight') {
      if (cBx > cAx + 4 && rect.right > curRect.right + 2) {
        isValid = true;
        const dx = Math.max(0, rect.left - curRect.right);
        const vOverlap = Math.max(0, Math.min(curRect.bottom, rect.bottom) - Math.max(curRect.top, rect.top));
        const dyCenter = Math.abs(cAy - cBy);

        if (vOverlap > 0 || dyCenter < Math.max(curRect.height, rect.height) * 0.8) {
          score = dx * 1.0 + dyCenter * 0.3;
        } else {
          score = dx * 1.5 + dyCenter * 1.8 + 150;
        }
      }
    } else if (dir === 'ArrowLeft') {
      if (cBx < cAx - 4 && rect.left < curRect.left - 2) {
        isValid = true;
        const dx = Math.max(0, curRect.left - rect.right);
        const vOverlap = Math.max(0, Math.min(curRect.bottom, rect.bottom) - Math.max(curRect.top, rect.top));
        const dyCenter = Math.abs(cAy - cBy);

        if (vOverlap > 0 || dyCenter < Math.max(curRect.height, rect.height) * 0.8) {
          score = dx * 1.0 + dyCenter * 0.3;
        } else {
          score = dx * 1.5 + dyCenter * 1.8 + 150;
        }
      }
    }

    if (isValid && score < bestScore) {
      bestScore = score;
      bestCandidate = el;
    }
  }

  return bestCandidate;
}

/**
 * Locates the primary action or submit button in a container.
 */
export function findFormActionButton(container, currentEl) {
  if (!container) return null;

  // 1. Explicit submit button inside container
  const submitBtn = container.querySelector('button[type="submit"], input[type="submit"]');
  if (submitBtn && !submitBtn.disabled && submitBtn.offsetParent !== null) {
    return submitBtn;
  }

  // 2. Action submit button
  const actionBtn = container.querySelector('button[data-action="submit"]');
  if (actionBtn && !actionBtn.disabled && actionBtn.offsetParent !== null) {
    return actionBtn;
  }

  // 3. Primary button
  const primaryBtn = container.querySelector('button.btn-primary');
  if (primaryBtn && !primaryBtn.disabled && primaryBtn.offsetParent !== null) {
    return primaryBtn;
  }

  // 4. Buttons with common action words (excluding cancel/back)
  const semanticBtn = Array.from(container.querySelectorAll('button:not([disabled])')).find((b) => {
    if (b.disabled || b.offsetParent === null) return false;
    const text = b.textContent.trim();
    return /^(save|submit|add|pay|record|create|update|apply|confirm)/i.test(text);
  });
  if (semanticBtn) return semanticBtn;

  // 5. Next focusable button following currentEl in DOM order
  const allNavigable = getFormNavigableElements(container);
  const curIdx = currentEl ? allNavigable.indexOf(currentEl) : -1;
  if (curIdx !== -1) {
    for (let i = curIdx + 1; i < allNavigable.length; i++) {
      const el = allNavigable[i];
      if (el.tagName?.toLowerCase() === 'button' && !el.disabled && el.offsetParent !== null) {
        return el;
      }
    }
  }

  // 6. Any visible enabled non-cancel button in container
  const buttons = Array.from(container.querySelectorAll('button:not([disabled])')).filter(
    (b) => b.offsetParent !== null
  );
  const nonCancel = buttons.find((b) => !/^(cancel|back|close|dismiss)/i.test(b.textContent.trim()));
  return nonCancel || buttons[0] || null;
}

/**
 * Master KeyDown event handler for forms and form controls.
 */
export function handleFormKeyDown(e) {
  // 1. Ignore if event was already handled or prevented
  if (e.defaultPrevented || e._formNavHandled) return;

  // 2. Ignore IME composition
  if (e.isComposing) return;

  // 3. Ignore modifier key combinations (Ctrl, Alt, Meta)
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const target = e.target;
  if (!target) return;

  // Ignore if target explicitly opted out
  if (target.getAttribute('data-enter-ignore') === 'true' || target.getAttribute('data-form-nav-ignore') === 'true') {
    return;
  }

  const tag = target.tagName?.toLowerCase();

  // Only handle form controls
  const isControl =
    tag === 'input' ||
    tag === 'select' ||
    tag === 'textarea' ||
    target.getAttribute('role') === 'combobox';

  if (!isControl) return;

  const container = getFormContainer(target);
  if (!container) return;

  // -------------------------------------------------------------
  // 4. ENTER KEY NAVIGATION
  // -------------------------------------------------------------
  if (e.key === 'Enter') {
    // If target explicitly opted into preserving multiline Enter behavior
    if (
      target.getAttribute('data-enter-preserve') === 'true' ||
      target.getAttribute('data-enter-multiline') === 'true' ||
      target.getAttribute('data-enter-to-next') === 'false'
    ) {
      return;
    }

    // On buttons, native Enter clicks the button
    if (tag === 'button') return;

    // Shift+Enter preserves native multiline insertion in textareas and custom use
    if (e.shiftKey) return;

    // If dropdown/combobox is open, let option selection proceed first
    if (
      target.getAttribute('aria-expanded') === 'true' ||
      target.getAttribute('data-dropdown-open') === 'true' ||
      target.closest('[data-dropdown-open="true"]')
    ) {
      return;
    }

    const logicalInputs = getLogicalInputElements(container);
    if (logicalInputs.length === 0) return;

    let currentIndex = logicalInputs.indexOf(target);
    if (currentIndex === -1 && tag === 'input' && target.type === 'radio' && target.name) {
      currentIndex = logicalInputs.findIndex(
        (item) => item.tagName?.toLowerCase() === 'input' && item.type === 'radio' && item.name === target.name
      );
    }
    if (currentIndex === -1) return;

    const isFinalField = currentIndex === logicalInputs.length - 1;

    if (!isFinalField) {
      // Intermediate field: advance focus to next logical input
      e.preventDefault();
      e.stopPropagation();
      e._formNavHandled = true;

      const nextInput = logicalInputs[currentIndex + 1];
      if (nextInput) {
        nextInput.focus({ preventScroll: true });
        if (
          typeof nextInput.select === 'function' &&
          nextInput.tagName?.toLowerCase() === 'input' &&
          nextInput.type !== 'radio' &&
          nextInput.type !== 'checkbox' &&
          nextInput.type !== 'date'
        ) {
          try {
            nextInput.select();
          } catch (err) {}
        }
        nextInput.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
      return;
    } else {
      // Final field
      // In textarea at final field, do not automatically submit unless explicitly intended
      if (tag === 'textarea') {
        const isExplicitSubmit =
          target.getAttribute('data-enter-submits') === 'true' ||
          container.getAttribute('data-enter-submits') === 'true';

        if (!isExplicitSubmit) {
          // Move focus to next eligible actionable button (e.g. submit / save button)
          const actionBtn = findFormActionButton(container, target);
          if (actionBtn) {
            e.preventDefault();
            e.stopPropagation();
            e._formNavHandled = true;
            actionBtn.focus({ preventScroll: true });
            actionBtn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            return;
          }
          // If no actionable button exists, preserve existing intended behavior without auto-submitting
          return;
        }
      }

      // Execute the container's intended save or submit action
      e.preventDefault();
      e.stopPropagation();
      e._formNavHandled = true;

      // Debounce rapid submits
      const now = Date.now();
      if (now - lastSubmitTimestamp < 400) return;
      lastSubmitTimestamp = now;

      // If container is an actual <form>
      if (container.tagName.toLowerCase() === 'form') {
        if (typeof container.checkValidity === 'function' && !container.noValidate) {
          if (!container.checkValidity()) {
            if (typeof container.reportValidity === 'function') {
              container.reportValidity();
            }
            return;
          }
        }

        const submitBtn = container.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) {
          if (submitBtn.disabled || submitBtn.getAttribute('aria-disabled') === 'true') return;
          if (typeof container.requestSubmit === 'function') {
            container.requestSubmit(submitBtn);
          } else {
            submitBtn.click();
          }
        } else {
          if (typeof container.requestSubmit === 'function') {
            container.requestSubmit();
          } else {
            container.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
        }
        return;
      } else {
        // Non-form container (e.g. modal or card): look for primary action button
        const submitBtn = findFormActionButton(container, target);

        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
        }
        return;
      }
    }
  }

  // -------------------------------------------------------------
  // 5. ARROW KEYS NAVIGATION
  // -------------------------------------------------------------
  if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
    // Preserve Shift+Arrow for text selection
    if (e.shiftKey) return;

    // Controls that REQUIRE native arrow keys:
    // Textarea: multiline cursor navigation
    if (tag === 'textarea') return;

    // Select: native dropdown option cycling
    if (tag === 'select') return;

    // Radio: sequential form field navigation with arrow keys
    if (tag === 'input' && target.type === 'radio') {
      const navigable = getFormNavigableElements(container);
      const currentIndex = navigable.indexOf(target);
      if (currentIndex === -1) {
        e.preventDefault();
        return;
      }

      const isForward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
      const targetIndex = isForward ? currentIndex + 1 : currentIndex - 1;

      if (targetIndex >= 0 && targetIndex < navigable.length) {
        const nextField = navigable[targetIndex];
        e.preventDefault();
        e.stopPropagation();
        e._formNavHandled = true;

        nextField.focus({ preventScroll: true });
        if (
          typeof nextField.select === 'function' &&
          nextField.tagName?.toLowerCase() === 'input' &&
          nextField.type !== 'radio' &&
          nextField.type !== 'checkbox' &&
          nextField.type !== 'date'
        ) {
          try {
            nextField.select();
          } catch (err) {}
        }
        nextField.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      } else {
        // Prevent default browser radio group cycling/wrapping at form boundary
        e.preventDefault();
        e.stopPropagation();
        e._formNavHandled = true;
      }
      return;
    }

    // Date / time / color pickers: native segment cycling
    if (
      tag === 'input' &&
      ['date', 'time', 'datetime-local', 'month', 'week', 'color', 'range'].includes(target.type)
    ) {
      return;
    }

    // Dropdown / Combobox active list
    if (
      target.getAttribute('role') === 'combobox' ||
      target.getAttribute('aria-expanded') === 'true' ||
      target.getAttribute('aria-autocomplete')
    ) {
      return;
    }

    const isTextInput =
      tag === 'input' &&
      ['text', 'search', 'password', 'email', 'url', 'tel'].includes(target.type || 'text');
    const isNumberInput = tag === 'input' && target.type === 'number';

    if (isTextInput) {
      let hasSelection = false;
      let isAtStart = false;
      let isAtEnd = false;

      try {
        if (typeof target.selectionStart === 'number') {
          hasSelection = target.selectionStart !== target.selectionEnd;
          isAtStart = target.selectionStart === 0;
          isAtEnd = target.selectionEnd === (target.value?.length || 0);
        }
      } catch (err) {}

      // If user has selected text, keep native text manipulation
      if (hasSelection) return;

      if (e.key === 'ArrowLeft') {
        // Only navigate horizontally if cursor is at the very beginning of the field
        if (!isAtStart) return;
      } else if (e.key === 'ArrowRight') {
        // Only navigate horizontally if cursor is at the very end of the field
        if (!isAtEnd) return;
      }
      // ArrowUp and ArrowDown in single line text input navigate vertically between fields
    } else if (isNumberInput) {
      // In number inputs, ArrowLeft and ArrowRight move cursor between digits
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        return;
      }
      // If standalone number input, preserve native quantity/step increment
      // UNLESS in a tabular data entry grid where ArrowUp/Down navigates rows
      const isTableGrid = target.getAttribute('data-table-nav') === 'true' || target.closest('table') !== null;
      if (!isTableGrid) {
        return;
      }
    }

    const nextEl = findNextSpatialFormElement(target, container, e.key);
    if (nextEl) {
      e.preventDefault();
      e.stopPropagation();
      e._formNavHandled = true;
      nextEl.focus({ preventScroll: true });
      if (
        typeof nextEl.select === 'function' &&
        nextEl.tagName?.toLowerCase() === 'input' &&
        nextEl.type !== 'radio' &&
        nextEl.type !== 'checkbox' &&
        nextEl.type !== 'date'
      ) {
        try {
          nextEl.select();
        } catch (err) {}
      }
      nextEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }
}

/**
 * Initializes global delegated keyboard navigation on window.
 * Ensures every form and input across the app automatically supports Enter/Arrow navigation.
 */
export function initGlobalFormNavigation() {
  if (typeof window === 'undefined' || isGlobalInitialized) return;
  isGlobalInitialized = true;

  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e._formNavHandled) return;

    const target = e.target;
    if (!target) return;

    const tag = target.tagName?.toLowerCase();
    const isControl =
      tag === 'input' ||
      tag === 'select' ||
      tag === 'textarea' ||
      target.getAttribute('role') === 'combobox';

    if (!isControl) return;

    handleFormKeyDown(e);
  }, { capture: false });
}
