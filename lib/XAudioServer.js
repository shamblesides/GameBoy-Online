import { t_end } from "./test";

//2010-2013 Grant Galitz - XAudioJS realtime audio output compatibility library:

let buffer;
let bufferStart = 0;
let bufferEnd = 0;

const numChannels = 2;
let volume = 1;

export function init(bufferSize) {
	bufferSize &= -numChannels; // round to nearest multiple of numChannels
    buffer = new Float32Array(bufferSize);

	/** @type {AudioContext} */
	const ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'});

	const scriptProcessor = ctx.createScriptProcessor(2048, 0, numChannels);

	scriptProcessor.onaudioprocess = function (event) {
		const outs = [event.outputBuffer.getChannelData(0), event.outputBuffer.getChannelData(1)]

		if (buffer[bufferStart] !== -1) t_end();

		for (let i = 0; i < scriptProcessor.bufferSize; ++i) {
			outs.forEach(out => out[i] =
				(bufferStart != bufferEnd) ?
				buffer[bufferStart++] * volume :
				0
			);
			if (bufferStart == buffer.length) {
				bufferStart = 0;
			}
		}

		if (bufferStart === bufferEnd) console.log('underrun');
	};

    scriptProcessor.connect(ctx.destination);
}

export function writeAudioNoCallback(inputBuffer) {
	// write to end of ring buffer
	for (let i = 0; i < inputBuffer.length; i++) {
		buffer[bufferEnd++] = inputBuffer[i];
		if (bufferEnd == buffer.length) {
			bufferEnd = 0;
		}
		if (bufferEnd == bufferStart) {
			bufferStart += numChannels;
			if (bufferStart == buffer.length) {
				bufferStart = 0;
			}
		}
	}
}
//Developer can use this to see how many samples to write (example: minimum buffer allotment minus remaining samples left returned from this function to make sure maximum buffering is done...)
export function remainingBuffer() {
	return ((bufferStart <= bufferEnd) ? 0 : buffer.length) + bufferEnd - bufferStart;
}

export function changeVolume(newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		volume = newVolume;
	}
}
