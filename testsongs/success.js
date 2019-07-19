import { C5, E5, G5 } from '../lib/notes.js';

const samples = '02468ACEFFFEEDDCCBA9876544332211'.split('').map(d => parseInt(d, 16));

export const tracks = [
	{ duty: 3, volume: 9, fade: 1 },
	{ duty: 2, volume: 15, fade: 1 },
	{ length: 32, samples },
	{ volume: 7, fade: 1, buzzy: true }
].map((instr, ch) => {
	const track = [[C5, 0xC0000], [E5, 0x80000], [G5, 0xC0000], [C5, 0x80000], [E5, 0xC0000], [G5, 0x80000]]
		.map(([freq, delay]) => [{ ...instr, freq: [freq+10,freq,freq,undefined][ch] }, delay])
		.reduce((arr, x) => arr.concat(x));

	return track;
});
