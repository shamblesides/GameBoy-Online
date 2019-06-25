import * as gameboy from '../lib/index.js';

const str1 =
	`octave 3
	B_ 4
	octave 4
	C_ 2
	D_ 4
	G_ 2
	D_ 2
	C_ 2
	octave 3
	B_ 4
	G_ 2
	octave 4
	D_ 4
	D_ 2
	C_ 2
	octave 3
	B_ 2
	rest 2
	B_ 2
	octave 4
	C_ 2
	octave 3
	B_ 2
	octave 4
	C_ 8
	rest 2
	octave 3
	B_ 2
	octave 4
	C_ 2
	octave 3
	A_ 2
	B_ 2
	G_ 2
	A_ 2
	F# 2
	B_ 4
	octave 4
	C_ 2
	D_ 4
	G_ 2
	D_ 2
	C_ 2
	octave 3
	B_ 4
	G_ 2
	octave 4
	D_ 4
	D_ 2
	G_ 2
	F# 2
	E_ 4
	D_ 2
	C_ 4
	octave 3
	A_ 2
	B_ 2
	octave 4
	C_ 2
	D_ 2
	C_ 2
	octave 3
	B_ 2
	A_ 2
	G_ 4
	F# 4
	octave 4
	C_ 2
	octave 3
	G_ 2
	E_ 2
	G_ 2
	octave 4
	D_ 2
	octave 3
	A_ 2
	F# 2
	A_ 2
	notetype 12, 11, 3
	B_ 2
	G_ 2
	D_ 2
	G_ 2
	B_ 2
	G_ 2
	D_ 2
	G_ 2
	octave 4
	C_ 2
	octave 3
	G_ 2
	E_ 2
	G_ 2
	octave 4
	D_ 2
	octave 3
	A_ 2
	F# 2
	A_ 2
	B_ 2
	G_ 2
	D_ 2
	G_ 2
	B_ 2
	G_ 2
	D_ 2
	G_ 2
	A_ 2
	E_ 2
	C_ 2
	E_ 2
	A_ 2
	E_ 2
	C_ 2
	E_ 2
	A_ 2
	E_ 2
	C_ 2
	E_ 2
	A_ 2
	E_ 2
	C_ 2
	E_ 2
	F# 2
	D_ 2
	C_ 2
	D_ 2
	G_ 2
	E_ 2
	C_ 2
	E_ 2
	G_ 2
	E_ 2
	C_ 2
	E_ 2
	F# 2
	D_ 2
	C_ 2
	D_ 2`

const str2 =
	`notetype 12, 13, 3
	octave 5
	D_ 2
	notetype 12, 10, 3
	C_ 2
	notetype 12, 13, 3
	octave 4
	B_ 2
	notetype 12, 11, 3
	A_ 2
	notetype 12, 13, 3
	octave 5
	G_ 2
	notetype 12, 11, 3
	E_ 2
	notetype 12, 13, 3
	F# 2
	E_ 2
	D_ 6
	octave 4
	B_ 2
	G_ 2
	G_ 2
	A_ 2
	B_ 2
	octave 5
	C_ 10
	octave 4
	F# 2
	G_ 2
	A_ 2
	B_ 6
	octave 5
	C_ 1
	octave 4
	B_ 1
	A_ 8
	octave 5
	D_ 2
	notetype 12, 10, 3
	C_ 2
	notetype 12, 13, 3
	octave 4
	B_ 2
	notetype 12, 11, 3
	octave 5
	D_ 2
	notetype 12, 13, 3
	G_ 2
	notetype 12, 10, 3
	F# 2
	notetype 12, 11, 3
	F# 2
	notetype 12, 13, 3
	G_ 2
	E_ 6
	D_ 2
	D_ 8
	C_ 2
	octave 4
	B_ 2
	A_ 2
	G_ 2
	octave 5
	D_ 2
	C_ 2
	octave 4
	B_ 2
	A_ 2
	G_ 10
	G_ 2
	A_ 2
	B_ 2
	octave 5
	C_ 8
	D_ 6
	C_ 2
	octave 4
	B_ 8
	rest 2
	G_ 2
	A_ 2
	B_ 2
	octave 5
	C_ 4
	C_ 4
	D_ 6
	C_ 1
	D_ 1
	octave 4
	B_ 8
	rest 2
	B_ 2
	A_ 2
	G_ 2
	A_ 8
	E_ 4
	B_ 4
	A_ 8
	G_ 4
	E_ 4
	F# 8
	G_ 4
	B_ 4
	B_ 8
	A_ 8`;

const str3 = 
	`octave 4
	G_ 6
	E_ 6
	F# 4
	G_ 6
	A_ 6
	G_ 4
	E_ 6
	F# 6
	E_ 4
	G_ 6
	E_ 6
	D_ 4
	G_ 6
	E_ 6
	F# 4
	G_ 6
	A_ 6
	G_ 4
	E_ 6
	F# 6
	A_ 4
	G_ 6
	E_ 6
	D_ 4
	C_ 8
	D_ 8
	G_ 8
	E_ 4
	D_ 4
	C_ 8
	D_ 8
	G_ 8
	A_ 4
	G_ 4
	E_ 8
	A_ 8
	E_ 8
	G_ 8
	F# 8
	E_ 8
	E_ 8
	F# 8`

function track1() {
	let octave = 5;
	let volume = 13;
	let fade = 3;
	const data = str1
		.split('\n')
	.map(line => line.trim().split(/,? /g))
	.map(([cmd, ...args]) => {
		if (cmd === 'octave') return [() => octave = +args[0]+2];
		else if (cmd === 'notetype') return [() => ([, volume, fade] = args.map(n => +n))];
		else if (cmd === 'rest') return [() => gameboy.pulse1({volume:0}), 0x80000*args[0]]
		else return [() => gameboy.pulse1({ freq: gameboy[cmd.charAt(0)+({_:'','#':'s'})[cmd.charAt(1)]+octave], volume, fade, duty: 2 }), 0x80000*args[0]]
	})
	.reduce((arr, x) => arr.concat(x));

	return data;
}

function track2() {
	let octave = 5;
	let volume = 13;
	let fade = 3;
	const data = str2
		.split('\n')
		.map(line => line.trim().split(/,? /g))
		.map(([cmd, ...args]) => {
			if (cmd === 'octave') return [() => octave = +args[0]+2];
			else if (cmd === 'notetype') return [() => ([, volume, fade] = args.map(n => +n))];
			else if (cmd === 'rest') return [() => gameboy.pulse2({volume:0}), 0x80000*args[0]]
			else return [() => gameboy.pulse2({ freq: gameboy[cmd.charAt(0)+({_:'','#':'s'})[cmd.charAt(1)]+octave], volume, fade, duty: 2 }), 0x80000*args[0]]
		})
		.reduce((arr, x) => arr.concat(x));

	return data;
}

function track3() {
	let octave = 5;
	const data = str3
	.split('\n')
	.map(line => line.trim().split(/,? /g))
	.map(([cmd, ...args]) => {
		if (cmd === 'octave') return [() => octave = +args[0]+2];
		else if (cmd === 'rest') return [0x80000*args[0]]
		else return [() => gameboy.wave1({ freq: gameboy[cmd.charAt(0)+({_:'','#':'s'})[cmd.charAt(1)]+octave] }), 0x80000*args[0]]
	})
	.reduce((arr, x) => arr.concat(x));

	return data;
}

function lace(...tracks) {
	const out = [];
	while (true) {
		for (const track of tracks) {
			while (typeof track[0] !== 'number' && track.length > 0) out.push(track.shift());
		}
		tracks = tracks.filter(t => t.length > 0);
		if (tracks.length === 0) break;
		const rest = tracks.map(t => t[0]).reduce((min, n) => Math.min(min, n));
		for (const track of tracks) {
			track[0] -= rest;
			if (track[0] === 0) track.shift();
		}
		out.push(rest)
	}
	return out;
}

export const pallet = lace(
    [() => {
        gameboy.setWaveTable([
            0x02,0x46,0x8A,0xCE,0xFF,0xFE,0xED,0xDC,0xCB,0xA9,0x87,0x65,0x44,0x33,0x22,0x11
		]);
	},
	gameboy.loopStart,
    ],
    track1(),
    track2(),
    track3()
);
