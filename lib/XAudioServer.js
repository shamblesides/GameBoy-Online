import { t_end } from "./test";

//2010-2013 Grant Galitz - XAudioJS realtime audio output compatibility library:

//Some Required Globals:
let sampleBuffer;
let maxBufferSize = 25000;

const numChannels = 2;
let volume = 1;

let currentBufferSize = 0;
let resampleBufferStart = 0;
let resampleBufferEnd = 0;

const samplesPerCallback = 2048;			//Has to be between 2048 and 4096 (If over, then samples are ignored, if under then silence is added).

export function init(_maxBufferSize) {
	maxBufferSize = _maxBufferSize & (-numChannels); // rounded to nearest multiple of numChannels
    sampleBuffer = new Float32Array(maxBufferSize);

	/** @type {AudioContext} */
	const ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'});	//Create a system audio context.
	const scriptProcessor = ctx.createScriptProcessor(samplesPerCallback, 0, numChannels);	//Create the js event node.

	scriptProcessor.onaudioprocess = function (event) {		//Web Audio API callback...
		//Find all output channels:
		const outputBuffers = [event.outputBuffer.getChannelData(0), event.outputBuffer.getChannelData(1)]
		//Copy samples from XAudioJS to the Web Audio API:
		// console.log('put '+resampledBuffer[resampleBufferStart])
		if (sampleBuffer[resampleBufferStart] !== -1) t_end();
		for (let i = 0; i < samplesPerCallback; ++i) {
			outputBuffers.forEach(buffer => buffer[i] =
				(resampleBufferStart != resampleBufferEnd) ?
				sampleBuffer[resampleBufferStart++] * volume :
				0
			);
			if (resampleBufferStart == maxBufferSize) {
				resampleBufferStart = 0;
			}
		}
		if (resampleBufferStart === resampleBufferEnd) console.log('underrun');
	};																			//Connect the audio processing event to a handling function so we can manipulate output
    scriptProcessor.connect(ctx.destination);									//Send and chain the output of the audio manipulation to the system audio output.
}

export function writeAudioNoCallback(inputBuffer) {
	// if (inputBuffer[0] !== -1) t_end();
	//Callback-centered audio APIs:
	var inputBufferLength = inputBuffer.length;
	for (let i = 0; i < inputBufferLength; i++) {
		sampleBuffer[resampleBufferEnd++] = inputBuffer[i];
		if (resampleBufferEnd == maxBufferSize) {
			resampleBufferEnd = 0;
		}
		if (resampleBufferEnd == resampleBufferStart) {
			resampleBufferStart += numChannels;
			if (resampleBufferStart == maxBufferSize) {
				resampleBufferStart = 0;
			}
		}
	}
}
//Developer can use this to see how many samples to write (example: minimum buffer allotment minus remaining samples left returned from this function to make sure maximum buffering is done...)
export function remainingBuffer() {
	const resampledSamplesLeft = ((resampleBufferStart <= resampleBufferEnd) ? 0 : maxBufferSize) + resampleBufferEnd - resampleBufferStart;
	return (Math.floor(resampledSamplesLeft / numChannels) * numChannels) + currentBufferSize;
}

export function changeVolume(newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		volume = newVolume;
	}
}
