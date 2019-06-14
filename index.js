import * as gameboy from './lib/GameBoyCore.js';

const [
	C3, Cs3, D3, Ds3, E3, F3, Fs3, G3, Gs3, A3, As3, B3,
	C4, Cs4, D4, Ds4, E4, F4, Fs4, G4, Gs4, A4, As4, B4,
	C5, Cs5, D5, Ds5, E5, F5, Fs5, G5, Gs5, A5, As5, B5,
	C6, Cs6, D6, Ds6, E6, F6, Fs6, G6, Gs6, A6, As6, B6,
	C7, Cs7, D7, Ds7, E7, F7, Fs7, G7, Gs7, A7, As7, B7,
	C8, Cs8, D8, Ds8, E8, F8, Fs8, G8, Gs8, A8, As8, B8,
] = Array(12*(8-3+1)).fill().map((_,i)=>Math.round(2048-2004*(.5**(i/12))));

const notes = Array(4).fill([C5, D5, E5, D5, C5, G5, B5]).reduce((arr,x)=>arr.concat(x));
let x = 0;
window.requestAnimationFrame(function loop() {
	gameboy.run();
	window.requestAnimationFrame(loop);
	if ((++x)%20===0 || x%20===6) tone(notes.shift())
});

// l vol (-LLL) / r vol (-RRR)
gameboy.memoryHighWrite(0x24, 0b00010001)
// mixer (LLLL RRRR) for (1234)
gameboy.memoryHighWrite(0x25, 0b11111111);

// wave channel
[0x02,0x46,0x8A,0xCE,0xFF,0xFE,0xED,0xDC,0xCB,0xA9,0x87,0x65,0x44,0x33,0x22,0x11].forEach((v, i) => {
	gameboy.memoryHighWrite(0x30+i, v);
});

const tone = (note) => {
	if (note == null) return;
	// duty DD, lenght? LLLLLL
	gameboy.memoryHighWrite(0x16, 0b10111111)
	// start volume VVVV, direction A (+/- =1/0), period PPP
	gameboy.memoryHighWrite(0x17, 0b11110001)
	// pitch low
	gameboy.memoryHighWrite(0x18, note&255);
	// trigger 1, something? 0, --- pitch high HHH
	gameboy.memoryHighWrite(0x19, 0b10000000 + (note>>8))

	// duty DD, lenght? LLLLLL
	gameboy.memoryHighWrite(0x11, 0b11111111)
	// start volume VVVV, direction A (+/- =1/0), period PPP
	gameboy.memoryHighWrite(0x12, 0b10010001)
	// pitch low
	gameboy.memoryHighWrite(0x13, (note+10)&255);
	// trigger 1, something? 0, --- pitch high HHH
	gameboy.memoryHighWrite(0x14, 0b10000000 + (note+10>>8))

	// wav
	// enable channel
	gameboy.memoryHighWrite(0x1a, 0b10000000)
	// sound length
	gameboy.memoryHighWrite(0x1b, 0b11100000)
	// volume -vv-----
	gameboy.memoryHighWrite(0x1c, 0b00100000)

	gameboy.memoryHighWrite(0x1d, note&255);
	// trigger 1, something? 0, --- pitch high HHH
	gameboy.memoryHighWrite(0x1e, 0b11000000 + (note>>8))


	// noise
	gameboy.memoryHighWrite(0x20, 0b00111111)
	gameboy.memoryHighWrite(0x21, 0b01110001)
	gameboy.memoryHighWrite(0x22, 0b00111111)
	gameboy.memoryHighWrite(0x23, 0b10000000);
}
