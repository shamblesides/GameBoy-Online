import { GameBoyCore } from './GameBoyCore.js';

const C3 = 44
const Cs3 = 156
const D3 = 262
const Ds3 = 363
const E3 = 457
const F3 = 547
const Fs3 = 631
const G3 = 710
const Gs3 = 786
const A3 = 854
const As3 = 923
const B3 = 986
const C4 = 1046
const Cs4 = 1102
const D4 = 1155
const Ds4 = 1205
const E4 = 1253
const F4 = 1297
const Fs4 = 1339
const G4 = 1379
const Gs4 = 1417
const A4 = 1452
const As4 = 1486
const B4 = 1517
const C5 = 1546
const Cs5 = 1575
const D5 = 1602
const Ds5 = 1627
const E5 = 1650
const F5 = 1673
const Fs5 = 1694
const G5 = 1714
const Gs5 = 1732
const A5 = 1750
const As5 = 1767
const B5 = 1783
const C6 = 1798
const Cs6 = 1812
const D6 = 1825
const Ds6 = 1837
const E6 = 1849
const F6 = 1860
const Fs6 = 1871
const G6 = 1881
const Gs6 = 1890
const A6 = 1899
const As6 = 1907
const B6 = 1915
const C7 = 1923
const Cs7 = 1930
const D7 = 1936
const Ds7 = 1943
const E7 = 1949
const F7 = 1954
const Fs7 = 1959
const G7 = 1964
const Gs7 = 1969
const A7 = 1974
const As7 = 1978
const B7 = 1982
const C8 = 1985
const Cs8 = 1988
const D8 = 1992
const Ds8 = 1995
const E8 = 1998
const F8 = 2001
const Fs8 = 2004
const G8 = 2006
const Gs8 = 2009
const A8 = 2011
const As8 = 2013
const B8 = 2015

window.addEventListener("DOMContentLoaded", function() {
	const mainCanvas = document.createElement('canvas');
	mainCanvas.style.display = 'none';
	document.body.appendChild(mainCanvas);

	console.log("windowingInitialize() called.", 0);
	var xhr = new XMLHttpRequest();
	xhr.open("GET", "/empty-truncated.gb");
	xhr.responseType = "blob";
	xhr.onload = function () {
		var blob = new Blob([this.response], { type: "text/plain" });
		var binaryHandle = new FileReader();
		binaryHandle.onload = function () {
			if (this.readyState === 2) {
				start(mainCanvas, this.result);
			}
		};
		binaryHandle.readAsBinaryString(blob);
	};
	xhr.send();
});

function start(canvas, ROM) {
	const gameboy = new GameBoyCore(canvas, ROM);
	gameboy.start();

	gameboy.stopEmulator &= 1;
	console.log("Starting the iterator.", 0);
	window.requestAnimationFrame(function loop() {
		gameboy.run();
		window.requestAnimationFrame(loop);
	});

	const notes = [C5, D5, E5, D5, C5, D5, E5];

	window.setInterval(() => {
		if (notes.length > 0) tone(notes.shift())
	}, 200)

	const tone = (note) => {
		// sound on
		gameboy.memoryHighWrite(0x26, 0b10000000)
		// l vol (-LLL) / r vol (-RRR)
		gameboy.memoryHighWrite(0x24, 0b00010001)
		// mixer (LLLL RRRR) for (1234)
		gameboy.memoryHighWrite(0x25, 0b11111111)
		// duty DD, lenght? LLLLLL
		gameboy.memoryHighWrite(0x16, 0b10111111)
		// start volume VVVV, direction A (+/- =1/0), period PPP
		gameboy.memoryHighWrite(0x17, 0b11110001)
		// pitch low
		gameboy.memoryHighWrite(0x18, note&255);
		// trigger 1, something? 0, --- pitch high HHH
		gameboy.memoryHighWrite(0x19, 0b10000000 + (note>>8))
	}
}
