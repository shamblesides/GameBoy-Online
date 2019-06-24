import * as gameboy from '../lib/index.js';
import { C5, E5, G5 } from '../lib/index.js';

const tone = (freq) => () => {
	gameboy.pulse2({ freq, duty: 2, volume: 15, fade: 1 })

	gameboy.pulse1({ freq: freq+10, duty: 3, volume: 9, fade: 1 })

	gameboy.wave1({ freq, length: 32 });

	gameboy.noise1({ volume: 7, fade: 1, buzzy: true });
}

export const success = [
    () => {
        gameboy.setWaveTable([
            0x02,0x46,0x8A,0xCE,0xFF,0xFE,0xED,0xDC,0xCB,0xA9,0x87,0x65,0x44,0x33,0x22,0x11
        ]);
    },
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
