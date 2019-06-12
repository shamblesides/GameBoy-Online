import { Resampler } from './resampler.js'

//2010-2013 Grant Galitz - XAudioJS realtime audio output compatibility library:
export function XAudioServer(channels, sampleRate, minBufferSize, maxBufferSize, underRunCallback, volume, failureCallback) {
	XAudioJSChannelsAllocated = Math.max(channels, 1);
	this.XAudioJSSampleRate = Math.abs(sampleRate);
	XAudioJSMinBufferSize = (minBufferSize >= (XAudioJSSamplesPerCallback * XAudioJSChannelsAllocated) && minBufferSize < maxBufferSize) ? (minBufferSize & (-XAudioJSChannelsAllocated)) : (XAudioJSSamplesPerCallback * XAudioJSChannelsAllocated);
	XAudioJSMaxBufferSize = (Math.floor(maxBufferSize) > XAudioJSMinBufferSize + XAudioJSChannelsAllocated) ? (maxBufferSize & (-XAudioJSChannelsAllocated)) : (XAudioJSMinBufferSize * XAudioJSChannelsAllocated);
	this.underRunCallback = (typeof underRunCallback == "function") ? underRunCallback : function () {};
	XAudioJSVolume = (volume >= 0 && volume <= 1) ? volume : 1;
	this.failureCallback = (typeof failureCallback == "function") ? failureCallback : function () { throw(new Error("XAudioJS has encountered a fatal error.")); };
	this.initializeAudio();
}
XAudioServer.prototype.MOZWriteAudioNoCallback = function (buffer) {
    //Resample before passing to the moz audio api:
    var bufferLength  = buffer.length;
    for (var bufferIndex = 0; bufferIndex < bufferLength;) {
        var sliceLength = Math.min(bufferLength - bufferIndex, XAudioJSMaxBufferSize);
        for (var sliceIndex = 0; sliceIndex < sliceLength; ++sliceIndex) {
            XAudioJSAudioContextSampleBuffer[sliceIndex] = buffer[bufferIndex++];
        }
        var resampleLength = XAudioJSResampleControl.resampler(XAudioJSGetArraySlice(XAudioJSAudioContextSampleBuffer, sliceIndex));
        if (resampleLength > 0) {
            var resampledResult = XAudioJSResampleControl.outputBuffer;
            var resampledBuffer = XAudioJSGetArraySlice(resampledResult, resampleLength);
            this.samplesAlreadyWritten += this.audioHandleMoz.mozWriteAudio(resampledBuffer);
        }
    }
}
XAudioServer.prototype.callbackBasedWriteAudioNoCallback = function (buffer) {
	//Callback-centered audio APIs:
	var length = buffer.length;
	for (var bufferCounter = 0; bufferCounter < length && XAudioJSAudioBufferSize < XAudioJSMaxBufferSize;) {
		XAudioJSAudioContextSampleBuffer[XAudioJSAudioBufferSize++] = buffer[bufferCounter++];
	}
}
/*Pass your samples into here!
Pack your samples as a one-dimenional array
With the channel samples packed uniformly.
examples:
    mono - [left, left, left, left]
    stereo - [left, right, left, right, left, right, left, right]
*/
XAudioServer.prototype.writeAudio = function (buffer) {
	this.callbackBasedWriteAudioNoCallback(buffer);
	this.callbackBasedExecuteCallback();
}
/*Pass your samples into here if you don't want automatic callback calling:
Pack your samples as a one-dimenional array
With the channel samples packed uniformly.
examples:
    mono - [left, left, left, left]
    stereo - [left, right, left, right, left, right, left, right]
Useful in preventing infinite recursion issues with calling writeAudio inside your callback.
*/
XAudioServer.prototype.writeAudioNoCallback = function (buffer) {
			this.callbackBasedWriteAudioNoCallback(buffer);
}
//Developer can use this to see how many samples to write (example: minimum buffer allotment minus remaining samples left returned from this function to make sure maximum buffering is done...)
//If null is returned, then that means metric could not be done.
XAudioServer.prototype.remainingBuffer = function () {
			return (Math.floor((XAudioJSResampledSamplesLeft() * XAudioJSResampleControl.ratioWeight) / XAudioJSChannelsAllocated) * XAudioJSChannelsAllocated) + XAudioJSAudioBufferSize;
}
XAudioServer.prototype.MOZExecuteCallback = function () {
	//mozAudio:
	var samplesRequested = XAudioJSMinBufferSize - this.remainingBuffer();
	if (samplesRequested > 0) {
		this.MOZWriteAudioNoCallback(this.underRunCallback(samplesRequested));
	}
}
XAudioServer.prototype.callbackBasedExecuteCallback = function () {
	//WebKit /Flash Audio:
	var samplesRequested = XAudioJSMinBufferSize - this.remainingBuffer();
	if (samplesRequested > 0) {
		this.callbackBasedWriteAudioNoCallback(this.underRunCallback(samplesRequested));
	}
}
//If you just want your callback called for any possible refill (Execution of callback is still conditional):
XAudioServer.prototype.executeCallback = function () {
			this.callbackBasedExecuteCallback();
}
//DO NOT CALL THIS, the lib calls this internally!
XAudioServer.prototype.initializeAudio = function () {
        try {
            this.initializeWebAudio();
        }
        catch (error) {
        }
}
XAudioServer.prototype.initializeWebAudio = function () {
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
    try {
        XAudioJSWebAudioAudioNode = XAudioJSWebAudioContextHandle.createScriptProcessor(XAudioJSSamplesPerCallback, 0, XAudioJSChannelsAllocated);	//Create the js event node.
    }
    catch (error) {
        XAudioJSWebAudioAudioNode = XAudioJSWebAudioContextHandle.createJavaScriptNode(XAudioJSSamplesPerCallback, 0, XAudioJSChannelsAllocated);	//Create the js event node.
    }
    XAudioJSWebAudioAudioNode.onaudioprocess = XAudioJSWebAudioEvent;																			//Connect the audio processing event to a handling function so we can manipulate output
    XAudioJSWebAudioAudioNode.connect(XAudioJSWebAudioContextHandle.destination);																//Send and chain the output of the audio manipulation to the system audio output.
    this.resetCallbackAPIAudioBuffer(XAudioJSWebAudioContextHandle.sampleRate);
    /*
     Firefox has a bug in its web audio implementation...
     The node may randomly stop playing on Mac OS X for no
     good reason. Keep a watchdog timer to restart the failed
     node if it glitches. Google Chrome never had this issue.
     */
    XAudioJSWebAudioWatchDogLast = (new Date()).getTime();
    if (navigator.userAgent.indexOf('Gecko/') > -1) {
        if (XAudioJSWebAudioWatchDogTimer) {
            clearInterval(XAudioJSWebAudioWatchDogTimer);
        }
        var parentObj = this;
        XAudioJSWebAudioWatchDogTimer = setInterval(function () {
            var timeDiff = (new Date()).getTime() - XAudioJSWebAudioWatchDogLast;
            if (timeDiff > 500) {
                parentObj.initializeWebAudio();
            }
        }, 500);
    }
}
XAudioServer.prototype.changeVolume = function (newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		XAudioJSVolume = newVolume;
	}
}
//Set up the resampling:
XAudioServer.prototype.resetCallbackAPIAudioBuffer = function (APISampleRate) {
	XAudioJSAudioBufferSize = XAudioJSResampleBufferEnd = XAudioJSResampleBufferStart = 0;
    this.initializeResampler(APISampleRate);
    XAudioJSResampledBuffer = this.getFloat32(XAudioJSResampleBufferSize);
}
XAudioServer.prototype.initializeResampler = function (sampleRate) {
    XAudioJSAudioContextSampleBuffer = this.getFloat32(XAudioJSMaxBufferSize);
    XAudioJSResampleBufferSize = Math.max(XAudioJSMaxBufferSize * Math.ceil(sampleRate / this.XAudioJSSampleRate) + XAudioJSChannelsAllocated, XAudioJSSamplesPerCallback * XAudioJSChannelsAllocated);
	XAudioJSResampleControl = new Resampler(this.XAudioJSSampleRate, sampleRate, XAudioJSChannelsAllocated, XAudioJSResampleBufferSize, true);
}
XAudioServer.prototype.getFloat32 = function (size) {
	try {
		return new Float32Array(size);
	}
	catch (error) {
		return [];
	}
}
//Some Required Globals:
var XAudioJSWebAudioContextHandle = null;
var XAudioJSWebAudioAudioNode = null;
var XAudioJSWebAudioWatchDogTimer = null;
var XAudioJSWebAudioWatchDogLast = false;
var XAudioJSWebAudioLaunchedContext = false;
var XAudioJSAudioContextSampleBuffer = [];
var XAudioJSResampledBuffer = [];
var XAudioJSMinBufferSize = 15000;
var XAudioJSMaxBufferSize = 25000;
var XAudioJSChannelsAllocated = 1;
var XAudioJSVolume = 1;
var XAudioJSResampleControl = null;
var XAudioJSAudioBufferSize = 0;
var XAudioJSResampleBufferStart = 0;
var XAudioJSResampleBufferEnd = 0;
var XAudioJSResampleBufferSize = 0;
var XAudioJSSamplesPerCallback = 2048;			//Has to be between 2048 and 4096 (If over, then samples are ignored, if under then silence is added).
function XAudioJSWebAudioEvent(event) {		//Web Audio API callback...
	if (XAudioJSWebAudioWatchDogTimer) {
		XAudioJSWebAudioWatchDogLast = (new Date()).getTime();
	}
	//Find all output channels:
	for (var bufferCount = 0, buffers = []; bufferCount < XAudioJSChannelsAllocated; ++bufferCount) {
		buffers[bufferCount] = event.outputBuffer.getChannelData(bufferCount);
	}
	//Make sure we have resampled samples ready:
	XAudioJSResampleRefill();
	//Copy samples from XAudioJS to the Web Audio API:
	for (var index = 0; index < XAudioJSSamplesPerCallback && XAudioJSResampleBufferStart != XAudioJSResampleBufferEnd; ++index) {
		for (bufferCount = 0; bufferCount < XAudioJSChannelsAllocated; ++bufferCount) {
			buffers[bufferCount][index] = XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] * XAudioJSVolume;
		}
		if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
			XAudioJSResampleBufferStart = 0;
		}
	}
	//Pad with silence if we're underrunning:
	while (index < XAudioJSSamplesPerCallback) {
		for (bufferCount = 0; bufferCount < XAudioJSChannelsAllocated; ++bufferCount) {
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
				XAudioJSResampleBufferStart += XAudioJSChannelsAllocated;
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