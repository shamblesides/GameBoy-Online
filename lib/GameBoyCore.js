import { pulse } from './channel1.js';
import { wav } from './channel3.js';
import { noise } from './channel4.js';

const channels = [
	pulse(),
	pulse(),
	wav(),
	noise(),
];

/*
 JavaScript GameBoy Color Emulator
 Copyright (C) 2010-2016 Grant Galitz

 Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/** @type {AudioContext} */
const ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'});
export function allow() {
	ctx.resume();
}

let lastVolume = 1;
const userVolumeNode = ctx.createGain();
userVolumeNode.gain.setValueAtTime(lastVolume, ctx.currentTime)
userVolumeNode.connect(ctx.destination);
export function changeUserVolume(newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		userVolumeNode.gain.setValueAtTime(lastVolume, ctx.currentTime)
		userVolumeNode.gain.linearRampToValueAtTime(newVolume, ctx.currentTime + 0.05)
		lastVolume = newVolume;
	}
}

//Sound variables:
let VinLeftChannelMasterVolume = 8;
let VinRightChannelMasterVolume = 8;
//Pre-multipliers to cache some calculations:
const clocksPerSecond = 0x400000;
const audioResamplerFirstPassFactor = Math.round(clocksPerSecond / ctx.sampleRate);
// TODO isnt this the same as the above..?
const gbFramesPerSampleFrame = 0x60; // roughly 0x400000/44100 (clock speed / audio sampling speed)
// not sure why 30, but /8 is the max VinXChannelMasterVolume
// and the /2 is because originally the gb soundchip expects samples in a range of (0,1)
// which we can turn into (-.5,.5) BUT this causes audio pop whenever we start the emulator
// so we settle for (0,.5) instead.
const downSampleInputDivider = 1 / (audioResamplerFirstPassFactor * 30) / 8 / 2;

// AudioContext nodes
const scriptProcessor = ctx.createScriptProcessor(1024, 0, 2);
scriptProcessor.connect(userVolumeNode);
scriptProcessor.onaudioprocess = function (event) {
	const out1 = event.outputBuffer.getChannelData(0);
	const out2 = event.outputBuffer.getChannelData(1);

	for (let i = 0; i < scriptProcessor.bufferSize; ++i) {
		const sample = generateAudio();
		out1[i] = (sample >>> 16) * VinLeftChannelMasterVolume * downSampleInputDivider
		out2[i] = (sample & 0xFFFF) * VinRightChannelMasterVolume * downSampleInputDivider
		// if (i%256 === 0) console.log(`${i.toString(16).padStart(4,0)} sample === ${sample.toString(2).padStart(32,0)}`)
	}
};

export function play(newSong, loopPoint=-1) {
	const split = splitSong(newSong, loopPoint);
	for (let i = 0; i < 4; ++i) {
		generators[i].play(split.tracks[i], split.loopPoints[i]);
	}
}
export function playFile(arrayBuffer) {
	// make sure the 4-byte header is correct.
	// It should be "Vgm " (space at the end)
  const header = new Uint8Array(arrayBuffer, 0, 4);
  for (let i = 0; i < 4; ++i) {
    if (header[i] !== 'Vgm '[i].charCodeAt()) {
      throw new Error('Invalid header');
    }
  }
  // get where vgm data starts. this is 
  // (address of where vgm offset is stored, always 0x34)
  // + (value of vgm offset.)
  const data0 = 0x34 + new Uint32Array(arrayBuffer, 0x34, 1)[0];
  // the loop point works similarly
	const loopPoint = 0x1c + new Uint32Array(arrayBuffer, 0x1c, 1)[0] - data0;
  // finally, the rest of the file is the data
	const data = new Uint8Array(arrayBuffer, data0);
	
	play(data, loopPoint);
	// let x = splitSong(data, loopPoint);
	// console.log(x.loopPoints)
	// play(x.tracks[0], x.loopPoints[0]);
}

function generateAudio() {
	return generators[0].generateAudio()
	+ generators[1].generateAudio()
	+ generators[2].generateAudio()
	+ generators[3].generateAudio();
}
const generators = channels.map(channel => {
let sequencerClocks = 0x2000;
let sequencePosition = 0;
let audioClocksUntilNextEvent = 1;
let audioClocksUntilNextEventCounter = 1;

let song = null;
let songIdx = -1;
let songTimer = 0;
let songLoopPoint = -1;
function songDoDelay(t) {
	songTimer += t * gbFramesPerSampleFrame;
}
function play(newSong, loopPoint) {
	song = newSong;
	songIdx = 0;
	songTimer = 0;
	songLoopPoint = loopPoint;
}
function generateAudio() {
	let downsampleInput = 0;
	for (let downsampledFramesLeft = audioResamplerFirstPassFactor; downsampledFramesLeft > 0;) {
		while (songTimer === 0 && songIdx >= 0) {
			if (songIdx >= song.length) {
				songIdx = songLoopPoint;
				if (songIdx === -1) break;
			}
			const op = song[songIdx++];
			if (op === 0xB3) { // gameboy apu register write
				const reg = song[songIdx++] + 0x10;
				const val = song[songIdx++];
				memoryHighWrite(reg, val);
			} else if (op === 0x61) {
				const t = (song[songIdx++]) + (song[songIdx++] << 8); 
				songDoDelay(t)
			} else if (op === 0x62) {
				songDoDelay(735); // exactly 44100/60
			} else if ((op&0xF0) === 0x70) {
				songDoDelay(1+(op&0xf))
			} else if (op === 0x66) {
				songIdx = songLoopPoint;
			} else {
				throw new Error('What is op ' + op.toString(16))
			}
		}
		if (sequencerClocks == 0) {
			sequencePosition++;
			channel.audioComputeSequencer(sequencePosition);
			sequencerClocks = 0x2000;
		}
		if (audioClocksUntilNextEventCounter == 0) {
			//Clock down the four audio channels to the next closest audio event:
			channel.computeAudioChannels(audioClocksUntilNextEvent);
			//Find the number of clocks to next closest counter event:
			audioClocksUntilNextEvent = channel.audioClocksUntilNextEvent();
			audioClocksUntilNextEventCounter = audioClocksUntilNextEvent;
		}

		const multiplier = Math.min(
			audioClocksUntilNextEventCounter,
			sequencerClocks,
			downsampledFramesLeft,
			(songIdx >= 0) ? songTimer : Infinity,
		);
		if (!(multiplier > 0)) {
			throw new Error('multipler should greater than 0')
		}
		audioClocksUntilNextEventCounter -= multiplier;
		sequencerClocks -= multiplier;
		downsampledFramesLeft -= multiplier;
		songTimer -= multiplier;

		downsampleInput += channel.output * multiplier;
	}
	return downsampleInput;
}
return { play, generateAudio };
});

function splitSong(uArray, origLoop=-1) {
	const outs = [1,1,1,1].map(() => new Uint8Array(uArray.length));
	const idxs = [0,0,0,0];
	let loopPoints = [-1,-1,-1,-1];
	for (let i = 0; i < uArray.length;) {
		if (i === origLoop) {
			loopPoints = idxs.slice();
		}
		let bytes = 0;
		const op = uArray[i+bytes++];
		if (op === 0x66) break;
		if (op === 0xB3) {
			const reg = uArray[i+bytes++] + 0x10;
			const val = uArray[i+bytes++];

			let ch = -1;
			if (reg <= 0x14) ch = 0;
			else if (reg <= 0x19) ch = 1;
			else if (reg <= 0x1E) ch = 2;
			else if (reg <= 0x23) ch = 3;
			else if (reg >= 0x30) ch = 2;

			if (ch !== -1) {
				for (let j = 0; j < bytes; ++j) {
					outs[ch][idxs[ch]++] = uArray[i]
					++i;
				}
				continue;
			}
		}

		if (op === 0x61) bytes = 3;

		for (let j = 0; j < bytes; ++j) {
			for (let ch = 0; ch < 4; ++ch) {
				outs[ch][idxs[ch]++] = uArray[i]
			}
			++i;
		}
	}
	return {
		tracks: outs.map((arr,i) => arr.slice(0, idxs[i])),
		loopPoints,
	};
}

export function memoryHighWrite(address, data) {
	//Act as a wrapper for writing by compiled jumps to specific memory writing functions.
	var fn = memoryHighWriter[address&0xFF];
	if (fn) fn(data);
	else throw new Error(`Unsupported register write: FF${address.toString(16).padStart(2,0)}`)
	// console.log(`FF${address.toString(16).padStart(2)} <= ${data}`)
}
const memoryHighWriter = {
	0x10: channels[0].setMem[0x0],
	0x11: channels[0].setMem[0x1],
	0x12: channels[0].setMem[0x2],
	0x13: channels[0].setMem[0x3],
	0x14: channels[0].setMem[0x4],

	0x16: channels[1].setMem[0x1],
	0x17: channels[1].setMem[0x2],
	0x18: channels[1].setMem[0x3],
	0x19: channels[1].setMem[0x4],

	0x1A: channels[2].setMem[0x0],
	0x1B: channels[2].setMem[0x1],
	0x1C: channels[2].setMem[0x2],
	0x1D: channels[2].setMem[0x3],
	0x1E: channels[2].setMem[0x4],

	0x20: channels[3].setMem[0x1],
	0x21: channels[3].setMem[0x2],
	0x22: channels[3].setMem[0x3],
	0x23: channels[3].setMem[0x4],

	//NR50:
	0x24(data) {
		VinLeftChannelMasterVolume = ((data >> 4) & 0x07) + 1;
		VinRightChannelMasterVolume = (data & 0x07) + 1;
		// mixerOutputLevelCache();
	},
	//NR51:
	0x25(data) {
		channels[0].lr(!!(data & 0x10), !!(data & 0x01));
		channels[1].lr(!!(data & 0x20), !!(data & 0x02));
		channels[2].lr(!!(data & 0x40), !!(data & 0x04));
		channels[3].lr(data > 0x7F, !!(data & 0x08));
	},
	//NR52:
	0x26() {
		// ignore
	},

	//Wavetable:
	0x30: channels[2].setMem[0x30],
	0x31: channels[2].setMem[0x31],
	0x32: channels[2].setMem[0x32],
	0x33: channels[2].setMem[0x33],
	0x34: channels[2].setMem[0x34],
	0x35: channels[2].setMem[0x35],
	0x36: channels[2].setMem[0x36],
	0x37: channels[2].setMem[0x37],
	0x38: channels[2].setMem[0x38],
	0x39: channels[2].setMem[0x39],
	0x3A: channels[2].setMem[0x3A],
	0x3B: channels[2].setMem[0x3B],
	0x3C: channels[2].setMem[0x3C],
	0x3D: channels[2].setMem[0x3D],
	0x3E: channels[2].setMem[0x3E],
	0x3F: channels[2].setMem[0x3F],
}

/**
 * Convenience method for setting entire wavetable at once
 * @param {*} bytes 
 */
export function setWaveTable(bytes) {
	channels[2].setWaveTable(bytes);
}
