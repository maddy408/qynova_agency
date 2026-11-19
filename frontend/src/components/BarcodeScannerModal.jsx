import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  X,
  Camera,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  PackageX,
  Plus,
  Keyboard,
  Barcode,
  Sparkles,
  Info,
  Upload,
} from 'lucide-react';
import { Button } from './Button.jsx';
import { handleFormKeyDown } from '../utils/formNavigation';

/**
 * Short audio beep feedback using Web Audio API
 */
function playAudioBeep(success = true) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = success ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(success ? 880 : 320, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.12 : 0.22));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.12 : 0.22));
  } catch {
    // Audio context may be restricted by browser policy before user interaction
  }
}

/**
 * Check browser camera permission status via Permissions API where available
 * Returns: 'granted' | 'prompt' | 'denied' | 'unknown'
 */
async function getCameraPermissionState() {
  if (navigator?.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'camera' });
      return status.state;
    } catch {
      return 'unknown';
    }
  }
  return 'unknown';
}

/**
 * Centered Modal Barcode Scanner for KC Agency POS.
 * Opens as a compact dialog over the POS page.
 * Supports live camera stream with visible reticle guide, Chrome permissions handling,
 * audio feedback, debounced continuous scanning, manual code entry, and session history.
 */
export function BarcodeScannerModal({ onScan, onClose }) {
  const [cameraState, setCameraState] = useState('initializing'); // 'initializing' | 'ready' | 'detected' | 'permission_denied' | 'unavailable'
  const [errorMessage, setErrorMessage] = useState('');
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'warning' | 'error', message: string, code?: string }
  const [manualCode, setManualCode] = useState('');
  const [recentScans, setRecentScans] = useState([]);
  const [isDecodingFile, setIsDecodingFile] = useState(false);
  const [multipleBarcodes, setMultipleBarcodes] = useState(null); // string[] | null

  const scannerRef = useRef(null);
  const containerIdRef = useRef(`pos-modal-camera-${Math.random().toString(36).slice(2, 9)}`);
  const fileContainerIdRef = useRef(`pos-file-scanner-${Math.random().toString(36).slice(2, 9)}`);
  const fileInputRef = useRef(null);
  const isMountedRef = useRef(true);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const isProcessingRef = useRef(false);

  // Track the barcode actively held in view to prevent continuous duplicate additions
  const activeInViewBarcodeRef = useRef(null);
  const lastDetectedTimeRef = useRef(0);

  const feedbackTimerRef = useRef(null);
  const manualInputRef = useRef(null);

  const showFeedback = (type, message, code) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedback({ type, message, code });
    feedbackTimerRef.current = setTimeout(() => {
      setFeedback(null);
      if (isMountedRef.current && cameraState === 'detected') {
        setCameraState('ready');
      }
    }, 3000);
  };

  const processBarcode = (rawCode, isManual = false) => {
    const code = String(rawCode || '').trim();
    if (!code) return;

    // Prevent concurrent executions while previous scan addition is processing
    if (isProcessingRef.current) {
      return;
    }

    const now = Date.now();

    // Prevent continuous auto-repeat: if the same barcode is still continuously present in view,
    // do not add duplicate cart lines. Refresh timestamp so presence lock stays active.
    if (!isManual && activeInViewBarcodeRef.current === code) {
      lastDetectedTimeRef.current = now;
      return;
    }

    isProcessingRef.current = true;
    activeInViewBarcodeRef.current = code;
    lastDetectedTimeRef.current = now;

    setCameraState('detected');

    try {
      // Process using parent POS onScan handler
      const result = onScan(code);

      if (result?.success) {
        playAudioBeep(true);
        showFeedback('success', result.message || `Added "${result.item?.item_name || code}"`, code);
        setRecentScans((prev) => [
          { id: `${code}-${now}`, name: result.item?.item_name || code, code, time: new Date().toLocaleTimeString(), status: 'success' },
          ...prev.slice(0, 4),
        ]);
      } else if (result?.reason === 'out_of_stock') {
        playAudioBeep(false);
        showFeedback('warning', result.message || 'Product is out of stock', code);
        setRecentScans((prev) => [
          { id: `${code}-${now}`, name: result.item?.item_name || code, code, time: new Date().toLocaleTimeString(), status: 'out_of_stock' },
          ...prev.slice(0, 4),
        ]);
      } else {
        playAudioBeep(false);
        showFeedback('error', result?.message || `Product not found for "${code}"`, code);
        setRecentScans((prev) => [
          { id: `${code}-${now}`, name: 'Unknown item', code, time: new Date().toLocaleTimeString(), status: 'not_found' },
          ...prev.slice(0, 4),
        ]);
      }
    } catch (err) {
      console.error('POS onScan error:', err);
    } finally {
      // Release processing lock so subsequent different scans or deliberate re-scans can proceed
      isProcessingRef.current = false;
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    // Clear input value so selecting the same file again triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    setIsDecodingFile(true);
    setMultipleBarcodes(null);

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      showFeedback('error', 'Please upload a valid JPG, PNG, or WebP image.', '');
      setIsDecodingFile(false);
      return;
    }

    try {
      let detectedCodes = [];

      // Method 1: Client-side BarcodeDetector API (modern Chromium, fast, multi-code capable)
      if ('BarcodeDetector' in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const targetFormats = [
            'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'
          ].filter((f) => supported.includes(f));

          if (targetFormats.length > 0) {
            const detector = new window.BarcodeDetector({ formats: targetFormats });
            const bitmap = await createImageBitmap(file);
            const results = await detector.detect(bitmap);
            if (results && results.length > 0) {
              detectedCodes = results
                .map((r) => String(r.rawValue || '').trim())
                .filter(Boolean);
            }
          }
        } catch {
          // Fallback to Html5Qrcode if BarcodeDetector is unavailable or fails
        }
      }

      // Method 2: Fallback to Html5Qrcode file scan (ZXing)
      if (detectedCodes.length === 0) {
        const fileScanner = new Html5Qrcode(fileContainerIdRef.current, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });

        try {
          const res = await fileScanner.scanFileV2(file, false);
          const code = String(res?.decodedText || '').trim();
          if (code) {
            detectedCodes = [code];
          }
        } catch {
          // No barcode detected in image
        } finally {
          try {
            fileScanner.clear();
          } catch {
            // ignore shutdown
          }
        }
      }

      const uniqueCodes = [...new Set(detectedCodes)];

      if (uniqueCodes.length > 1) {
        setMultipleBarcodes(uniqueCodes);
        showFeedback('warning', `Detected ${uniqueCodes.length} barcodes. Select one below.`, '');
      } else if (uniqueCodes.length === 1) {
        processBarcode(uniqueCodes[0], true);
      } else {
        showFeedback(
          'error',
          'No barcode found in image. Please try another image or enter manually.',
          ''
        );
      }
    } catch {
      showFeedback(
        'error',
        'Failed to decode image. Please try again or enter code manually.',
        ''
      );
    } finally {
      setIsDecodingFile(false);
    }
  };

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const barcodeDetectorRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastFrameCountRef = useRef(0);
  const lastFpsCalcRef = useRef(Date.now());
  const currentFpsRef = useRef(0);

  const [diagnostics, setDiagnostics] = useState({
    engine: 'BarcodeDetector',
    resolution: '–',
    fps: 0,
    frameCount: 0,
    status: 'Initializing camera…',
    lastFormat: '',
  });

  const stopScanner = () => {
    isStoppingRef.current = true;
    activeInViewBarcodeRef.current = null;
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {}
    }
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    isStoppingRef.current = false;
  };

  const startScanner = async () => {
    if (!isMountedRef.current || isStartingRef.current) return;
    isStartingRef.current = true;

    setCameraState('initializing');
    setErrorMessage('');
    setDiagnostics((prev) => ({
      ...prev,
      status: 'Requesting camera access…',
    }));

    // Check camera API support
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraState('unavailable');
      setErrorMessage('Camera access is not supported by this browser or requires a secure context (HTTPS or localhost).');
      isStartingRef.current = false;
      return;
    }

    // Check browser permission status if supported
    const permStatus = await getCameraPermissionState();
    if (permStatus === 'denied') {
      setCameraState('permission_denied');
      setErrorMessage('Camera access was blocked in Chrome site settings.');
      isStartingRef.current = false;
      return;
    }

    // Clean up any existing stream before initializing new one
    stopScanner();

    try {
      // 1. Initialize BarcodeDetector API (modern Chromium / Chrome)
      let detector = null;
      let engineLabel = 'Html5Qrcode (ZXing)';
      if ('BarcodeDetector' in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const targetFormats = [
            'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'
          ].filter((f) => supported.includes(f));

          if (targetFormats.length > 0) {
            detector = new window.BarcodeDetector({ formats: targetFormats });
            engineLabel = `BarcodeDetector (${targetFormats.slice(0, 3).join(', ')}…)`;
          }
        } catch (e) {
          console.warn('BarcodeDetector initialization warning:', e);
        }
      }
      barcodeDetectorRef.current = detector;

      // 2. Request camera stream with HD constraints (suitable for phone-screen scanning)
      const constraintsList = [
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
          },
          audio: false,
        },
        {
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
          },
          audio: false,
        },
        {
          video: true,
          audio: false,
        },
      ];

      let stream = null;
      let lastErr = null;
      for (const c of constraintsList) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          if (stream) break;
        } catch (err) {
          lastErr = err;
          if (
            err.name === 'NotAllowedError' ||
            err.name === 'PermissionDeniedError' ||
            String(err?.message || '').toLowerCase().includes('denied')
          ) {
            throw err;
          }
        }
      }

      if (!stream && lastErr) {
        throw lastErr;
      }

      if (!isMountedRef.current) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Enable continuous auto-focus if supported by the camera hardware
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            await videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
          }
        } catch {}
      }

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const trackSettings = videoTrack?.getSettings ? videoTrack.getSettings() : {};
      const res = `${videoRef.current?.videoWidth || trackSettings.width || '–'}x${videoRef.current?.videoHeight || trackSettings.height || '–'}`;

      frameCountRef.current = 0;
      lastFrameCountRef.current = 0;
      lastFpsCalcRef.current = Date.now();
      currentFpsRef.current = 0;

      setDiagnostics({
        engine: engineLabel,
        resolution: res,
        fps: 0,
        frameCount: 0,
        status: 'Camera ready',
        lastFormat: '',
      });

      if (isMountedRef.current) {
        setCameraState('ready');
      }

      // 3. Start continuous frame decoding loop
      const runScanLoop = async () => {
        if (!isMountedRef.current || isStoppingRef.current) return;

        const video = videoRef.current;
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          frameCountRef.current += 1;
          const now = Date.now();
          if (now - lastFpsCalcRef.current >= 1000) {
            currentFpsRef.current = Math.round(
              ((frameCountRef.current - lastFrameCountRef.current) * 1000) /
              (now - lastFpsCalcRef.current)
            );
            lastFrameCountRef.current = frameCountRef.current;
            lastFpsCalcRef.current = now;
          }

          const currentRes = `${video.videoWidth}x${video.videoHeight}`;

          try {
            let detectedCode = null;
            let detectedFormat = '';

            if (barcodeDetectorRef.current) {
              const results = await barcodeDetectorRef.current.detect(video);
              if (results && results.length > 0) {
                detectedCode = String(results[0].rawValue || '').trim();
                detectedFormat = results[0].format || '';
              }
            }

            if (detectedCode) {
              setDiagnostics((prev) => ({
                ...prev,
                resolution: currentRes,
                frameCount: frameCountRef.current,
                fps: currentFpsRef.current,
                status: `Decoded: ${detectedCode} (${detectedFormat})`,
                lastFormat: detectedFormat,
              }));
              processBarcode(detectedCode, false);
            } else {
              // No barcode detected in current frame
              if (activeInViewBarcodeRef.current) {
                const elapsed = Date.now() - lastDetectedTimeRef.current;
                // Release presence lock once barcode has disappeared for > 1000ms
                if (elapsed > 1000) {
                  activeInViewBarcodeRef.current = null;
                }
              }
              setDiagnostics((prev) => ({
                ...prev,
                resolution: currentRes,
                frameCount: frameCountRef.current,
                fps: currentFpsRef.current,
                status: activeInViewBarcodeRef.current
                  ? `Holding "${activeInViewBarcodeRef.current}"`
                  : 'Scanning… (no code in view)',
              }));
            }
          } catch (frameErr) {
            setDiagnostics((prev) => ({
              ...prev,
              resolution: currentRes,
              frameCount: frameCountRef.current,
              fps: currentFpsRef.current,
              status: `Error: ${frameErr?.message || 'Decode failed'}`,
            }));
          }
        }

        if (isMountedRef.current && !isStoppingRef.current) {
          scanTimerRef.current = setTimeout(runScanLoop, 50); // ~20 fps
        }
      };

      runScanLoop();
    } catch (err) {
      if (!isMountedRef.current) return;

      const errName = err?.name || '';
      const errMsg = String(err?.message || err || '').toLowerCase();

      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errMsg.includes('notallowederror') ||
        errMsg.includes('permission') ||
        errMsg.includes('denied')
      ) {
        setCameraState('permission_denied');
        setErrorMessage('Camera access was blocked by your browser settings.');
      } else {
        setCameraState('unavailable');
        setErrorMessage(
          err?.message ||
          'Unable to access camera device. Ensure no other application is using the camera.'
        );
      }
    } finally {
      isStartingRef.current = false;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    startScanner();

    // Close on ESC key
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('keydown', handleKeyDown);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      stopScanner();
    };
  }, []);

  const handleManualSubmit = (e) => {
    e?.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    processBarcode(code, true);
    setManualCode('');
    manualInputRef.current?.focus();
  };

  const isLive = cameraState === 'ready' || cameraState === 'detected';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-border-soft flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-soft/80 bg-page/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold-dark">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink">Scan Product Barcode</h3>
              <p className="text-[11px] text-ink-muted">Align barcode with camera or enter code manually</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-page hover:text-ink transition-colors"
            title="Close scanner (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 flex flex-col gap-3">
          {/* Camera Viewport Area */}
          <div className="relative h-56 w-full overflow-hidden rounded-xl bg-black border border-border-soft shadow-inner flex items-center justify-center">
            {/* Live Camera Video Surface */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />

            {/* Offscreen fallback container */}
            <div
              id={containerIdRef.current}
              style={{ display: 'none' }}
              aria-hidden="true"
            />

            {/* Single Centered Viewfinder Scanning Reticle (visible when camera is live) */}
            {isLive && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-3 select-none">
                <div className="relative w-64 h-36 rounded-xl border-2 border-primary/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.48)] flex items-center justify-center">
                  {/* Top-Left Corner Accent */}
                  <div className="absolute -left-1 -top-1 h-5 w-5 border-l-[3px] border-t-[3px] border-amber-400 rounded-tl" />
                  {/* Top-Right Corner Accent */}
                  <div className="absolute -right-1 -top-1 h-5 w-5 border-r-[3px] border-t-[3px] border-amber-400 rounded-tr" />
                  {/* Bottom-Left Corner Accent */}
                  <div className="absolute -left-1 -bottom-1 h-5 w-5 border-l-[3px] border-b-[3px] border-amber-400 rounded-bl" />
                  {/* Bottom-Right Corner Accent */}
                  <div className="absolute -right-1 -bottom-1 h-5 w-5 border-r-[3px] border-b-[3px] border-amber-400 rounded-br" />

                  {/* Animated laser scan line */}
                  <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-pulse" />

                  {/* Centered guide label */}
                  <span className="absolute bottom-2 text-[10px] font-medium tracking-wide text-white/85 bg-black/50 px-2 py-0.5 rounded backdrop-blur-xs">
                    Align barcode inside frame
                  </span>
                </div>
              </div>
            )}

            {/* Initializing State */}
            {cameraState === 'initializing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/90 text-white p-4 text-center">
                <RefreshCw size={26} className="animate-spin text-gold mb-2" />
                <p className="text-xs font-semibold">Starting camera…</p>
                <p className="text-[11px] text-white/70 mt-0.5">Please allow camera access if prompted</p>
              </div>
            )}

            {/* Permission Denied State */}
            {cameraState === 'permission_denied' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-page p-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 text-danger mb-2">
                  <AlertCircle size={22} />
                </div>
                <p className="text-xs font-bold text-ink">Permission Denied</p>
                <p className="text-[11px] text-ink-muted mt-0.5 max-w-[220px]">
                  Camera is blocked in browser settings
                </p>
                <button
                  type="button"
                  onClick={startScanner}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gold-soft active:scale-95 transition-all"
                >
                  <RefreshCw size={13} /> Retry Camera
                </button>
              </div>
            )}

            {/* Unavailable State */}
            {cameraState === 'unavailable' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-page p-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10 text-warning mb-2">
                  <AlertCircle size={22} />
                </div>
                <p className="text-xs font-bold text-ink">Camera Unavailable</p>
                <p className="text-[11px] text-ink-muted mt-0.5 max-w-[220px]">
                  {errorMessage || 'Camera is in use or no camera was found'}
                </p>
                <button
                  type="button"
                  onClick={startScanner}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page active:scale-95 transition-all"
                >
                  <RefreshCw size={13} /> Retry Camera
                </button>
              </div>
            )}

            {/* Status Badge in Viewport Bottom Left Corner */}
            <div className="absolute bottom-2 left-2 pointer-events-none">
              {cameraState === 'ready' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 backdrop-blur-xs">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Ready to scan
                </span>
              )}
              {cameraState === 'detected' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-dark/95 px-2.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
                  <Sparkles size={11} /> Barcode detected
                </span>
              )}
            </div>
          </div>

          {/* Temporary Frame Diagnostics (Live status, FPS, resolution, detection engine) */}
          {isLive && (
            <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-slate-900/90 text-[10px] font-mono text-slate-300 border border-slate-800 shadow-2xs">
              <div className="flex items-center gap-1.5 truncate">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-emerald-400">{diagnostics.engine}</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">{diagnostics.resolution}</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">{diagnostics.frameCount} frames ({diagnostics.fps} fps)</span>
              </div>
              <div className="truncate max-w-[170px] text-right font-medium text-amber-300 pl-2">
                {diagnostics.status}
              </div>
            </div>
          )}

          {/* Phone Screen Guidance Hint */}
          {isLive && (
            <div className="flex items-center gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200/70 rounded-lg px-2.5 py-1.5">
              <Sparkles size={13} className="text-amber-600 shrink-0" />
              <span>
                <strong>Tip for phone screens:</strong> Lower phone brightness to ~40% and hold 15–20 cm away for clear focus.
              </span>
            </div>
          )}

          {/* Feedback Banner or Permission Instructions */}
          {feedback ? (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold shadow-xs animate-in slide-in-from-top-1 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : feedback.type === 'warning'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.type === 'success' && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}
              {feedback.type === 'warning' && <PackageX size={16} className="text-amber-600 shrink-0" />}
              {feedback.type === 'error' && <AlertCircle size={16} className="text-rose-600 shrink-0" />}
              <span className="truncate">{feedback.message}</span>
            </div>
          ) : cameraState === 'permission_denied' ? (
            <div className="rounded-lg bg-danger/10 border border-danger/20 p-2.5 text-xs text-danger flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">How to enable camera access in Chrome:</p>
                <p className="text-ink-muted text-[11px] leading-relaxed">
                  1. Click the site settings / tune icon beside <strong className="text-ink">localhost</strong> in your address bar.<br />
                  2. Change <strong className="text-ink">Camera</strong> to <em>Allow</em>.<br />
                  3. Click <strong className="text-ink underline cursor-pointer" onClick={startScanner}>Retry Camera</strong> or type barcode manually below.
                </p>
              </div>
            </div>
          ) : cameraState === 'unavailable' ? (
            <div className="rounded-lg bg-warning/10 border border-warning/20 p-2.5 text-xs text-warning flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-ink-muted">
                {errorMessage || 'Camera is currently unavailable. You can scan or add items using manual entry below.'}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-ink-muted bg-page/60 rounded-lg px-2.5 py-1.5 border border-border-soft/60">
              <Barcode size={13} className="text-gold shrink-0" />
              <span>Supports continuous scanning (EAN, UPC, Code 128, QR). Hold barcode in guide box.</span>
            </div>
          )}

          {/* Manual Entry Fallback Form & Image Upload */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-ink-muted flex items-center gap-1">
                <Keyboard size={12} /> Manual Barcode / Code Fallback:
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isDecodingFile}
                  className="text-[11px] font-semibold text-primary hover:text-primary-hover hover:underline flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Upload and scan barcode image (JPG, PNG, WebP)"
                >
                  {isDecodingFile ? (
                    <RefreshCw size={11} className="animate-spin text-primary" />
                  ) : (
                    <Upload size={12} className="text-primary" />
                  )}
                  <span>{isDecodingFile ? 'Decoding…' : 'Upload Image'}</span>
                </button>
                {(cameraState === 'permission_denied' || cameraState === 'unavailable') && (
                  <button
                    type="button"
                    onClick={startScanner}
                    className="text-[11px] font-semibold text-gold hover:underline flex items-center gap-1"
                  >
                    <RefreshCw size={10} /> Retry Camera
                  </button>
                )}
              </div>
            </div>

            {/* Multiple Barcodes Selection List */}
            {multipleBarcodes && multipleBarcodes.length > 0 && (
              <div className="mb-2.5 rounded-lg bg-page border border-primary/25 p-2.5 flex flex-col gap-1.5 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                    <Barcode size={13} /> Multiple barcodes detected in image:
                  </span>
                  <button
                    type="button"
                    onClick={() => setMultipleBarcodes(null)}
                    className="text-[10px] text-ink-muted hover:text-ink font-medium cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="text-[10px] text-ink-muted">Click the barcode you want to add to the current bill:</p>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {multipleBarcodes.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        setMultipleBarcodes(null);
                        processBarcode(code, true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-primary/30 text-xs font-mono font-medium text-primary hover:bg-primary hover:text-white transition-all shadow-2xs active:scale-95 cursor-pointer"
                    >
                      <span>{code}</span>
                      <Plus size={12} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleManualSubmit} onKeyDown={handleFormKeyDown} className="flex items-center gap-2">
              <input
                ref={manualInputRef}
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Type or paste barcode or item code…"
                className="input py-1.5 px-3 text-xs flex-1 font-mono"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!manualCode.trim()}
                icon={<Plus size={13} />}
              >
                Add
              </Button>
            </form>

            {/* Hidden file input for barcode image upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleImageUpload}
              className="hidden"
            />
            {/* Offscreen container for file-based barcode decoding */}
            <div
              id={fileContainerIdRef.current}
              style={{ display: 'none' }}
              aria-hidden="true"
            />
          </div>

          {/* Session Scanned History */}
          {recentScans.length > 0 && (
            <div className="border-t border-border-soft/60 pt-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                <span>Recent Scans</span>
                <span>{recentScans.length} item(s)</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 max-h-20 overflow-y-auto">
                {recentScans.map((scan) => (
                  <span
                    key={scan.id}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                      scan.status === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : scan.status === 'out_of_stock'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    <span className="truncate max-w-[130px]">{scan.name}</span>
                    <span className="text-[9px] opacity-75 font-mono">({scan.code})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-soft/80 bg-page/50">
          <span className="text-[11px] text-ink-muted flex items-center gap-1">
            <Info size={12} className="text-ink-muted" /> Continuous scanning enabled
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
