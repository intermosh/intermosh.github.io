/**
 * GP_LIVE // SYS.CTRL
 * audio.js — microphone capture and FFT analysis engine
 *
 * Author  : KRANK
 * Version : 0.1.0
 * License : MIT
 *
 * Wraps the Web Audio API. A single AnalyserNode reads from the mic stream
 * and exposes a 16-band frequency snapshot + scalar volume on every frame.
 * The caller is responsible for requesting mic permission before calling init().
 */

export class AudioEngine {
    constructor() {
        this._ctx      = null;
        this._analyser = null;
        this._data     = null;
        this.ready     = false;
    }

    /**
     * Request microphone access, build the audio graph.
     * Must be called from a user-gesture context.
     * @returns {Promise<void>}
     */
    async init() {
        const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
        this._ctx      = new (window.AudioContext || window.webkitAudioContext)();
        this._analyser = this._ctx.createAnalyser();
        this._analyser.fftSize                = 64;
        this._analyser.smoothingTimeConstant  = 0.7;
        this._ctx.createMediaStreamSource(stream).connect(this._analyser);
        this._data  = new Uint8Array(this._analyser.frequencyBinCount);
        this.ready  = true;
    }

    /**
     * Read the current frequency snapshot.
     * Safe to call even before init() — returns silent values.
     *
     * @param  {number} gain  Scalar multiplier (default 1.0).
     * @returns {{ vol: number, freqs: number[] }}
     *   vol   — averaged volume 0..255
     *   freqs — 16-element array of frequency amplitudes 0..255
     */
    read(gain = 1.0) {
        if (!this.ready) return { vol: 0, freqs: new Array(16).fill(0) };
        this._analyser.getByteFrequencyData(this._data);

        const freqs = Array.from({ length: 16 }, (_, i) =>
            Math.min(255, this._data[i] * gain)
        );
        const vol = Math.min(255, Math.floor(freqs.reduce((a, b) => a + b, 0) / 16));
        return { vol, freqs };
    }
}
