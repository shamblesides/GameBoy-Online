import { Resampler } from './resampler.js'

//Some Required Globals:
var xSampleRate;

var XAudioJSWebAudioContextHandle = null;
var XAudioJSWebAudioAudioNode = null;
var XAudioJSWebAudioLaunchedContext = false;
var XAudioJSAudioContextSampleBuffer = [];
var XAudioJSResampledBuffer = [];
var XAudioJSMinBufferSize = 15000;
var XAudioJSMaxBufferSize = 25000;
var numChannels = 2;
var XAudioJSVolume = 1;
var XAudioJSResampleControl = null;
var XAudioJSAudioBufferSize = 0;
var XAudioJSResampleBufferStart = 0;
var XAudioJSResampleBufferEnd = 0;
var XAudioJSResampleBufferSize = 0;
var XAudioJSSamplesPerCallback = 2048;			//Has to be between 2048 and 4096 (If over, then samples are ignored, if under then silence is added).

export function init(sampleRate, minBufferSize, maxBufferSize) {
	xSampleRate = sampleRate;
	XAudioJSMinBufferSize = (minBufferSize >= (XAudioJSSamplesPerCallback * numChannels) && minBufferSize < maxBufferSize) ? (minBufferSize & (-numChannels)) : (XAudioJSSamplesPerCallback * numChannels);
	XAudioJSMaxBufferSize = (Math.floor(maxBufferSize) > XAudioJSMinBufferSize + numChannels) ? (maxBufferSize & (-numChannels)) : (XAudioJSMinBufferSize * numChannels);
	initializeWebAudio();
}

//2010-2013 Grant Galitz - XAudioJS realtime audio output compatibility library:
function callbackBasedWriteAudioNoCallback(buffer) {
	//Callback-centered audio APIs:
	var length = buffer.length;
	for (var bufferCounter = 0; bufferCounter < length && XAudioJSAudioBufferSize < XAudioJSMaxBufferSize;) {
		XAudioJSAudioContextSampleBuffer[XAudioJSAudioBufferSize++] = buffer[bufferCounter++];
	}
}
/*Pass your samples into here if you don't want automatic callback calling:
Pack your samples as a one-dimenional array
With the channel samples packed uniformly.
examples:
    mono - [left, left, left, left]
    stereo - [left, right, left, right, left, right, left, right]
Useful in preventing infinite recursion issues with calling writeAudio inside your callback.
*/
export function writeAudioNoCallback(buffer) {
			callbackBasedWriteAudioNoCallback(buffer);
}
//Developer can use this to see how many samples to write (example: minimum buffer allotment minus remaining samples left returned from this function to make sure maximum buffering is done...)
//If null is returned, then that means metric could not be done.
export function remainingBuffer() {
			return (Math.floor((XAudioJSResampledSamplesLeft() * XAudioJSResampleControl.ratioWeight) / numChannels) * numChannels) + XAudioJSAudioBufferSize;
}
function initializeWebAudio() {
	if (!XAudioJSWebAudioLaunchedContext) {
        try {
            XAudioJSWebAudioContextHandle = new AudioContext();								//Create a system audio context.
        }
        catch (error) {
            XAudioJSWebAudioContextHandle = new webkitAudioContext();							//Create a system audio context.
        }
        XAudioJSWebAudioLaunchedContext = true;
    }
    if (XAudioJSWebAudioAudioNode) {
        XAudioJSWebAudioAudioNode.disconnect();
        XAudioJSWebAudioAudioNode.onaudioprocess = null;
        XAudioJSWebAudioAudioNode = null;
    }
	XAudioJSWebAudioAudioNode = XAudioJSWebAudioContextHandle.createScriptProcessor(XAudioJSSamplesPerCallback, 0, numChannels);	//Create the js event node.

	XAudioJSWebAudioAudioNode.onaudioprocess = XAudioJSWebAudioEvent;																			//Connect the audio processing event to a handling function so we can manipulate output
    XAudioJSWebAudioAudioNode.connect(XAudioJSWebAudioContextHandle.destination);																//Send and chain the output of the audio manipulation to the system audio output.

    resetCallbackAPIAudioBuffer(XAudioJSWebAudioContextHandle.sampleRate);
}
export function changeVolume(newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		XAudioJSVolume = newVolume;
	}
}
//Set up the resampling:
function resetCallbackAPIAudioBuffer(APISampleRate) {
	XAudioJSAudioBufferSize = XAudioJSResampleBufferEnd = XAudioJSResampleBufferStart = 0;
    initializeResampler(APISampleRate);
    XAudioJSResampledBuffer = new Float32Array(XAudioJSResampleBufferSize);
}
function initializeResampler(sampleRate) {
    XAudioJSAudioContextSampleBuffer = new Float32Array(XAudioJSMaxBufferSize);
    XAudioJSResampleBufferSize = Math.max(XAudioJSMaxBufferSize * Math.ceil(sampleRate / xSampleRate) + numChannels, XAudioJSSamplesPerCallback * numChannels);
	XAudioJSResampleControl = new Resampler(xSampleRate, sampleRate, numChannels, XAudioJSResampleBufferSize, true);
}
function XAudioJSWebAudioEvent(event) {		//Web Audio API callback...
	//Find all output channels:
	for (var bufferCount = 0, buffers = []; bufferCount < numChannels; ++bufferCount) {
		buffers[bufferCount] = event.outputBuffer.getChannelData(bufferCount);
	}
	//Make sure we have resampled samples ready:
	XAudioJSResampleRefill();
	//Copy samples from XAudioJS to the Web Audio API:
	for (var index = 0; index < XAudioJSSamplesPerCallback && XAudioJSResampleBufferStart != XAudioJSResampleBufferEnd; ++index) {
		for (bufferCount = 0; bufferCount < numChannels; ++bufferCount) {
			buffers[bufferCount][index] = XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] * XAudioJSVolume;
		}
		if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
			XAudioJSResampleBufferStart = 0;
		}
	}
	//Pad with silence if we're underrunning:
	while (index < XAudioJSSamplesPerCallback) {
		for (bufferCount = 0; bufferCount < numChannels; ++bufferCount) {
			buffers[bufferCount][index] = 0;
		}
		++index;
	}
}
function XAudioJSResampleRefill() {
	if (XAudioJSAudioBufferSize > 0) {
		//Resample a chunk of audio:
		var resampleLength = XAudioJSResampleControl.resampler(XAudioJSGetBufferSamples());
		var resampledResult = XAudioJSResampleControl.outputBuffer;
		for (var index2 = 0; index2 < resampleLength;) {
			XAudioJSResampledBuffer[XAudioJSResampleBufferEnd++] = resampledResult[index2++];
			if (XAudioJSResampleBufferEnd == XAudioJSResampleBufferSize) {
				XAudioJSResampleBufferEnd = 0;
			}
			if (XAudioJSResampleBufferStart == XAudioJSResampleBufferEnd) {
				XAudioJSResampleBufferStart += numChannels;
				if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
					XAudioJSResampleBufferStart = 0;
				}
			}
		}
		XAudioJSAudioBufferSize = 0;
	}
}
function XAudioJSResampledSamplesLeft() {
	return ((XAudioJSResampleBufferStart <= XAudioJSResampleBufferEnd) ? 0 : XAudioJSResampleBufferSize) + XAudioJSResampleBufferEnd - XAudioJSResampleBufferStart;
}
function XAudioJSGetBufferSamples() {
    return XAudioJSGetArraySlice(XAudioJSAudioContextSampleBuffer, XAudioJSAudioBufferSize);
}
function XAudioJSGetArraySlice(buffer, lengthOf) {
	//Typed array and normal array buffer section referencing:
	try {
		return buffer.subarray(0, lengthOf);
	}
	catch (error) {
		try {
			//Regular array pass:
			buffer.length = lengthOf;
			return buffer;
		}
		catch (error) {
			//Nightly Firefox 4 used to have the subarray function named as slice:
			return buffer.slice(0, lengthOf);
		}
	}
}