import * as gameboy from '../lib/GameBoyCore.js';
import vgmURL from './vgm/friendly_battle.vgm'

function checkHeader(buf) {
  const header = new Uint8Array(buf, 0, 4);
  for (let i = 0; i < 4; ++i) {
    if (header[i] !== 'Vgm '[i].charCodeAt()) {
      throw new Error('Invalid header');
    }
  }
}

export const songLoaded = fetch(vgmURL)
.then(res => res.arrayBuffer())
.then(buf => {
  checkHeader(buf);
  // get where vgm data starts. this is 
  // (address of where vgm offset is stored, always 0x34)
  // + (value of vgm offset.)
  const data0 = 0x34 + new Uint32Array(buf, 0x34, 1)[0];
  const loopPoint = 0x1c + new Uint32Array(buf, 0x1c, 1)[0] - data0;
  const data = new Uint8Array(buf, data0);

  const song = [];
  const gbFramesPerSampleFrame = 0x60; // roughly 0x400000/44100 (clock speed / audio sampling speed)
  function wait(t) {
    song.push(t * gbFramesPerSampleFrame);
  }
  for (let i = 0; i < data.length;) {
    if (i === loopPoint) {
      song.push('LOOPSTART')
    }
    const op = data[i++];
    if (op === 0xB3) { // gameboy apu register write
      const reg = data[i++] + 0x10;
      const val = data[i++];

      song.push(() => gameboy.memoryHighWrite(reg, val));
    } else if (op === 0x61) {
      wait(((data[i++]) + (data[i++] << 8)) | 0);
    } else if (op === 0x62) {
      wait(44100/60);
    } else if (op === 0x66) {
      break;
    } else if ((op&0xF0) === 0x70) {
      wait(1+(op&0xf))
    } else {
      throw new Error('What is op ' + op.toString(16))
    }
  }
  return song;
})