//2010-2013 Grant Galitz - XAudioJS realtime audio output compatibility library:

//Some Required Globals:
let sourceSampleRate;

let sampleBuffer = [];
let minBufferSize = 15000;
let maxBufferSize = 25000;

const numChannels = 2;
let volume = 1;

let currentBufferSize = 0;
let resampleBufferStart = 0;
let resampleBufferEnd = 0;
let resamplerBufferSize = 0;

const samplesPerCallback = 2048;			//Has to be between 2048 and 4096 (If over, then samples are ignored, if under then silence is added).

export function init(_sampleRate, _minBufferSize, _maxBufferSize) {
	sourceSampleRate = _sampleRate;
	minBufferSize = (_minBufferSize >= (samplesPerCallback * numChannels) && _minBufferSize < _maxBufferSize) ? (_minBufferSize & (-numChannels)) : (samplesPerCallback * numChannels);
	maxBufferSize = (Math.floor(_maxBufferSize) > minBufferSize + numChannels) ? (_maxBufferSize & (-numChannels)) : (minBufferSize * numChannels);
	initializeWebAudio();
}

export function writeAudioNoCallback(inputBuffer) {
	//Callback-centered audio APIs:
	var inputBufferLength = inputBuffer.length;
	for (let i = 0; i < inputBufferLength && currentBufferSize < maxBufferSize;) {
		sampleBuffer[currentBufferSize++] = inputBuffer[i++];
	}
}
//Developer can use this to see how many samples to write (example: minimum buffer allotment minus remaining samples left returned from this function to make sure maximum buffering is done...)
export function remainingBuffer() {
	const resampledSamplesLeft = ((resampleBufferStart <= resampleBufferEnd) ? 0 : resamplerBufferSize) + resampleBufferEnd - resampleBufferStart;
	return (Math.floor(resampledSamplesLeft / numChannels) * numChannels) + currentBufferSize;
}

function initializeWebAudio() {
	const ctx = new AudioContext();								//Create a system audio context.
	const scriptProcessor = ctx.createScriptProcessor(samplesPerCallback, 0, numChannels);	//Create the js event node.

	scriptProcessor.onaudioprocess = function (event) {		//Web Audio API callback...
		//Find all output channels:
		const outputBuffers = [event.outputBuffer.getChannelData(0), event.outputBuffer.getChannelData(1)]
		//Make sure we have resampled samples ready:
		if (currentBufferSize > 0) {
			//Resample a chunk of audio:
			const bufferSamples = sampleBuffer.slice(0, currentBufferSize);
			var resampleLength = bufferSamples.length;
			var resampledResult = bufferSamples;
			for (let i = 0; i < resampleLength; i++) {
				resampledBuffer[resampleBufferEnd++] = resampledResult[i];
				if (resampleBufferEnd == resamplerBufferSize) {
					resampleBufferEnd = 0;
				}
				if (resampleBufferStart == resampleBufferEnd) {
					resampleBufferStart += numChannels;
					if (resampleBufferStart == resamplerBufferSize) {
						resampleBufferStart = 0;
					}
				}
			}
			currentBufferSize = 0;
		}
		//Copy samples from XAudioJS to the Web Audio API:
		for (let i = 0; i < samplesPerCallback; ++i) {
			outputBuffers.forEach(buffer => buffer[i] =
				(resampleBufferStart != resampleBufferEnd) ?
				resampledBuffer[resampleBufferStart++] * volume :
				0
			);
			if (resampleBufferStart == resamplerBufferSize) {
				resampleBufferStart = 0;
			}
		}
	};																			//Connect the audio processing event to a handling function so we can manipulate output
    scriptProcessor.connect(ctx.destination);									//Send and chain the output of the audio manipulation to the system audio output.

	const destSampleRate = ctx.sampleRate;
    sampleBuffer = new Float32Array(maxBufferSize);
    resamplerBufferSize = Math.max(maxBufferSize * Math.ceil(destSampleRate / sourceSampleRate) + numChannels, samplesPerCallback * numChannels);
    const resampledBuffer = new Float32Array(resamplerBufferSize);
}

export function changeVolume(newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		volume = newVolume;
	}
}
