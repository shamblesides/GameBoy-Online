import * as gameboy from './lib/GameBoyCore.js';
import { C5, E5, G5 } from './notes.js';

// gameboy.changeUserVolume(0.5);

// l vol (-LLL) / r vol (-RRR)
// gameboy.memoryHighWrite(0x24, 0b00010001)
// mixer (LLLL RRRR) for (1234)
gameboy.memoryHighWrite(0x25, 0b11111111);

// wave channel
gameboy.setWaveTable([
	0x02,0x46,0x8A,0xCE,0xFF,0xFE,0xED,0xDC,0xCB,0xA9,0x87,0x65,0x44,0x33,0x22,0x11
]);

const tone = (note) => () => {
	gameboy.resume();
	// duty DD, lenght? LLLLLL
	// gameboy.memoryHighWrite(0x16, 0b10111111)
	// start volume VVVV, direction A (+/- =1/0), period PPP
	gameboy.memoryHighWrite(0x17, 0b11110001)
	// pitch low
	// gameboy.memoryHighWrite(0x18, note&255);
	// trigger 1, something? 0, --- pitch high HHH
	// gameboy.memoryHighWrite(0x19, 0b10000000 + (note>>8))
	gameboy.pulse2.duty(2)
	gameboy.pulse2.play(note);

	// duty DD, lenght? LLLLLL
	// gameboy.memoryHighWrite(0x11, 0b11111111)
	// start volume VVVV, direction A (+/- =1/0), period PPP
	gameboy.memoryHighWrite(0x12, 0b10010001)
	// pitch low
	// gameboy.memoryHighWrite(0x13, (note+10)&255);
	// trigger 1, something? 0, --- pitch high HHH
	// gameboy.memoryHighWrite(0x14, 0b10000000 + (note+10>>8))
	gameboy.pulse1.duty(3)
	gameboy.pulse1.play(note+10);

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

gameboy.play([
	tone(C5),
	0xC0000,
	tone(E5),
	0x80000,
	tone(G5),
	0xC0000,
	tone(C5),
	0x80000,
	tone(E5),
	0xC0000,
	tone(G5),
	0x80000,
])

const colors = ['rgb(255, 238, 0)', 'rgb(255, 138, 0)'];
function mousedown() {
	gameboy.resume();
	const i = colors.indexOf(document.body.style.backgroundColor);
	document.body.style.backgroundColor = colors[(i+1)%colors.length]
	tone(C5)();
}
window.addEventListener('mousedown', mousedown);
window.addEventListener('touchstart', mousedown);
