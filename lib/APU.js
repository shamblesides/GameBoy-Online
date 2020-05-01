import 'audioworklet-polyfill';
import workletSource from './GameBoyCore.worklet.js';

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

const workletBlob = new Blob([workletSource], { type: 'application/javascript' });
const workletURL = URL.createObjectURL(workletBlob);
const nodePromise = ctx.audioWorklet.addModule(workletURL).then(() => {
  const node = new AudioWorkletNode(ctx, 'gameboy-processor', {outputChannelCount:[2]})
  node.connect(userVolumeNode)
  return node;
})

let nextInstanceId;
export function track(data, loop=-1, channels=Array(4).fill(true)) {
  return {
    play() {
      let id = ++nextInstanceId;
      nodePromise.then(node => {
        node.port.postMessage({ id, type: 'play', data, loop, channels });
      });
      return {
        pause() {
          node.port.postMessage({ id, type: 'pause' });
        },
        resume() {
          node.port.postMessage({ id, type: 'resume' });
        },
      }
    }
  }
}

export function fromFile(arrayBuffer) {
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
  const data = arrayBuffer.slice(data0);
	
	return track(data, loopPoint);
}

// function setWaveTable(bytes) {
//   if (bytes.length !== 16 || !bytes.every(n => n >= 0 && n <= 0xFF)) {
//     throw new Error('Expected 32 samples with values 0-255')
//   }
//   for (let i = 0; i < 16; ++i) {
//     setWaveTableByte(i, bytes[i])
//   }
// }

