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

  const doReg = {
    //PULSE1
    0xff10: null,
    0xff11: [0, (val) => ({
      duty: val>>>6,
      length: 64-(val&0x3F),
    })],
    0xff12: [0, (val) => ({
      volume: val>>>4,
      fade: (val&7) * ((val&8)?-1:1)
    })],
    0xff13: [0, (val, {freq=0}) => ({freq:(freq&0x0700)|val})],
    0xff14: [0, (val, {freq=0}) => ({
      freq:(freq&0x00FF)|((val&7)<<8),
      trigger:!!(val&0x80),
      _enlen:!!(val&0x40),
    })],
    
    //PULSE2
    0xff15: null,
    0xff16: [1, (val) => ({
      duty: val>>>6,
      length: 64-(val&0x3F),
    })],
    0xff17: [1, (val) => ({
      volume: val>>>4,
      fade: (val&7) * ((val&8)?-1:1)
    })],
    0xff18: [1, (val, {freq=0}) => ({freq:(freq&0x0700)|val})],
    0xff19: [1, (val, {freq=0}) => ({
      freq:(freq&0x00FF)|((val&7)<<8),
      trigger:!!(val&0x80),
      _enlen:!!(val&0x40),
    })],

    //WAV
    0xff1a: [2, (val) => ({
      _disabled: !!(val&0x80),
    })],
    0xff1b: [2, (val) => ({
      length:256-val
    })],
    0xff1c: [2, (val) => ({
      // z:console.log(val),
      dampen:[4,0,1,2][(val>>5)&3]})],
    0xff1d: [2, (val, {freq=0}) => ({freq:(freq&0x0700)|val})],
    0xff1e: [2, (val, {freq=0}) => ({
      freq:(freq&0x00FF)|((val&7)<<8),
      trigger:!!(val&0x80),
      _enlen:!!(val&0x40),
    })],
    0xff30: [2, (val,{samples}) => ({samples:Object.assign([],samples,{0:val&0x0F,1:(val&0xF0)>>4})})],
    0xff31: [2, (val,{samples}) => ({samples:Object.assign([],samples,{2:val&0x0F,3:(val&0xF0)>>4})})],
    0xff32: [2, (val,{samples}) => ({samples:Object.assign([],samples,{4:val&0x0F,5:(val&0xF0)>>4})})],
    0xff33: [2, (val,{samples}) => ({samples:Object.assign([],samples,{6:val&0x0F,7:(val&0xF0)>>4})})],
    0xff34: [2, (val,{samples}) => ({samples:Object.assign([],samples,{8:val&0x0F,9:(val&0xF0)>>4})})],
    0xff35: [2, (val,{samples}) => ({samples:Object.assign([],samples,{10:val&0x0F,11:(val&0xF0)>>4})})],
    0xff36: [2, (val,{samples}) => ({samples:Object.assign([],samples,{12:val&0x0F,13:(val&0xF0)>>4})})],
    0xff37: [2, (val,{samples}) => ({samples:Object.assign([],samples,{14:val&0x0F,15:(val&0xF0)>>4})})],
    0xff38: [2, (val,{samples}) => ({samples:Object.assign([],samples,{16:val&0x0F,17:(val&0xF0)>>4})})],
    0xff39: [2, (val,{samples}) => ({samples:Object.assign([],samples,{18:val&0x0F,19:(val&0xF0)>>4})})],
    0xff3a: [2, (val,{samples}) => ({samples:Object.assign([],samples,{20:val&0x0F,21:(val&0xF0)>>4})})],
    0xff3b: [2, (val,{samples}) => ({samples:Object.assign([],samples,{22:val&0x0F,23:(val&0xF0)>>4})})],
    0xff3c: [2, (val,{samples}) => ({samples:Object.assign([],samples,{24:val&0x0F,25:(val&0xF0)>>4})})],
    0xff3d: [2, (val,{samples}) => ({samples:Object.assign([],samples,{26:val&0x0F,27:(val&0xF0)>>4})})],
    0xff3e: [2, (val,{samples}) => ({samples:Object.assign([],samples,{28:val&0x0F,29:(val&0xF0)>>4})})],
    0xff3f: [2, (val,{samples}) => ({samples:Object.assign([],samples,{30:val&0x0F,31:(val&0xF0)>>4})})],

    //NOISE
    0xff1f: null,
    0xff20: [3, (val) => ({
      length: 64-(val&0b00111111),
    })],
    0xff21: [3, (val) => ({
      // z: console.log(val.toString(16)),
      volume: (val>>>4),
      fade: (val&7) * ((val&8)?-1:1)
    })],
    0xff22: [3, (val) => ({
      z: console.log(val.toString(2).padStart(8,0)),
      buzzy: !!(val&8),
      freq: (val&7)<<(val>>>4),
    })],
    0xff23: [3, (val) => ({
      trigger:!!(val&0x80),
      _enlen:!!(val&0x40),
    })],

    //MISC
    // 0xff25: [5, (val) => [
    //   {left:!!(val&0x80),right:!!(val&0x08)},
    //   {left:!!(val&0x40),right:!!(val&0x04)},
    //   {left:!!(val&0x20),right:!!(val&0x02)},
    //   {left:!!(val&0x10),right:!!(val&0x01)},
    // ]],
  }

  const data = new Uint8Array(buf, data0);
  const trax = [
    [[{}, 0]],
    [[{}, 0]],
    [[{}, 0]],
    [[{}, 0]],
  ]
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    if (op === 0xB3) { // gameboy apu register write
      const reg = data[i++] + 0xFF10;
      const val = data[i++];

      if (!doReg[reg]) {
        console.warn(`ignoring register ${reg.toString(16)}=${val.toString(16)} at ${i}`);
        continue;
      }
      const [chan, fn] = doReg[reg];
      const track = trax[chan];

      if (track[track.length-1][1] > 0) {
        const cmd = track[track.length-1][0];
        if (Object.keys(cmd).length === 0) {
          cmd.length = 0;
        }
        track.push([Object.assign({}, cmd, {trigger:true}), 0]);

        if (!cmd._enlen) delete cmd.length;
        if (cmd._disabled) cmd.length=0;
      }

      const cmd = track[track.length-1][0];
      Object.assign(cmd, fn(val, cmd));
    } else if (op === 0x61) {
      const t = (1/44100) * ((data[i++]) + (data[i++] << 8));
      trax.forEach(track => {
        track[track.length-1][1] += t;
      })
    } else if (op === 0x62) {
      const t = (1/44100) * (44100/60); // don't simplify! floating point weirdness, but basically 1/60
      trax.forEach(track => {
        track[track.length-1][1] += t;
      })
    // } else if (op === 0x63) {
    //   cmds.push(['wait', 882]);
    } else if (op === 0x66) {
      break;
    } else if ((op&0xF0) === 0x70) {
      const t = (1/44100) * (1+(op&0x0F));
      trax.forEach(track => {
        track[track.length-1][1] += t;
      })
    } else {
      throw new Error('What is op ' + op.toString(16))
    }
  }
  return trax.map(track => track.flat());
})