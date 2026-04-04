/* AudioWorklet processor — runs in a dedicated audio thread.
   Converts float32 mic samples to PCM16 and posts them to the main thread. */
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferLen = 0;
    this._chunkSize = 4096; // match the old ScriptProcessor buffer size
  }

  process(inputs) {
    var input = inputs[0];
    if (!input || !input[0]) return true;

    var samples = input[0];
    this._buffer.push(new Float32Array(samples));
    this._bufferLen += samples.length;

    if (this._bufferLen >= this._chunkSize) {
      // Merge accumulated buffers into one chunk
      var merged = new Float32Array(this._bufferLen);
      var offset = 0;
      for (var i = 0; i < this._buffer.length; i++) {
        merged.set(this._buffer[i], offset);
        offset += this._buffer[i].length;
      }
      this._buffer = [];
      this._bufferLen = 0;

      // Convert float32 -> PCM16
      var pcm16 = new Int16Array(merged.length);
      for (var j = 0; j < merged.length; j++) {
        var s = Math.max(-1, Math.min(1, merged[j]));
        pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }

    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
