import * as gameboy from '../lib/index.js';
import { C5, E5, G5 } from '../lib/index.js';

const samples = '02468ACEFFFEEDDCCBA9876544332211'.split('').map(d => parseInt(d, 16));

const tone = (freq) => () => {
	gameboy.pulse2({ freq, duty: 2, volume: 15, fade: 1 })

	gameboy.pulse1({ freq: freq+10, duty: 3, volume: 9, fade: 1 })

	gameboy.wave1({ freq, length: 32, samples });

	gameboy.noise1({ volume: 7, fade: 1, buzzy: true });
}

export const success = [
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
];
