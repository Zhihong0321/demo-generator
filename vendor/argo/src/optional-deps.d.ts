/**
 * Ambient declarations for argo's optional TTS/music dependencies.
 *
 * These packages are `optionalDependencies` and are NOT installed by default —
 * the MiniMax engine needs none of them, and `@huggingface/transformers` alone
 * pulls in onnxruntime-node, which is larger than the rest of the install
 * combined.
 *
 * Every use site imports them dynamically (`await import(...)`) inside a
 * try/catch that prints an actionable "install this package" message, so the
 * code is already safe when they are absent. Only the compiler needed telling.
 *
 * Install them if you want a local engine:
 *   npm install @huggingface/transformers kokoro-js
 */
declare module '@huggingface/transformers';
declare module 'kokoro-js';
