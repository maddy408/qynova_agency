import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listItems } from '../api/items';
import { listParties, getParty } from '../api/parties';
import { listPaymentMethods } from '../api/payments';
import { createBill, listHeldBills, holdBill, deleteHeldBill } from '../api/bills';
import { formatINR, todayISO } from '../utils/format';
import QuickSale from './QuickSale';

const emptyCart = () => ({
  locationType: 'local',
  billType: 'normal',
  partyId: '',
  walkinName: '',
  billDate: todayISO(),
  lines: [],
  discountPercent: '',
  discountAmount: 0,
  commissionMode: 'percentage',
  commissionPercent: 10,
  commissionAmount: 0,
  patthu: 0,
  cooli: 0,
  vadagai: 0,
  otherDeduction: 0,
  paidAmount: 0,
  paymentMethodId: '',
  notes: '',
});

export default function Billing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentMode = searchParams.get('mode') === 'quick' ? 'quick' : 'standard';

  const [items, setItems] = useState([]);
  const [parties, setParties] = useState([]);
  const [methods, setMethods] = useState([]);
  const [cart, setCart] = useState(emptyCart());
  const [previousBalance, setPreviousBalance] = useState(0);
  const [isPaidManuallyEdited, setIsPaidManuallyEdited] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldBills, setHeldBills] = useState([]);
  const [saving, setSaving] = useState(false);

  const codeRef = useRef(null);
  const partyRef = useRef(null);
  const walkinRef = useRef(null);
  const dateRef = useRef(null);
  const billTypeRef = useRef(null);
  const locationRef = useRef(null);
  const discountPercentRef = useRef(null);
  const discountAmountRef = useRef(null);
  const commissionInputRef = useRef(null);
  const patthuRef = useRef(null);
  const cooliRef = useRef(null);
  const vadagaiRef = useRef(null);
  const otherDeductionRef = useRef(null);
  const paidAmountRef = useRef(null);
  const paymentMethodRef = useRef(null);
  const notesRef = useRef(null);
  const holdBtnRef = useRef(null);
  const saveBtnRef = useRef(null);
  const savePrintBtnRef = useRef(null);
  const pendingFocusRef = useRef(null);

  function focusTableCell(row, col, subIdx = 0) {
    let el = null;
    if (col === 2) {
      el = document.querySelector(`[data-row="${row}"][data-col="2"][data-sub="${subIdx}"]`);
      if (!el) {
        const allBagInputs = document.querySelectorAll(`[data-row="${row}"][data-col="2"]`);
        if (allBagInputs.length > 0) {
          el = allBagInputs[Math.min(subIdx, allBagInputs.length - 1)];
        }
      }
    } else {
      el = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    }
    if (el && el.disabled) {
      el = document.querySelector(`[data-row="${row}"][data-col="1"]`) || document.querySelector(`[data-row="${row}"][data-col="0"]`);
    }
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
  }

  function focusCodeInput() {
    if (codeRef.current) {
      codeRef.current.focus();
      codeRef.current.select();
    }
  }

  function isAtStart(el) {
    if (!el) return true;
    try {
      if (el.selectionStart !== undefined && el.selectionEnd !== undefined) {
        return el.selectionStart === 0 && (el.selectionEnd === 0 || el.selectionEnd === (el.value || '').length);
      }
    } catch {
      return true;
    }
    return true;
  }

  function isAtEnd(el) {
    if (!el) return true;
    try {
      if (el.selectionStart !== undefined && el.selectionEnd !== undefined) {
        const len = (el.value || '').length;
        return (el.selectionStart === len && el.selectionEnd === len) || (el.selectionStart === 0 && el.selectionEnd === len);
      }
    } catch {
      return true;
    }
    return true;
  }

  function shouldBackspaceNavigate(el) {
    if (!el) return true;
    const val = el.value ?? '';
    if (val === '' || val === 0 || val === '0') return true;
    try {
      if (el.selectionStart !== undefined && el.selectionEnd !== undefined) {
        return el.selectionStart === 0 && el.selectionEnd === 0;
      }
    } catch {
      return false;
    }
    return false;
  }

  useEffect(() => {
    listItems({ active_only: '1' }).then(setItems);
    listParties().then(setParties);
    listPaymentMethods().then((m) => {
      setMethods(m);
      const def = m.find((x) => x.is_default) || m[0];
      if (def) setCart((c) => ({ ...c, paymentMethodId: def.id }));
    });
    setTimeout(() => codeRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (pendingFocusRef.current) {
      const { row, field, subIdx = 0, select } = pendingFocusRef.current;
      const timer = setTimeout(() => {
        let el = null;
        if (field === 'weight') {
          el = document.querySelector(`[data-row="${row}"][data-col="2"][data-sub="${subIdx}"]`);
          if (!el) {
            const allBagInputs = document.querySelectorAll(`[data-row="${row}"][data-col="2"]`);
            if (allBagInputs.length > 0) {
              el = allBagInputs[Math.min(subIdx, allBagInputs.length - 1)];
            }
          }
        } else {
          el = document.querySelector(`[data-row="${row}"][data-field="${field}"]`);
        }
        if (el) {
          el.focus();
          if (select && el.select) el.select();
        }
        pendingFocusRef.current = null;
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [cart.lines]);

  useEffect(() => {
    if (!cart.partyId) {
      setPreviousBalance(0);
      return;
    }
    getParty(cart.partyId).then((p) => setPreviousBalance(Number(p.balance || 0)));
  }, [cart.partyId]);

  function addItemByCode(rawInput) {
    if (!rawInput || !rawInput.trim()) return;
    const trimmed = rawInput.trim();

    let parsedCode = trimmed;
    let customQty = null;

    // Check for patterns like "L 1.5" or "L*1.5" or "1.5 L" or "1.5*L" or "P.BOX 2"
    const suffixMatch = trimmed.match(/^([a-zA-Z0-9.]+)[\s*xX]+([0-9]+(?:\.[0-9]+)?)$/);
    const prefixMatch = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)[\s*xX]+([a-zA-Z0-9.]+)$/);

    if (suffixMatch) {
      parsedCode = suffixMatch[1];
      customQty = parseFloat(suffixMatch[2]);
    } else if (prefixMatch) {
      customQty = parseFloat(prefixMatch[1]);
      parsedCode = prefixMatch[2];
    }

    const raw = parsedCode.trim().toLowerCase();
    const clean = raw.replace(/[^a-z0-9]/g, '');
    const match = items.find((i) => {
      const icode = (i.code || '').toLowerCase();
      return icode === raw || icode.replace(/[^a-z0-9]/g, '') === clean;
    });
    if (!match) return;

    const existingIdx = cart.lines.findIndex((l) => l.item_id === match.id);
    const targetRow = existingIdx >= 0 ? existingIdx : cart.lines.length;
    pendingFocusRef.current = {
      row: targetRow,
      field: match.is_charge_item ? 'nos' : 'weight',
      subIdx: 0,
      select: true,
    };

    setCart((c) => {
      if (existingIdx >= 0) {
        // Item already in cart: increment quantity, do NOT add duplicate line
        const updatedLines = [...c.lines];
        const existing = updatedLines[existingIdx];
        const addQty = customQty !== null && customQty > 0 ? customQty : 1;

        if (existing.is_charge_item) {
          const curNos = parseFloat(existing.nos) || 0;
          updatedLines[existingIdx] = {
            ...existing,
            nos: Math.round((curNos + addQty) * 100) / 100,
          };
        } else {
          const curWeight = parseFloat(existing.weight) || 0;
          const newWeight = curWeight <= 0 ? addQty : Math.round((curWeight + addQty) * 1000) / 1000;
          const currentBags = Array.isArray(existing.bag_weights) && existing.bag_weights.length > 0
            ? [...existing.bag_weights]
            : [existing.weight || addQty];
          if (currentBags.length === 1) {
            currentBags[0] = newWeight;
          }
          updatedLines[existingIdx] = {
            ...existing,
            weight: newWeight,
            bag_weights: currentBags,
          };
        }

        return { ...c, lines: updatedLines };
      }

      // First time adding this item: default quantity = 1 (or customQty if provided)
      const initialQty = customQty !== null && customQty > 0 ? customQty : 1;
      return {
        ...c,
        lines: [
          ...c.lines,
          {
            key: Date.now() + Math.random(),
            item_id: match.id,
            item_name_ta: match.name_ta,
            item_name_en: match.name_en,
            unit: match.unit || 'kg',
            is_charge_item: !!match.is_charge_item,
            rate: match.default_rate !== null && match.default_rate !== undefined ? Number(match.default_rate) : 0,
            nos: match.is_charge_item ? initialQty : '',
            bag_count: '',
            weight: match.is_charge_item ? 0 : initialQty,
            bag_weights: match.is_charge_item ? [] : [initialQty],
          },
        ],
      };
    });

    setCodeInput('');
  }

  function handleNosChange(key, newNosVal) {
    if (newNosVal !== '' && !/^\d*$/.test(newNosVal)) return;

    setCart((c) => ({
      ...c,
      lines: c.lines.map((l) => {
        if (l.key !== key) return l;
        if (l.is_charge_item) {
          return { ...l, nos: newNosVal };
        }
        const bagCount = parseInt(newNosVal, 10);
        const targetCount = !isNaN(bagCount) && bagCount > 0 ? bagCount : 1;
        const currentWeights = Array.isArray(l.bag_weights) && l.bag_weights.length > 0
          ? [...l.bag_weights]
          : [l.weight || ''];

        const newWeights = [];
        for (let i = 0; i < targetCount; i++) {
          newWeights.push(i < currentWeights.length ? currentWeights[i] : '');
        }

        const totalWeight = newWeights.reduce((sum, w) => sum + (parseFloat(w) || 0), 0);
        const roundedWeight = Math.round(totalWeight * 1000) / 1000;

        return {
          ...l,
          nos: newNosVal,
          bag_count: !isNaN(bagCount) && bagCount > 0 ? bagCount : null,
          bag_weights: newWeights,
          weight: roundedWeight > 0 ? roundedWeight : (newWeights.every((w) => w === '' || w === 0) ? '' : roundedWeight),
        };
      }),
    }));
  }

  function handleBagWeightChange(key, bagIdx, newWeightVal) {
    if (newWeightVal !== '' && !/^\d*\.?\d*$/.test(newWeightVal)) return;

    setCart((c) => ({
      ...c,
      lines: c.lines.map((l) => {
        if (l.key !== key) return l;
        const bagCount = parseInt(l.nos, 10);
        const targetCount = !isNaN(bagCount) && bagCount > 0 ? bagCount : 1;
        const currentWeights = Array.isArray(l.bag_weights) && l.bag_weights.length > 0
          ? [...l.bag_weights]
          : [l.weight || ''];

        while (currentWeights.length < targetCount) {
          currentWeights.push('');
        }
        currentWeights[bagIdx] = newWeightVal;

        const totalWeight = currentWeights.reduce((sum, w) => sum + (parseFloat(w) || 0), 0);
        const roundedWeight = Math.round(totalWeight * 1000) / 1000;

        return {
          ...l,
          bag_weights: currentWeights,
          weight: roundedWeight > 0 ? roundedWeight : (currentWeights.every((w) => w === '' || w === 0) ? '' : roundedWeight),
        };
      }),
    }));
  }

  function updateLine(key, field, value) {
    setCart((c) => ({
      ...c,
      lines: c.lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
    }));
  }

  function removeLine(key) {
    setCart((c) => ({ ...c, lines: c.lines.filter((l) => l.key !== key) }));
  }

  function handleTableKeyDown(e, row, col, field, subIdx = 0) {
    const line = cart.lines[row];
    if (!line) return;

    const bagCount = parseInt(line.nos, 10);
    const weightCount = (!isNaN(bagCount) && bagCount > 0)
      ? bagCount
      : (Array.isArray(line.bag_weights) && line.bag_weights.length > 0 ? line.bag_weights.length : 1);

    // 1. Enter Key
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'rate') {
        focusTableCell(row, 1);
      } else if (field === 'nos') {
        if (line.is_charge_item) {
          focusCodeInput();
        } else {
          focusTableCell(row, 2, 0);
        }
      } else if (field === 'weight') {
        if (subIdx < weightCount - 1) {
          focusTableCell(row, 2, subIdx + 1);
        } else {
          focusCodeInput();
        }
      } else if (field === 'delete') {
        removeLine(line.key);
        focusCodeInput();
      }
      return;
    }

    // 2. Up Arrow: Move to row above (same column and subIdx)
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (row > 0) {
        focusTableCell(row - 1, col, subIdx);
      } else {
        focusCodeInput();
      }
      return;
    }

    // 3. Down Arrow: Move to row below (same column and subIdx)
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (row < cart.lines.length - 1) {
        focusTableCell(row + 1, col, subIdx);
      } else if (cart.billType === 'commission') {
        commissionInputRef.current?.focus();
        commissionInputRef.current?.select();
      } else {
        paidAmountRef.current?.focus();
        paidAmountRef.current?.select();
      }
      return;
    }

    // 4. Left Arrow: Move to left input field
    if (e.key === 'ArrowLeft') {
      if (col === 3) {
        e.preventDefault();
        if (line.is_charge_item) {
          focusTableCell(row, 1);
        } else {
          focusTableCell(row, 2, weightCount - 1);
        }
      } else if (col === 2 && isAtStart(e.target)) {
        e.preventDefault();
        if (subIdx > 0) {
          focusTableCell(row, 2, subIdx - 1);
        } else {
          focusTableCell(row, 1);
        }
      } else if (col === 1 && isAtStart(e.target)) {
        e.preventDefault();
        focusTableCell(row, 0);
      } else if (col === 0 && isAtStart(e.target)) {
        e.preventDefault();
        if (row > 0) {
          const prevLine = cart.lines[row - 1];
          const prevBags = parseInt(prevLine.nos, 10);
          const prevCount = (!isNaN(prevBags) && prevBags > 0) ? prevBags : (prevLine.bag_weights?.length || 1);
          focusTableCell(row - 1, prevLine.is_charge_item ? 1 : 2, prevLine.is_charge_item ? 0 : prevCount - 1);
        } else {
          focusCodeInput();
        }
      }
      return;
    }

    // 5. Right Arrow: Move to right input field
    if (e.key === 'ArrowRight') {
      if (col === 0 && isAtEnd(e.target)) {
        e.preventDefault();
        focusTableCell(row, 1);
      } else if (col === 1 && isAtEnd(e.target)) {
        e.preventDefault();
        if (line.is_charge_item) {
          focusTableCell(row, 3);
        } else {
          focusTableCell(row, 2, 0);
        }
      } else if (col === 2 && isAtEnd(e.target)) {
        e.preventDefault();
        if (subIdx < weightCount - 1) {
          focusTableCell(row, 2, subIdx + 1);
        } else {
          focusTableCell(row, 3);
        }
      } else if (col === 3) {
        e.preventDefault();
        if (row < cart.lines.length - 1) {
          focusTableCell(row + 1, 0);
        } else if (cart.billType === 'commission') {
          commissionInputRef.current?.focus();
          commissionInputRef.current?.select();
        } else {
          paidAmountRef.current?.focus();
          paidAmountRef.current?.select();
        }
      }
      return;
    }

    // 6. Backspace Key: Return to previous field when empty or at start
    if (e.key === 'Backspace') {
      if (shouldBackspaceNavigate(e.target)) {
        e.preventDefault();
        if (col === 2) {
          if (subIdx > 0) {
            focusTableCell(row, 2, subIdx - 1);
          } else {
            focusTableCell(row, line.nos ? 1 : 0);
          }
        } else if (col === 1) {
          focusTableCell(row, 0);
        } else if (col === 0) {
          focusCodeInput();
        }
      }
      return;
    }
  }

  function handleCodeKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (codeInput.trim()) {
        addItemByCode(codeInput);
      } else if (cart.lines.length > 0) {
        if (cart.billType === 'commission') {
          commissionInputRef.current?.focus();
          commissionInputRef.current?.select();
        } else {
          paidAmountRef.current?.focus();
          paidAmountRef.current?.select();
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cart.lines.length > 0) {
        const firstLine = cart.lines[0];
        focusTableCell(0, firstLine.is_charge_item ? 1 : 2);
      } else if (cart.billType === 'commission') {
        commissionInputRef.current?.focus();
        commissionInputRef.current?.select();
      } else {
        paidAmountRef.current?.focus();
        paidAmountRef.current?.select();
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!cart.partyId && walkinRef.current) {
        walkinRef.current.focus();
        walkinRef.current.select();
      } else if (partyRef.current) {
        partyRef.current.focus();
      }
      return;
    }

    if (e.key === 'Backspace' && !codeInput && cart.lines.length > 0) {
      e.preventDefault();
      const lastRow = cart.lines.length - 1;
      const lastLine = cart.lines[lastRow];
      focusTableCell(lastRow, lastLine.is_charge_item ? 1 : 2);
      return;
    }
  }

  function handleWalkinKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusCodeInput();
      return;
    }
    if (e.key === 'ArrowLeft' && isAtStart(e.target)) {
      e.preventDefault();
      partyRef.current?.focus();
      return;
    }
  }

  function handlePartyKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!cart.partyId && walkinRef.current) {
        walkinRef.current.focus();
        walkinRef.current.select();
      } else {
        focusCodeInput();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusCodeInput();
      return;
    }
    if (e.key === 'ArrowRight') {
      if (!cart.partyId && walkinRef.current) {
        e.preventDefault();
        walkinRef.current.focus();
        walkinRef.current.select();
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      dateRef.current?.focus();
      return;
    }
  }

  function handleDateKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      partyRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      billTypeRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusCodeInput();
      return;
    }
  }

  function handleBillTypeKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      dateRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      locationRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusCodeInput();
      return;
    }
  }

  function handleLocationKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      billTypeRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusCodeInput();
      return;
    }
  }

  function handleDiscountPercentKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (cart.discountPercent === '' && discountAmountRef.current) {
        discountAmountRef.current.focus();
        discountAmountRef.current.select();
      } else {
        paidAmountRef.current?.focus();
        paidAmountRef.current?.select();
      }
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (cart.discountPercent === '' && discountAmountRef.current) {
        discountAmountRef.current.focus();
        discountAmountRef.current.select();
      } else {
        paidAmountRef.current?.focus();
        paidAmountRef.current?.select();
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cart.lines.length > 0) {
        const lastRow = cart.lines.length - 1;
        const lastLine = cart.lines[lastRow];
        focusTableCell(lastRow, lastLine.is_charge_item ? 1 : 2);
      } else {
        focusCodeInput();
      }
      return;
    }
    if (e.key === 'Backspace' && shouldBackspaceNavigate(e.target)) {
      e.preventDefault();
      if (cart.lines.length > 0) {
        const lastRow = cart.lines.length - 1;
        const lastLine = cart.lines[lastRow];
        focusTableCell(lastRow, lastLine.is_charge_item ? 1 : 2);
      } else {
        focusCodeInput();
      }
      return;
    }
  }

  function handleDiscountAmountKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      paidAmountRef.current?.focus();
      paidAmountRef.current?.select();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      discountPercentRef.current?.focus();
      discountPercentRef.current?.select();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cart.lines.length > 0) {
        const lastRow = cart.lines.length - 1;
        const lastLine = cart.lines[lastRow];
        focusTableCell(lastRow, lastLine.is_charge_item ? 1 : 2);
      } else {
        focusCodeInput();
      }
      return;
    }
    if (e.key === 'Backspace' && shouldBackspaceNavigate(e.target)) {
      e.preventDefault();
      discountPercentRef.current?.focus();
      discountPercentRef.current?.select();
      return;
    }
  }

  function handleCommissionKeyDown(e) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cart.lines.length > 0) {
        const lastRow = cart.lines.length - 1;
        const lastLine = cart.lines[lastRow];
        focusTableCell(lastRow, lastLine.is_charge_item ? 1 : 2);
      } else {
        focusCodeInput();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      patthuRef.current?.focus();
      patthuRef.current?.select();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      paidAmountRef.current?.focus();
      paidAmountRef.current?.select();
      return;
    }
    if (e.key === 'Backspace' && shouldBackspaceNavigate(e.target)) {
      e.preventDefault();
      if (cart.lines.length > 0) {
        const lastRow = cart.lines.length - 1;
        const lastLine = cart.lines[lastRow];
        focusTableCell(lastRow, lastLine.is_charge_item ? 1 : 2);
      } else {
        focusCodeInput();
      }
      return;
    }
  }

  function handlePatthuKeyDown(e) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      commissionInputRef.current?.focus();
      commissionInputRef.current?.select();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      cooliRef.current?.focus();
      cooliRef.current?.select();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      paidAmountRef.current?.focus();
      paidAmountRef.current?.select();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      commissionInputRef.current?.focus();
      commissionInputRef.current?.select();
      return;
    }
    if (e.key === 'Backspace' && shouldBackspaceNavigate(e.target)) {
      e.preventDefault();
      commissionInputRef.current?.focus();
      commissionInputRef.current?.select();
      return;
    }
  }

  function handleCooliKeyDown(e) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      patthuRef.current?.focus();
      patthuRef.current?.select();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      vadagaiRef.current?.focus();
      vadagaiRef.current?.select();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      paymentMethodRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      patthuRef.current?.focus();
      patthuRef.current?.select();
      return;
    }
    if (e.key === 'Backspace' && shouldBackspaceNavigate(e.target)) {
      e.preventDefault();
      patthuRef.current?.focus();
      patthuRef.current?.select();
      return;
    }
  }

  function handleVadagaiKeyDown(e) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      cooliRef.current?.focus();
      cooliRef.current?.select();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      otherDeductionRef.current?.focus();
      otherDeductionRef.current?.select();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      paymentMethodRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      cooliRef.current?.focus();
      cooliRef.current?.select();
      return;
    }
    if (e.key === 'Backspace' && shouldBackspaceNavigate(e.target)) {
      e.preventDefault();
      cooliRef.current?.focus();
      cooliRef.current?.select();
      return;
    }
  }

  function handleOtherDeductionKeyDown(e) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      vadagaiRef.current?.focus();
      vadagaiRef.current?.select();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      if (cart.billType === 'commission') {
        notesRef.current?.focus();
        notesRef.current?.select();
      } else {
        paidAmountRef.current?.focus();
        paidAmountRef.current?.select();
      }
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      notesRef.current?.focus() || paymentMethodRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      vadagaiRef.current?.focus();
      vadagaiRef.current?.select();
      return;
    }
    if (e.key === 'Backspace' && shouldBackspaceNavigate(e.target)) {
      e.preventDefault();
      vadagaiRef.current?.focus();
      vadagaiRef.current?.select();
      return;
    }
  }

  function handlePaidAmountKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      paymentMethodRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cart.billType === 'commission') {
        otherDeductionRef.current?.focus();
        otherDeductionRef.current?.select();
      } else if (discountAmountRef.current && cart.discountPercent === '') {
        discountAmountRef.current.focus();
        discountAmountRef.current.select();
      } else if (discountPercentRef.current) {
        discountPercentRef.current.focus();
        discountPercentRef.current.select();
      } else if (cart.lines.length > 0) {
        const lastRow = cart.lines.length - 1;
        const lastLine = cart.lines[lastRow];
        focusTableCell(lastRow, lastLine.is_charge_item ? 1 : 2);
      } else {
        focusCodeInput();
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (cart.billType === 'commission') {
        if (patthuRef.current) {
          patthuRef.current.focus();
          patthuRef.current.select();
        } else if (commissionInputRef.current) {
          commissionInputRef.current.focus();
          commissionInputRef.current.select();
        }
      } else if (discountAmountRef.current && cart.discountPercent === '') {
        discountAmountRef.current.focus();
        discountAmountRef.current.select();
      } else if (discountPercentRef.current) {
        discountPercentRef.current.focus();
        discountPercentRef.current.select();
      }
      return;
    }
    if (e.key === 'Backspace' && shouldBackspaceNavigate(e.target)) {
      e.preventDefault();
      if (cart.billType === 'commission') {
        otherDeductionRef.current?.focus();
        otherDeductionRef.current?.select();
      } else if (discountAmountRef.current && cart.discountPercent === '') {
        discountAmountRef.current.focus();
        discountAmountRef.current.select();
      } else if (discountPercentRef.current) {
        discountPercentRef.current.focus();
        discountPercentRef.current.select();
      } else if (cart.lines.length > 0) {
        const lastRow = cart.lines.length - 1;
        const lastLine = cart.lines[lastRow];
        focusTableCell(lastRow, lastLine.is_charge_item ? 1 : 2);
      } else {
        focusCodeInput();
      }
      return;
    }
  }

  function handlePaymentMethodKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      savePrintBtnRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (methods && methods.length > 0) {
        const currentIndex = methods.findIndex((m) => String(m.id) === String(cart.paymentMethodId));
        const nextIndex = currentIndex < methods.length - 1 ? currentIndex + 1 : 0;
        handlePaymentMethodChange(methods[nextIndex].id);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (methods && methods.length > 0) {
        const currentIndex = methods.findIndex((m) => String(m.id) === String(cart.paymentMethodId));
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : methods.length - 1;
        handlePaymentMethodChange(methods[prevIndex].id);
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (cart.billType === 'commission') {
        if (cooliRef.current) {
          cooliRef.current.focus();
          cooliRef.current.select();
        } else if (vadagaiRef.current) {
          vadagaiRef.current.focus();
          vadagaiRef.current.select();
        } else if (patthuRef.current) {
          patthuRef.current.focus();
          patthuRef.current.select();
        }
      } else {
        if (discountAmountRef.current && cart.discountPercent === '') {
          discountAmountRef.current.focus();
          discountAmountRef.current.select();
        } else if (discountPercentRef.current) {
          discountPercentRef.current.focus();
          discountPercentRef.current.select();
        } else {
          paidAmountRef.current?.focus();
          paidAmountRef.current?.select();
        }
      }
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      notesRef.current?.focus();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      paidAmountRef.current?.focus();
      paidAmountRef.current?.select();
      return;
    }
  }

  function handleNotesKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      savePrintBtnRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cart.billType === 'commission') {
        otherDeductionRef.current?.focus();
        otherDeductionRef.current?.select();
      } else {
        paymentMethodRef.current?.focus();
      }
      return;
    }
    if (e.key === 'ArrowRight' && (isAtEnd(e.target) || !cart.notes)) {
      e.preventDefault();
      savePrintBtnRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowLeft' && (isAtStart(e.target) || !cart.notes)) {
      e.preventDefault();
      if (cart.billType === 'commission') {
        if (otherDeductionRef.current) {
          otherDeductionRef.current.focus();
          otherDeductionRef.current.select();
        } else if (vadagaiRef.current) {
          vadagaiRef.current.focus();
          vadagaiRef.current.select();
        }
      } else {
        if (discountAmountRef.current && cart.discountPercent === '') {
          discountAmountRef.current.focus();
          discountAmountRef.current.select();
        } else if (discountPercentRef.current) {
          discountPercentRef.current.focus();
          discountPercentRef.current.select();
        }
      }
      return;
    }
    if (e.key === 'Backspace' && shouldBackspaceNavigate(e.target)) {
      e.preventDefault();
      if (cart.billType === 'commission') {
        otherDeductionRef.current?.focus();
        otherDeductionRef.current?.select();
      } else {
        paymentMethodRef.current?.focus();
      }
      return;
    }
  }

  function handleButtonKeyDown(e, btnName) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      notesRef.current?.focus() || paymentMethodRef.current?.focus() || paidAmountRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (btnName === 'savePrint') saveBtnRef.current?.focus();
      else if (btnName === 'save') holdBtnRef.current?.focus();
      else if (btnName === 'hold') {
        if (cart.billType === 'commission') {
          notesRef.current?.focus();
        } else {
          if (discountAmountRef.current && cart.discountPercent === '') {
            discountAmountRef.current.focus();
            discountAmountRef.current.select();
          } else if (discountPercentRef.current) {
            discountPercentRef.current.focus();
            discountPercentRef.current.select();
          }
        }
      }
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (btnName === 'hold') saveBtnRef.current?.focus();
      else if (btnName === 'save') savePrintBtnRef.current?.focus();
      return;
    }
  }

  function lineAmount(l) {
    const rate = Number(l.rate) || 0;
    return l.is_charge_item ? rate * (Number(l.nos) || 0) : rate * (Number(l.weight) || 0);
  }

  const itemsTotal = cart.lines.reduce((s, l) => s + lineAmount(l), 0);

  let discountAmount = 0;
  if (cart.discountPercent !== '' && cart.discountPercent !== null) {
    discountAmount = (itemsTotal * Number(cart.discountPercent)) / 100;
  } else {
    discountAmount = Number(cart.discountAmount) || 0;
  }

  const grossTotal = itemsTotal;
  const isFixedCommission = cart.commissionMode === 'fixed';
  const commissionAmount = isFixedCommission
    ? Number(cart.commissionAmount) || 0
    : (grossTotal * (Number(cart.commissionPercent) || 0)) / 100;
  const otherDeduction = Number(cart.otherDeduction) || 0;
  const totalDeductions = commissionAmount + (Number(cart.patthu) || 0) + (Number(cart.cooli) || 0) + (Number(cart.vadagai) || 0) + otherDeduction;
  const netTotal = grossTotal - totalDeductions;
  const deductionsExceedSales = totalDeductions > grossTotal + 0.009;

  const todayTotal = itemsTotal - discountAmount;
  const isCommission = cart.billType === 'commission';
  const currentBillTotal = isCommission ? netTotal : todayTotal;

  // Positive previousBalance = customer owes shop credit.
  // Negative previousBalance = shop owes customer (advance / supplier balance).
  const oldCreditBalance = Number(previousBalance) || 0;
  const grandTotal = currentBillTotal + Math.max(0, oldCreditBalance);

  const paid = Number(cart.paidAmount) || 0;
  const currentBillDue = Math.max(0, currentBillTotal - paid);
  const excessPaidOverBill = Math.max(0, paid - currentBillTotal);

  // Credit adjustment logic:
  const creditDeduction = oldCreditBalance > 0 ? Math.min(oldCreditBalance, excessPaidOverBill) : 0;
  const remainingOldCredit = oldCreditBalance > 0 ? oldCreditBalance - creditDeduction : 0;
  const changeToReturn = excessPaidOverBill - creditDeduction;

  // Total balance of party after this bill:
  const newPartyBalance = oldCreditBalance + (currentBillTotal - paid);
  const canSave = !isCommission || !deductionsExceedSales;

  // Auto-sync paidAmount with full currentBillTotal for cash/regular payment unless user manually edited or chose credit
  useEffect(() => {
    if (!isPaidManuallyEdited) {
      const selected = methods.find((m) => m.id == cart.paymentMethodId);
      const isCredit = selected?.name_ta === 'கடன்' || selected?.name_en?.toLowerCase() === 'credit';
      const target = isCredit ? 0 : (currentBillTotal > 0 ? currentBillTotal : 0);
      setCart((c) => {
        if (Number(c.paidAmount) === Number(target)) return c;
        return { ...c, paidAmount: target };
      });
    }
  }, [currentBillTotal, isPaidManuallyEdited, cart.paymentMethodId, methods]);

  function handlePaymentMethodChange(methodId) {
    const selected = methods.find((m) => m.id == methodId);
    const isCredit = selected?.name_ta === 'கடன்' || selected?.name_en?.toLowerCase() === 'credit';
    setCart((c) => ({
      ...c,
      paymentMethodId: methodId,
      paidAmount: isCredit ? 0 : (currentBillTotal > 0 ? currentBillTotal : 0),
    }));
    setIsPaidManuallyEdited(isCredit);
  }

  function buildPayload() {
    return {
      location_type: cart.locationType,
      bill_type: cart.billType,
      party_id: cart.partyId || null,
      walkin_name: cart.partyId ? null : cart.walkinName || null,
      bill_date: cart.billDate,
      lines: cart.lines.map((l) => {
        const bagWeights = Array.isArray(l.bag_weights)
          ? l.bag_weights
              .map((w) => (w !== '' && w !== null && !isNaN(Number(w)) ? Number(w) : null))
              .filter((w) => w !== null && w > 0)
          : null;
        return {
          item_id: l.item_id,
          item_name_ta: l.item_name_ta,
          item_name_en: l.item_name_en,
          unit: l.unit,
          is_charge_item: l.is_charge_item,
          rate: Number(l.rate) || 0,
          nos: Number(l.nos) || (bagWeights && bagWeights.length > 0 ? bagWeights.length : 0),
          bag_count: l.nos !== '' && l.nos !== null && l.nos !== undefined
            ? Number(l.nos)
            : (bagWeights && bagWeights.length > 0 ? bagWeights.length : null),
          bag_weights: bagWeights && bagWeights.length > 0 ? bagWeights : null,
          weight: Number(l.weight) || 0,
          amount: lineAmount(l),
        };
      }),
      discount_percent: cart.discountPercent === '' ? null : Number(cart.discountPercent),
      discount_amount: discountAmount,
      previous_balance: previousBalance,
      commission_percent: isCommission && !isFixedCommission ? Number(cart.commissionPercent) : null,
      commission_mode: cart.commissionMode,
      commission_amount: isCommission ? commissionAmount : 0,
      patthu_amount: isCommission ? Number(cart.patthu) || 0 : 0,
      cooli_amount: isCommission ? Number(cart.cooli) || 0 : 0,
      vadagai_amount: isCommission ? Number(cart.vadagai) || 0 : 0,
      other_deduction_amount: isCommission ? otherDeduction : 0,
      paid_amount: paid,
      payment_method_id: cart.paymentMethodId || null,
      notes: cart.notes || null,
    };
  }

  async function handleSave(andPrint = true) {
    if (!canSave) return;
    setSaving(true);
    try {
      const bill = await createBill(buildPayload());
      resetCart();
      navigate(`/print/bill/${bill.id}`);
    } catch (err) {
      alert(err?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleHold() {
    if (cart.lines.length === 0) return;
    const label = cart.partyId ? parties.find((p) => p.id === Number(cart.partyId))?.name : cart.walkinName || 'Walk-in';
    await holdBill({
      label,
      cart_json: JSON.stringify(cart),
      location_type: cart.locationType,
      bill_type: cart.billType,
      party_id: cart.partyId || null,
    });
    resetCart();
  }

  function resetCart() {
    setIsPaidManuallyEdited(false);
    setCart(emptyCart());
    const def = methods.find((x) => x.is_default) || methods[0];
    if (def) setCart((c) => ({ ...c, paymentMethodId: def.id }));
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  async function openHeld() {
    const list = await listHeldBills();
    setHeldBills(list);
    setHeldOpen(true);
  }

  function resumeHeld(row) {
    try {
      const parsed = typeof row.cart_json === 'string' ? JSON.parse(row.cart_json) : row.cart_json;
      setCart(parsed);
      setHeldOpen(false);
      deleteHeldBill(row.id);
    } catch (e) {
      alert('Could not restore bill');
    }
  }

  async function removeHeld(id) {
    await deleteHeldBill(id);
    setHeldBills((rows) => rows.filter((r) => r.id !== id));
  }

  useEffect(() => {
    if (currentMode === 'quick') return;
    function onKey(e) {
      if (e.key === 'F2') {
        e.preventDefault();
        handleHold();
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleSave(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, currentMode]);

  return (
    <div className="w-full space-y-1.5 select-none text-slate-800 pb-10">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between pb-1 border-b border-gray-200">
        <div className="inline-flex p-0.5 bg-gray-200/80 rounded-md border border-gray-300">
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className={`px-3 py-1 rounded text-xs font-bold transition-all ${
              currentMode !== 'quick'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('nav.billing')}
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ mode: 'quick' })}
            className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
              currentMode === 'quick'
                ? 'bg-blue-900 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>⚡</span>
            <span>{t('nav.quick_sale')}</span>
          </button>
        </div>

        {currentMode !== 'quick' && (
          <div className="flex items-center gap-1.5">
            <button
              className="btn-secondary h-7 py-0.5 px-3 text-xs font-semibold rounded"
              onClick={openHeld}
            >
              {t('billing.held_bills')}
            </button>
            <button
              className="btn-secondary h-7 py-0.5 px-3 text-xs font-semibold rounded bg-slate-800 text-white hover:bg-slate-900"
              onClick={resetCart}
            >
              + {t('billing.new_bill')}
            </button>
          </div>
        )}
      </div>

      {currentMode === 'quick' ? (
        <QuickSale embedded />
      ) : (
        <>
          {/* 1. BILLING DETAILS Card */}
          <div className="bg-white rounded-lg border border-gray-200/90 p-2.5 space-y-1.5 shadow-xs">
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-700">
              BILLING DETAILS
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 items-end">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">LOCATION</label>
                <select
                  ref={locationRef}
                  className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white font-medium focus:ring-1 focus:ring-blue-600"
                  value={cart.locationType}
                  onChange={(e) => setCart({ ...cart, locationType: e.target.value })}
                  onKeyDown={handleLocationKeyDown}
                >
                  <option value="local">{t('billing.location_local')}</option>
                  <option value="distant">{t('billing.location_distant')}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">TYPE</label>
                <select
                  ref={billTypeRef}
                  className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white font-medium focus:ring-1 focus:ring-blue-600"
                  value={cart.billType}
                  onChange={(e) => setCart({ ...cart, billType: e.target.value })}
                  onKeyDown={handleBillTypeKeyDown}
                >
                  <option value="normal">{t('billing.type_normal')}</option>
                  <option value="commission">{t('billing.type_commission')}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">{t('common.date')}</label>
                <input
                  ref={dateRef}
                  type="date"
                  className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white font-medium focus:ring-1 focus:ring-blue-600"
                  value={cart.billDate}
                  onChange={(e) => setCart({ ...cart, billDate: e.target.value })}
                  onKeyDown={handleDateKeyDown}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">{t('billing.select_party')}</label>
                <select
                  ref={partyRef}
                  className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white font-medium focus:ring-1 focus:ring-blue-600"
                  value={cart.partyId}
                  onChange={(e) => setCart({ ...cart, partyId: e.target.value })}
                  onKeyDown={handlePartyKeyDown}
                >
                  <option value="">{t('common.walkin')}</option>
                  {parties
                    .filter((p) => (isCommission ? p.type !== 'customer' : true))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>

              {!cart.partyId ? (
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">WALK-IN NAME</label>
                  <input
                    ref={walkinRef}
                    className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white font-medium focus:ring-1 focus:ring-blue-600"
                    placeholder={t('common.walkin') + ' ' + t('common.name')}
                    value={cart.walkinName}
                    onChange={(e) => setCart({ ...cart, walkinName: e.target.value })}
                    onKeyDown={handleWalkinKeyDown}
                  />
                </div>
              ) : (
                <div className="text-xs text-gray-600 flex items-center h-7 font-medium">
                  <span>{t('billing.previous_balance')}: <strong className="text-slate-900 font-mono ml-1">{formatINR(previousBalance)}</strong></span>
                </div>
              )}
            </div>

            {/* Code Search Input Bar (Prominent Height & Quick Typing) */}
            <div className="relative flex items-center py-1">
              <input
                ref={codeRef}
                className="w-full h-11 sm:h-12 pl-11 pr-28 text-sm sm:text-base font-mono font-black uppercase rounded-lg border-2 border-emerald-600/80 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100 bg-emerald-50/20 text-slate-900 placeholder-slate-400 shadow-xs transition-all"
                placeholder="Enter Item Shortcut (e.g. A..Z, L, L 1.5) & Press Enter"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={handleCodeKeyDown}
              />
              <span className="absolute left-3.5 text-emerald-600 font-black text-xl pointer-events-none select-none">+</span>
              <span className="absolute right-3 text-[11px] font-bold text-gray-500 bg-white/90 border border-gray-300 px-2 py-1 rounded shadow-2xs pointer-events-none">
                Enter ↵
              </span>
            </div>
          </div>

          {/* 2. Items Lines Table (Scrollable within container, smooth scroll) */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto overflow-y-auto max-h-[220px]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-gray-200 z-10">
                  <tr className="text-[10.5px] uppercase font-bold text-slate-600">
                    <th className="py-1 px-2 text-left">{t('billing.item')}</th>
                    <th className="py-1 px-2 text-right w-24">{t('billing.rate')}</th>
                    <th className="py-1 px-2 text-center w-20">{t('billing.nos')}</th>
                    <th className="py-1 px-2 text-right min-w-[130px]">{t('billing.qty')}</th>
                    <th className="py-1 px-2 text-right w-28">{t('billing.amount')}</th>
                    <th className="py-1 px-1.5 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {cart.lines.map((l, lineIdx) => {
                    const bagCount = parseInt(l.nos, 10);
                    const bagCountValid = !isNaN(bagCount) && bagCount > 0;
                    const count = bagCountValid ? bagCount : 1;
                    const weights = [];
                    for (let i = 0; i < count; i++) {
                      weights.push(
                        l.bag_weights && l.bag_weights[i] !== undefined
                          ? l.bag_weights[i]
                          : (i === 0 ? (l.weight ?? '') : '')
                      );
                    }

                    return (
                      <tr key={l.key} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-1 px-2 text-slate-800 font-semibold text-xs">
                          {l.item_name_ta} {l.item_name_en && <span className="text-gray-400 font-normal text-[11px]">({l.item_name_en})</span>}
                        </td>
                        <td className="py-1 px-2 text-right">
                          <input
                            data-row={lineIdx}
                            data-col={0}
                            data-field="rate"
                            className="w-20 h-6.5 px-1.5 text-xs text-right font-mono border border-gray-300 rounded focus:ring-1 focus:ring-blue-600"
                            type="text"
                            inputMode="decimal"
                            value={l.rate}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                updateLine(l.key, 'rate', val);
                              }
                            }}
                            onKeyDown={(e) => handleTableKeyDown(e, lineIdx, 0, 'rate')}
                          />
                        </td>
                        <td className="py-1 px-2 text-center">
                          <input
                            data-row={lineIdx}
                            data-col={1}
                            data-field="nos"
                            className="w-16 h-6.5 px-1 text-xs text-center font-mono border border-gray-300 rounded focus:ring-1 focus:ring-blue-600"
                            type="text"
                            inputMode="numeric"
                            value={l.nos === 0 || l.nos === '0' ? '' : (l.nos ?? '')}
                            onChange={(e) => handleNosChange(l.key, e.target.value)}
                            onKeyDown={(e) => handleTableKeyDown(e, lineIdx, 1, 'nos')}
                          />
                        </td>
                        <td className="py-1 px-2 text-right">
                          {l.is_charge_item ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                data-row={lineIdx}
                                data-col={2}
                                data-sub={0}
                                data-field="weight"
                                className="w-16 h-6.5 px-1 text-xs text-center font-mono border border-gray-200 rounded bg-gray-50 text-gray-400"
                                type="text"
                                disabled
                                value="—"
                              />
                            </div>
                          ) : count > 1 ? (
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              {weights.map((wVal, bagIdx) => (
                                <div key={bagIdx} className="flex items-center gap-0.5">
                                  <input
                                    data-row={lineIdx}
                                    data-col={2}
                                    data-sub={bagIdx}
                                    data-field="weight"
                                    aria-label={`Pai ${bagIdx + 1} weight`}
                                    placeholder={`P${bagIdx + 1}`}
                                    className="w-14 h-6.5 px-1 text-xs text-right font-mono font-semibold border border-gray-300 rounded focus:ring-1 focus:ring-blue-600 bg-white"
                                    type="text"
                                    inputMode="decimal"
                                    value={wVal ?? ''}
                                    onChange={(e) => handleBagWeightChange(l.key, bagIdx, e.target.value)}
                                    onKeyDown={(e) => handleTableKeyDown(e, lineIdx, 2, 'weight', bagIdx)}
                                  />
                                  {bagIdx < count - 1 && (
                                    <span className="text-[11px] font-bold text-gray-400 select-none">+</span>
                                  )}
                                </div>
                              ))}
                              <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 whitespace-nowrap select-none ml-1">
                                = {l.weight || 0} {l.unit || 'kg'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                data-row={lineIdx}
                                data-col={2}
                                data-sub={0}
                                data-field="weight"
                                className="w-20 h-6.5 px-1.5 text-xs text-right font-mono font-semibold border border-gray-300 rounded focus:ring-1 focus:ring-blue-600"
                                type="text"
                                inputMode="decimal"
                                value={weights[0] ?? ''}
                                onChange={(e) => handleBagWeightChange(l.key, 0, e.target.value)}
                                onKeyDown={(e) => handleTableKeyDown(e, lineIdx, 2, 'weight', 0)}
                              />
                              {!l.is_charge_item && <span className="text-[10px] text-gray-500 font-mono w-5 text-left">{l.unit || 'kg'}</span>}
                            </div>
                          )}
                        </td>
                        <td className="py-1 px-2 text-right font-bold font-mono text-slate-900 text-xs">
                          {formatINR(lineAmount(l))}
                        </td>
                        <td className="py-1 px-1.5 text-center">
                          <button
                            data-row={lineIdx}
                            data-col={3}
                            data-field="delete"
                            className="text-red-500 hover:text-red-700 font-bold text-xs"
                            onClick={() => removeLine(l.key)}
                            onKeyDown={(e) => handleTableKeyDown(e, lineIdx, 3, 'delete')}
                            title="Remove item"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {cart.lines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-400 py-3 text-xs italic">
                        — No items added. Enter code above to add items —
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Bottom Section: Normal Bill (2 Columns) vs Commission Bill (Single Centered Card, No Payment Panel) */}
          {!isCommission ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
              {/* Left: BILLING SUMMARY */}
              <div className="bg-white rounded-lg border border-gray-200 p-2 space-y-1 shadow-xs">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 pb-0.5 border-b border-gray-100 flex justify-between items-center">
                  <span>BILLING SUMMARY</span>
                  <span className="font-mono text-xs text-slate-600 font-bold">{cart.lines.length} items</span>
                </div>

                <Row label={t('billing.items_total')} value={formatINR(itemsTotal)} />

                <div className="flex items-center justify-between py-0.5 text-xs">
                  <label className="text-gray-600 text-xs mb-0">{t('billing.discount')}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={discountPercentRef}
                      className="w-16 h-6 px-1.5 text-xs rounded border border-gray-300 text-right font-mono focus:ring-1 focus:ring-blue-600"
                      type="text"
                      inputMode="decimal"
                      placeholder="%"
                      value={cart.discountPercent}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setCart({ ...cart, discountPercent: val });
                        }
                      }}
                      onKeyDown={handleDiscountPercentKeyDown}
                    />
                    <input
                      ref={discountAmountRef}
                      className="w-24 h-6 px-1.5 text-xs rounded border border-gray-300 text-right font-mono focus:ring-1 focus:ring-blue-600"
                      type="text"
                      inputMode="decimal"
                      placeholder="₹"
                      disabled={cart.discountPercent !== ''}
                      value={cart.discountPercent !== '' ? discountAmount.toFixed(2) : cart.discountAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setCart({ ...cart, discountAmount: val });
                        }
                      }}
                      onKeyDown={handleDiscountAmountKeyDown}
                    />
                  </div>
                </div>

                {oldCreditBalance > 0 && (
                  <Row label="பழைய கடன் பாக்கி (Old Credit)" value={formatINR(oldCreditBalance)} />
                )}
                {oldCreditBalance < 0 && (
                  <Row label="முன் அட்வான்ஸ் இருப்பு (Advance)" value={formatINR(Math.abs(oldCreditBalance))} />
                )}

                {/* Bill Total Navy Bar */}
                <div className="bg-[#0a1733] text-white px-3 py-1 rounded-md flex items-center justify-between font-black text-xs mt-1">
                  <span className="tracking-wide">இன்றைய பில் மொத்தம் (BILL TOTAL)</span>
                  <span className="font-mono text-sm tracking-tight">{formatINR(currentBillTotal)}</span>
                </div>
                {oldCreditBalance > 0 && (
                  <div className="flex justify-between items-center text-[11px] text-gray-500 font-bold px-1 pt-0.5">
                    <span>மொத்த கணக்கு (Total with Old Credit):</span>
                    <span className="font-mono text-slate-800">{formatINR(oldCreditBalance + currentBillTotal)}</span>
                  </div>
                )}
              </div>

              {/* Right: PAYMENT */}
              <div className="bg-white rounded-lg border border-gray-200 p-2 space-y-1 shadow-xs">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 pb-0.5 border-b border-gray-100">
                  PAYMENT
                </div>

                <div className="flex items-center justify-between py-0.5 text-xs">
                  <label className="text-gray-600 text-xs mb-0 font-medium">{t('billing.paid_amount')}</label>
                  <div className="flex items-center gap-1">
                    <input
                      ref={paidAmountRef}
                      className="w-24 h-6 px-1.5 text-xs text-right font-mono font-bold rounded border border-gray-300 focus:ring-1 focus:ring-blue-600"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={cart.paidAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setIsPaidManuallyEdited(true);
                          setCart({ ...cart, paidAmount: val });
                        }
                      }}
                      onKeyDown={handlePaidAmountKeyDown}
                    />
                    <button
                      type="button"
                      title="இன்றைய பில் தொகை மட்டும் செலுத்த (Pay Current Bill)"
                      className="px-2 py-0.5 text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                      onClick={() => {
                        setIsPaidManuallyEdited(false);
                        setCart({ ...cart, paidAmount: currentBillTotal > 0 ? currentBillTotal : 0 });
                      }}
                    >
                      Full
                    </button>
                  </div>
                </div>

                {/* Quick adjustment chips */}
                <div className="flex gap-1 justify-end pb-0.5 text-[10px]">
                  <button
                    type="button"
                    className="px-1.5 py-0.5 text-gray-600 hover:bg-gray-100 border border-gray-200 rounded font-medium"
                    onClick={() => {
                      setIsPaidManuallyEdited(true);
                      setCart({ ...cart, paidAmount: 0 });
                    }}
                  >
                    கடன் (0)
                  </button>
                  {oldCreditBalance > 0 && (
                    <button
                      type="button"
                      className="px-1.5 py-0.5 text-blue-700 hover:bg-blue-50 border border-blue-200 rounded font-medium"
                      onClick={() => {
                        setIsPaidManuallyEdited(true);
                        setCart({ ...cart, paidAmount: currentBillTotal + oldCreditBalance });
                      }}
                    >
                      முழு பழைய கடன் + பில் ({formatINR(currentBillTotal + oldCreditBalance)})
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between py-0.5 text-xs">
                  <label className="text-gray-600 text-xs mb-0 font-medium">{t('billing.payment_method')}</label>
                  <select
                    ref={paymentMethodRef}
                    className="w-36 h-6 px-1.5 text-xs rounded border border-gray-300 font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 cursor-pointer"
                    value={cart.paymentMethodId}
                    onChange={(e) => handlePaymentMethodChange(e.target.value)}
                    onKeyDown={handlePaymentMethodKeyDown}
                  >
                    {methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name_ta}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Balance Due Navy Bar */}
                <div className={`px-3 py-1 rounded-md flex items-center justify-between font-black text-xs ${
                  currentBillDue > 0 ? 'bg-[#0a1733] text-white' : 'bg-emerald-950 text-white'
                }`}>
                  <span className="tracking-wide">
                    {currentBillDue > 0
                      ? 'BILL BALANCE DUE (பில் மீதி பாக்கி)'
                      : changeToReturn > 0
                        ? 'CHANGE TO RETURN (சில்லறை கொடுக்க)'
                        : 'PAID IN FULL (முழுவதும் செலுத்தப்பட்டது)'}
                  </span>
                  <span className={`font-mono text-sm ${
                    currentBillDue > 0 ? 'text-rose-400' : changeToReturn > 0 ? 'text-amber-300 font-black' : 'text-emerald-300'
                  }`}>
                    {currentBillDue > 0
                      ? formatINR(currentBillDue)
                      : changeToReturn > 0
                        ? `+ ${formatINR(changeToReturn)}`
                        : formatINR(0)}
                  </span>
                </div>

                {/* Live Credit & Adjustment Status */}
                {cart.partyId && (
                  <div className="bg-slate-50 border border-slate-200 text-slate-800 rounded p-1.5 text-[11px] space-y-1 mt-0.5">
                    {oldCreditBalance > 0 ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">பழைய கடன் இருப்பு:</span>
                          <span className="font-mono font-bold text-slate-800">{formatINR(oldCreditBalance)}</span>
                        </div>

                        {paid === currentBillTotal && currentBillTotal > 0 && (
                          <div className="flex justify-between text-emerald-700 font-semibold border-t border-slate-200 pt-0.5">
                            <span>இன்றைய பில் செலுத்தப்பட்டது:</span>
                            <span>பழைய கடனில் மாற்றமில்லை ({formatINR(oldCreditBalance)}) ✓</span>
                          </div>
                        )}

                        {currentBillDue > 0 && (
                          <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-0.5">
                            <span>இன்றைய பில் கடனில் சேர்க்கப்பட்டது:</span>
                            <span className="font-mono">+ {formatINR(currentBillDue)} (மொத்த கடன்: {formatINR(newPartyBalance)})</span>
                          </div>
                        )}

                        {excessPaidOverBill > 0 && (
                          <div className="space-y-0.5 border-t border-slate-200 pt-0.5">
                            <div className="flex justify-between text-emerald-700 font-semibold">
                              <span>இன்றைய பில் ({formatINR(currentBillTotal)}):</span>
                              <span>செலுத்தப்பட்டது ✓</span>
                            </div>
                            <div className="flex justify-between text-blue-700 font-bold">
                              <span>பழைய கடனில் கழித்தது:</span>
                              <span className="font-mono">- {formatINR(creditDeduction)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-slate-900">
                              <span>மீதமுள்ள பழைய கடன்:</span>
                              <span className="font-mono text-rose-600">{formatINR(remainingOldCredit)}</span>
                            </div>
                            {changeToReturn > 0 && (
                              <div className="flex justify-between text-amber-900 bg-amber-100/70 p-1 rounded font-bold">
                                <span>கூடுதல் சில்லறை / அட்வான்ஸ்:</span>
                                <span className="font-mono">{formatINR(changeToReturn)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : oldCreditBalance < 0 ? (
                      <>
                        <div className="flex justify-between text-blue-800 font-semibold">
                          <span>முன் அட்வான்ஸ் / வரவு இருப்பு:</span>
                          <span className="font-mono font-bold">{formatINR(Math.abs(oldCreditBalance))}</span>
                        </div>
                        {currentBillDue > 0 && (
                          <div className="flex justify-between text-slate-700 font-bold border-t border-slate-200 pt-0.5">
                            <span>அட்வான்ஸில் கழிக்கப்பட்ட பின் மீதம்:</span>
                            <span className="font-mono">{formatINR(Math.abs(newPartyBalance))}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      currentBillDue > 0 && (
                        <div className="flex justify-between text-rose-700 font-bold">
                          <span>கடன் பாக்கி:</span>
                          <span className="font-mono">{formatINR(currentBillDue)}</span>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Walk-in Customer Extra Paid */}
                {!cart.partyId && excessPaidOverBill > 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded p-1.5 text-[11px] flex justify-between items-center font-bold mt-0.5">
                    <span>சில்லறை கொடுக்க வேண்டியது (Change):</span>
                    <span className="font-mono text-emerald-700 text-xs">₹{excessPaidOverBill.toFixed(2)}</span>
                  </div>
                )}

                <input
                  ref={notesRef}
                  className="w-full h-6 px-2 text-xs rounded border border-gray-300 text-gray-700 placeholder-gray-400"
                  placeholder={t('billing.notes') + ' (optional)...'}
                  value={cart.notes}
                  onChange={(e) => setCart({ ...cart, notes: e.target.value })}
                  onKeyDown={handleNotesKeyDown}
                />

                {/* Action Buttons */}
                <div className="flex gap-1.5 pt-1">
                  <button
                    ref={holdBtnRef}
                    type="button"
                    className="btn-secondary h-7 py-0.5 px-2 text-xs font-bold rounded flex-1 focus:ring-2 focus:ring-slate-400 focus:outline-none"
                    onClick={handleHold}
                    onKeyDown={(e) => handleButtonKeyDown(e, 'hold')}
                    disabled={saving || cart.lines.length === 0}
                  >
                    {t('billing.hold_bill')} (F2)
                  </button>
                  <button
                    ref={saveBtnRef}
                    type="button"
                    className="btn-secondary h-7 py-0.5 px-2 text-xs font-bold rounded flex-1 focus:ring-2 focus:ring-slate-400 focus:outline-none"
                    onClick={() => handleSave(true)}
                    onKeyDown={(e) => handleButtonKeyDown(e, 'save')}
                    disabled={saving || !canSave || cart.lines.length === 0}
                  >
                    {t('billing.save')}
                  </button>
                  <button
                    ref={savePrintBtnRef}
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 py-0.5 px-3 text-xs font-black rounded shadow-xs flex-1 flex items-center justify-center gap-1 transition-all focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                    onClick={() => handleSave(true)}
                    onKeyDown={(e) => handleButtonKeyDown(e, 'savePrint')}
                    disabled={saving || !canSave || cart.lines.length === 0}
                  >
                    <span>✓</span>
                    <span>{t('billing.save_print')} (F9)</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Commission Bill: Single Centered Card, No Payment Panel (Matches Reference Screenshots 3 & 4) */
            <div className="max-w-xl mx-auto w-full">
              <div className="bg-white rounded-lg border border-gray-200 p-2 space-y-1 shadow-xs">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 pb-0.5 border-b border-gray-100 flex justify-between items-center">
                  <span>COMMISSION BILL SUMMARY</span>
                  <span className="font-mono text-xs text-slate-600 font-bold uppercase">{cart.lines.length} ITEMS</span>
                </div>

                <Row label={t('billing.items_total')} value={formatINR(itemsTotal)} />

                <div className="flex items-center justify-between py-0.5 text-xs">
                  <span className="text-gray-600">{t('billing.commission_mode')}</span>
                  <div className="inline-flex p-0.5 bg-gray-100 rounded border border-gray-200 text-xs">
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${cart.commissionMode === 'percentage' ? 'bg-blue-900 text-white' : 'text-gray-600'}`}
                      onClick={() => setCart({ ...cart, commissionMode: 'percentage' })}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${cart.commissionMode === 'fixed' ? 'bg-blue-900 text-white' : 'text-gray-600'}`}
                      onClick={() => setCart({ ...cart, commissionMode: 'fixed' })}
                    >
                      Fixed ₹
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-0.5 text-xs">
                  <label className="text-gray-600 text-xs mb-0">{t('billing.commission')}</label>
                  {cart.commissionMode === 'percentage' ? (
                    <input
                      ref={commissionInputRef}
                      className="w-20 h-6 px-1.5 text-xs text-right font-mono rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-600"
                      type="text"
                      inputMode="decimal"
                      placeholder="%"
                      value={cart.commissionPercent === 0 || cart.commissionPercent === '0' ? '' : (cart.commissionPercent ?? '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setCart({ ...cart, commissionPercent: val });
                        }
                      }}
                      onKeyDown={handleCommissionKeyDown}
                    />
                  ) : (
                    <input
                      ref={commissionInputRef}
                      className="w-24 h-6 px-1.5 text-xs text-right font-mono rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-600"
                      type="text"
                      inputMode="decimal"
                      placeholder="₹"
                      value={cart.commissionAmount === 0 || cart.commissionAmount === '0' ? '' : (cart.commissionAmount ?? '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          setCart({ ...cart, commissionAmount: val });
                        }
                      }}
                      onKeyDown={handleCommissionKeyDown}
                    />
                  )}
                </div>

                {cart.commissionMode === 'percentage' && (
                  <Row label={t('billing.commission') + ' (₹)'} value={formatINR(commissionAmount)} />
                )}

                <NumberRow
                  inputRef={patthuRef}
                  label={t('billing.patthu')}
                  value={cart.patthu}
                  onChange={(v) => setCart({ ...cart, patthu: v })}
                  onKeyDown={handlePatthuKeyDown}
                />
                <NumberRow
                  inputRef={cooliRef}
                  label={t('billing.cooli')}
                  value={cart.cooli}
                  onChange={(v) => setCart({ ...cart, cooli: v })}
                  onKeyDown={handleCooliKeyDown}
                />
                <NumberRow
                  inputRef={vadagaiRef}
                  label={t('billing.vadagai')}
                  value={cart.vadagai}
                  onChange={(v) => setCart({ ...cart, vadagai: v })}
                  onKeyDown={handleVadagaiKeyDown}
                />
                <NumberRow
                  inputRef={otherDeductionRef}
                  label={t('billing.other_deduction')}
                  value={cart.otherDeduction}
                  onChange={(v) => setCart({ ...cart, otherDeduction: v })}
                  onKeyDown={handleOtherDeductionKeyDown}
                />

                <Row label={t('billing.commission_side_total')} value={formatINR(totalDeductions)} bold />

                {deductionsExceedSales && (
                  <p className="text-red-600 text-xs font-bold bg-red-50 border border-red-200 rounded px-2 py-0.5">
                    ⚠ {t('billing.validation_exceeds')}
                  </p>
                )}

                {/* Net Total Navy Bar */}
                <div className="bg-[#0a1733] text-white px-3 py-1 rounded-md flex items-center justify-between font-black text-xs mt-1">
                  <span className="tracking-wide">NET TOTAL</span>
                  <span className="font-mono text-sm tracking-tight">{formatINR(netTotal)}</span>
                </div>

                {/* Notes (optional) Input directly in summary card */}
                <input
                  ref={notesRef}
                  className="w-full h-6 px-2 text-xs rounded border border-gray-300 text-gray-700 placeholder-gray-400 mt-1"
                  placeholder={t('billing.notes') + ' (optional)...'}
                  value={cart.notes}
                  onChange={(e) => setCart({ ...cart, notes: e.target.value })}
                  onKeyDown={handleNotesKeyDown}
                />

                {/* Action Buttons inside summary card */}
                <div className="flex gap-1.5 pt-1">
                  <button
                    ref={holdBtnRef}
                    type="button"
                    className="btn-secondary h-7 py-0.5 px-2 text-xs font-bold rounded flex-1 focus:ring-2 focus:ring-slate-400 focus:outline-none"
                    onClick={handleHold}
                    onKeyDown={(e) => handleButtonKeyDown(e, 'hold')}
                    disabled={saving || cart.lines.length === 0}
                  >
                    {t('billing.hold_bill')} (F2)
                  </button>
                  <button
                    ref={saveBtnRef}
                    type="button"
                    className="btn-secondary h-7 py-0.5 px-2 text-xs font-bold rounded flex-1 focus:ring-2 focus:ring-slate-400 focus:outline-none"
                    onClick={() => handleSave(true)}
                    onKeyDown={(e) => handleButtonKeyDown(e, 'save')}
                    disabled={saving || !canSave || cart.lines.length === 0}
                  >
                    {t('billing.save')}
                  </button>
                  <button
                    ref={savePrintBtnRef}
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 py-0.5 px-3 text-xs font-black rounded shadow-xs flex-1 flex items-center justify-center gap-1 transition-all focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                    onClick={() => handleSave(true)}
                    onKeyDown={(e) => handleButtonKeyDown(e, 'savePrint')}
                    disabled={saving || !canSave || cart.lines.length === 0}
                  >
                    <span>✓</span>
                    <span>{t('billing.save_print')} (F9)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. Bottom Compact Summary Strip */}
          <div className="bg-slate-900 text-white rounded-md px-4 py-1 flex items-center justify-between text-xs font-medium">
            <div className="space-x-4">
              <span>Total Item Sales: <strong className="text-white font-mono">{formatINR(itemsTotal)}</strong></span>
              {isCommission && (
                <span>Total Deductions: <strong className="text-amber-300 font-mono">{formatINR(totalDeductions)}</strong></span>
              )}
            </div>
            <div>
              <span>Final Total: <strong className="text-emerald-400 font-mono text-sm font-black ml-1.5">{formatINR(currentBillTotal)}</strong></span>
            </div>
          </div>

          {/* Held Bills Modal */}
          {heldOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 no-print p-4 overflow-y-auto">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-lg p-4 space-y-3 my-auto max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center border-b pb-2">
                  <h2 className="font-bold text-sm text-slate-800">{t('billing.held_bills')}</h2>
                  <button className="btn-secondary py-0.5 px-2 text-xs" onClick={() => setHeldOpen(false)}>
                    {t('common.close')}
                  </button>
                </div>
                {heldBills.length === 0 && <p className="text-gray-400 text-xs italic py-2">— No held bills found —</p>}
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {heldBills.map((row) => (
                    <div key={row.id} className="flex items-center justify-between border-b pb-2 text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{row.label || t('common.walkin')}</div>
                        <div className="text-[11px] text-gray-500">{row.cart?.lines?.length || 0} items</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button className="btn-secondary py-0.5 px-2 text-xs font-semibold" onClick={() => resumeHeld(row)}>
                          {t('billing.resume')}
                        </button>
                        <button
                          className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors inline-flex items-center justify-center"
                          onClick={() => removeHeld(row.id)}
                          title={t('common.delete')}
                          type="button"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value, bold, tone }) {
  const toneClass = tone === 'red' ? 'text-red-500' : tone === 'green' ? 'text-emerald-400' : '';
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className={bold ? 'font-bold text-gray-800' : 'text-gray-600'}>{label}</span>
      <span className={(bold ? 'font-bold text-xs ' : 'font-medium text-xs ') + toneClass}>{value}</span>
    </div>
  );
}

function NumberRow({ label, value, onChange, inputRef, onKeyDown, placeholder = '₹' }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <label className="text-gray-600 text-xs mb-0">{label}</label>
      <input
        ref={inputRef}
        className="w-24 h-6 px-1.5 text-xs text-right font-mono rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-600"
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={value === 0 || value === '0' ? '' : (value ?? '')}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '' || /^\d*\.?\d*$/.test(val)) {
            onChange(val);
          }
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
