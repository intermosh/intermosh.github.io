// SharedArrayBuffer Total Size
export const SAB_TOTAL_SIZE = 2048;

// Byte offsets for SharedArrayBuffer zones
export const OFFSETS = {
  // Zone 0: Config (0 - 127)
  CONFIG_SAMPLE_RATE: 0,        // int32
  CONFIG_BUFFER_SIZE: 4,        // int32
  CONFIG_CANVAS_WIDTH: 8,       // int32
  CONFIG_CANVAS_HEIGHT: 12,     // int32
  CONFIG_CAMERA_WIDTH: 16,      // int32
  CONFIG_CAMERA_HEIGHT: 20,     // int32
  CONFIG_MAX_HANDS: 24,         // int32
  CONFIG_MODEL_COMPLEXITY: 28,  // int32
  CONFIG_MIN_DETECTION_CONF: 32,// int32 (fixed-point x1000)
  CONFIG_MIN_TRACKING_CONF: 36, // int32 (fixed-point x1000)
  CONFIG_SELECTED_EFFECT: 40,   // int32 (0-5, index of selected effect)

  // Zone 1: Right Hand (128 - 383)
  RIGHT_HAND_DETECTED: 128,     // int32 (1 or 0)
  RIGHT_FINGER_COUNT: 132,      // float32 (0.0 - 5.0)
  RIGHT_PALM_ROTATION: 136,     // float32 (-PI to +PI)
  RIGHT_WRIST_X: 140,           // float32
  RIGHT_WRIST_Y: 144,           // float32
  RIGHT_LANDMARKS: 148,         // float32[42] (21 x,y pairs)

  // Zone 2: Left Hand (384 - 639)
  LEFT_HAND_DETECTED: 384,      // int32 (1 or 0)
  LEFT_PINCH_DISTANCE: 388,     // float32 (0.0 - ~0.5)
  LEFT_PALM_ROTATION: 392,      // float32 (-PI to +PI)
  LEFT_WRIST_X: 396,            // float32
  LEFT_WRIST_Y: 400,            // float32
  LEFT_LANDMARKS: 404,          // float32[42] (21 x,y pairs)

  // Zone 3: Audio State (640 - 767)
  AUDIO_MASTER_VOLUME: 640,     // float32 (0.0 - 1.0)
  AUDIO_CURRENT_FREQ: 644,      // float32 (Hz)
  AUDIO_ACTIVE_CHORD_INDEX: 648,// int32 (0-4, -1)
  AUDIO_MAJOR_MINOR_MIX: 652,  // float32 (0.0=major, 1.0=minor)
  AUDIO_VIBRATO_RATE: 656,      // float32 (Hz)
  AUDIO_VIBRATO_DEPTH: 660,     // float32
  AUDIO_ENVELOPE_STATE: 664,    // float32
  AUDIO_OSCILLOSCOPE_BUFFER: 668// float32[25]
};

// TypedArray Index offsets (ByteOffset / 4)
export const INDEXES = {
  CONFIG_SAMPLE_RATE: 0,
  CONFIG_BUFFER_SIZE: 1,
  CONFIG_CANVAS_WIDTH: 2,
  CONFIG_CANVAS_HEIGHT: 3,
  CONFIG_CAMERA_WIDTH: 4,
  CONFIG_CAMERA_HEIGHT: 5,
  CONFIG_MAX_HANDS: 6,
  CONFIG_MODEL_COMPLEXITY: 7,
  CONFIG_MIN_DETECTION_CONF: 8,
  CONFIG_SELECTED_EFFECT: 10,
  CONFIG_ROOT_NOTE: 26,  // after chord frequencies (float32 11–25)

  RIGHT_HAND_DETECTED: 32,
  RIGHT_FINGER_COUNT: 33,
  RIGHT_PALM_ROTATION: 34,
  RIGHT_WRIST_X: 35,
  RIGHT_WRIST_Y: 36,
  RIGHT_LANDMARKS: 37,

  LEFT_HAND_DETECTED: 96,
  LEFT_PINCH_DISTANCE: 97,
  LEFT_PALM_ROTATION: 98,
  LEFT_WRIST_X: 99,
  LEFT_WRIST_Y: 100,
  LEFT_LANDMARKS: 101,

  AUDIO_MASTER_VOLUME: 160,
  AUDIO_CURRENT_FREQ: 161,
  AUDIO_ACTIVE_CHORD_INDEX: 162,
  AUDIO_MAJOR_MINOR_MIX: 163,
  AUDIO_VIBRATO_RATE: 164,
  AUDIO_VIBRATO_DEPTH: 165,
  AUDIO_ENVELOPE_STATE: 166,
  AUDIO_OSCILLOSCOPE_BUFFER: 167
};

// Chords configuration (A4 = 440 Hz)
export const CHORDS = [
  [261.63, 329.63, 392.00], // 1 finger:  C Major (C4, E4, G4)
  [349.23, 440.00, 523.25], // 2 fingers: F Major (F4, A4, C5)
  [392.00, 493.88, 587.33], // 3 fingers: G Major (G4, B4, D5)
  [440.00, 554.37, 659.25], // 4 fingers: A Major (A4, C#5, E5)
  [493.88, 622.25, 739.99]  // 5 fingers: B Major (B4, D#5, F#5)
];

export const CHORD_NAMES = ['C', 'F', 'G', 'A', 'B'];
export const CHORD_ROLES = ['Tónica', 'Cuarta', 'Quinta', 'Sexta', 'Séptima'];

// Gestural thresholds & audio constants
export const HYSTERESIS_THRESHOLD = 0.02;
export const PINCH_OPEN_THRESHOLD = 0.15;
export const PINCH_CLOSE_THRESHOLD = 0.03;

export const ATTACK_TIME = 0.05;   // 50 ms
export const RELEASE_TIME = 0.10;  // 100 ms

export const VIBRATO_BASE_RATE = 4.0;
export const VIBRATO_MAX_RATE = 12.0;
export const VIBRATO_MAX_DEPTH = 0.05;

export const OSCILLOSCOPE_BUFFER_SIZE = 25;

// MediaPipe Hand Skeleton connections (pairs of landmark indexes)
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],// Ring
  [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [0, 17]                                // Palm base
];
