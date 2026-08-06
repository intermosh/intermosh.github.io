import {
  CHORD_NAMES,
  CHORD_ROLES,
  HAND_CONNECTIONS
} from './constants.js';

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Convert an actual frequency (Hz) to its note name (any octave).
// Mirrors the audio engine: the sounding root freq is written to SAB index 161.
function freqToNoteName(freq) {
  if (!freq || freq <= 0) return '';
  // MIDI note number, A4 = 440 Hz = MIDI 69
  const midi = 69 + 12 * Math.log2(freq / 440);
  const noteIdx = ((Math.round(midi) % 12) + 12) % 12;
  return NOTE_NAMES[noteIdx];
}

const EFFECT_NAMES = ['Reverb', 'Vibrato', 'Bitcrusher', 'Filter', 'Delay', 'Tremolo'];

export class GraphicEngine {
  constructor(canvas, sab, videoElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sab = sab;
    this.video = videoElement;

    this.int32View = new Int32Array(sab);
    this.float32View = new Float32Array(sab);

    this.isRunning = false;
    this.fps = 0;
    this.frameCount = 0;
    this.fpsTimer = performance.now();

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.int32View[2] = this.canvas.width;
    this.int32View[3] = this.canvas.height;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.fpsTimer = performance.now();
    this.renderLoop();
  }

  stop() { this.isRunning = false; }

  renderLoop() {
    if (!this.isRunning) return;
    const now = performance.now();
    this.frameCount++;
    if (now - this.fpsTimer >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.fpsTimer));
      this.frameCount = 0;
      this.fpsTimer = now;
    }
    this.render();
    requestAnimationFrame(() => this.renderLoop());
  }

  render() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    // 1. Camera feed (mirrored)
    this.drawCameraFeed(w, h);

    // 2. Oscilloscope (transparent, left strip)
    this.drawOscilloscope(h);

    // 3. SAB state
    const rightDetected = this.int32View[32];
    const leftDetected = this.int32View[96];

    // 4. Left hand: pinch circle + numeric tag
    if (leftDetected === 1) {
      this.drawHandLandmarks(101, true);
      this.drawPinchCircle();
      this.drawLeftHandTag();
    }

    // 5. Right hand: landmarks
    if (rightDetected === 1) {
      this.drawHandLandmarks(37, false);
    }

    // 6. Top-right: left hand data bars
    this.drawDataBars();

    // 7. Chord label
    this.drawChordLabel();

    // 8. Status
    this.drawStatusOverlay();
  }

  // ─── Camera (mirrored) ─────────────────────────────────────────────────
  drawCameraFeed(w, h) {
    const ctx = this.ctx;
    if (!this.video || this.video.readyState < 2) {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.restore();
  }

  // ─── Oscilloscope (transparent background) ─────────────────────────────
  drawOscilloscope(h) {
    const ctx = this.ctx;
    const stripW = 60;
    const centerX = stripW / 2;

    const oscOff = 167;
    const samples = [];
    for (let k = 0; k < 25; k++) {
      samples.push(this.float32View[oscOff + k] || 0);
    }

    ctx.save();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < samples.length; k++) {
      const y = (k / (samples.length - 1)) * h;
      const x = centerX + samples[k] * 24;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Subtle center guide
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, h);
    ctx.stroke();
    ctx.restore();
  }

  // ─── Hand Landmarks (white) ────────────────────────────────────────────
  drawHandLandmarks(offset, isLeft) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const pts = [];
    for (let i = 0; i < 21; i++) {
      pts.push({
        x: (1.0 - this.float32View[offset + i * 2]) * w,
        y: this.float32View[offset + i * 2 + 1] * h
      });
    }

    ctx.save();
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 0.4;
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
    for (let i = 0; i < pts.length; i++) {
      const r = (i === 4 || i === 8 || i === 12 || i === 16 || i === 20) ? 5 : 3;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ─── Left Hand Numeric Tag (no background, small font, 10-char decimal) ─
  drawLeftHandTag() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Use wrist position
    const lmOff = 101;
    const wristX = (1.0 - this.float32View[lmOff]) * w;
    const wristY = this.float32View[lmOff + 1] * h;

    const pinchDist = this.float32View[97];
    const palmRot = this.float32View[98];

    // 10-char decimal representation
    const pinchStr = pinchDist.toFixed(5);
    const rotStr = (palmRot * 180 / Math.PI).toFixed(5);

    ctx.save();
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;

    // Pinch value
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`p: ${pinchStr}`, wristX + 14, wristY - 6);

    // Rotation value
    ctx.fillText(`r: ${rotStr}°`, wristX + 14, wristY + 8);

    ctx.restore();
  }

  // ─── Pinch Circle (exponential) ────────────────────────────────────────
  drawPinchCircle() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const lmOff = 101;
    const thumbX = (1.0 - this.float32View[lmOff + 4 * 2]) * w;
    const thumbY = this.float32View[lmOff + 4 * 2 + 1] * h;
    const indexX = (1.0 - this.float32View[lmOff + 8 * 2]) * w;
    const indexY = this.float32View[lmOff + 8 * 2 + 1] * h;
    const volume = this.float32View[160];

    const midX = (thumbX + indexX) / 2;
    const midY = (thumbY + indexY) / 2;

    ctx.save();
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;

    // Line
    ctx.beginPath();
    ctx.moveTo(thumbX, thumbY);
    ctx.lineTo(indexX, indexY);
    ctx.stroke();

    // Midpoint dot
    ctx.beginPath();
    ctx.arc(midX, midY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Circle radius: linear 0→120px based on volume
    const maxR = 120;
    const r = volume * maxR;

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(midX, midY, r, 0, Math.PI * 2);
    ctx.stroke();

    // Volume %
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(volume * 100)}%`, midX, midY - r - 8);

    ctx.restore();
  }

  // ─── Top-Right Data Bars (left hand data) ──────────────────────────────
  drawDataBars() {
    const ctx = this.ctx;
    const w = this.canvas.width;

    const pinchDist = this.float32View[97];
    const palmRot = this.float32View[98];
    const leftDetected = this.int32View[96];
    const selectedEffect = this.int32View[10];

    const barX = w - 180;
    const barMaxW = 140;
    const barH = 14;

    ctx.save();
    ctx.shadowBlur = 0;

    // Effect name
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#888888';
    ctx.fillText(`Efecto: ${EFFECT_NAMES[selectedEffect] || '?'}`, barX + barMaxW, 10);

    // Bar 1: Pinch distance (0–0.15 mapped to 0–1)
    const pinchNorm = leftDetected ? Math.min(pinchDist / 0.15, 1) : 0;
    this.drawBar(barX, 18, barMaxW, barH, pinchNorm, 'Pinch', pinchDist.toFixed(4));

    // Bar 2: Palm rotation (0–PI mapped to 0–1)
    const rotNorm = leftDetected ? Math.min(palmRot / Math.PI, 1) : 0;
    this.drawBar(barX, 42, barMaxW, barH, rotNorm, 'Rotación', `${(palmRot * 180 / Math.PI).toFixed(1)}°`);

    ctx.restore();
  }

  drawBar(x, y, maxW, h, norm, label, valueText) {
    const ctx = this.ctx;
    const fillW = Math.max(2, norm * maxW);

    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText(label, x - 6, y + h - 2);

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, maxW, h);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, fillW, h);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(valueText, x + maxW + 8, y + h - 2);
  }

  // ─── Chord Label ───────────────────────────────────────────────────────
  drawChordLabel() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const rightDetected = this.int32View[32];
    const activeChord = this.int32View[162];
    const majorMinor = this.float32View[163];
    const fingerCount = this.float32View[33];
    const envelope = this.float32View[166];

    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowBlur = 0;
    const cx = w / 2;
    const topY = 56;

    if (rightDetected === 1 && activeChord >= 0 && activeChord < CHORD_NAMES.length) {
      const role = CHORD_ROLES[activeChord];
      const isMinor = majorMinor >= 0.5;
      const mode = isMinor ? 'min' : 'maj';

      // Note name derived from the ACTUAL sounding root frequency (SAB index 161),
      // so the label always matches what's playing, regardless of root note/scale.
      const soundingFreq = this.float32View[161];
      const name = freqToNoteName(soundingFreq) || NOTE_NAMES[0];

      ctx.font = 'bold 44px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`${name} ${mode}`, cx, topY);

      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#CCCCCC';
      ctx.fillText(role, cx, topY + 26);

      ctx.font = '11px monospace';
      ctx.fillStyle = '#888888';
      ctx.fillText(`fingers: ${Math.round(fingerCount)}  env: ${Math.round(envelope * 100)}%`, cx, topY + 44);
    }
    ctx.restore();
  }

  // ─── Status ─────────────────────────────────────────────────────────────
  drawStatusOverlay() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    ctx.font = '10px monospace';
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`FPS ${this.fps}`, 70, h - 12);
    ctx.restore();
  }
}
