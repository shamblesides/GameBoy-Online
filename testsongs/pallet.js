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
			if (cmd === 'octave') { octave = +args[0]+2; return null }
			else if (cmd === 'notetype') { ([, volume, fade] = args.map(n => +n)); return null }
			else if (cmd === 'rest') return [{volume:0}, 0x80000*args[0]]
			else return [{ freq: gameboy[cmd.charAt(0)+({_:'','#':'s'})[cmd.charAt(1)]+octave], volume, fade, duty: 2 }, 0x80000*args[0]]
		})
		.filter(n => n != null)
		.reduce((arr, x) => arr.concat(x));

	gameboy.play(0, [gameboy.loopStart, ...data]);
}

function track2() {
	let octave = 5;
	let volume = 13;
	let fade = 3;
	const data = str2
		.split('\n')
		.map(line => line.trim().split(/,? /g))
		.map(([cmd, ...args]) => {
			if (cmd === 'octave') { octave = +args[0]+2; return null }
			else if (cmd === 'notetype') { ([, volume, fade] = args.map(n => +n)); return null }
			else if (cmd === 'rest') return [{volume:0}, 0x80000*args[0]]
			else return [{ freq: gameboy[cmd.charAt(0)+({_:'','#':'s'})[cmd.charAt(1)]+octave], volume, fade, duty: 2 }, 0x80000*args[0]]
		})
		.filter(n => n != null)
		.reduce((arr, x) => arr.concat(x));

	gameboy.play(1, [gameboy.loopStart, ...data]);
}

function track3() {
	let octave = 5;
	const samples = '02468ACEFFFEEDDCCBA9876544332211'.split('').map(d => parseInt(d, 16));
	const data = str3
		.split('\n')
		.map(line => line.trim().split(/,? /g))
		.map(([cmd, ...args]) => {
			if (cmd === 'octave') { octave = +args[0]+2; return null }
			else return [{ samples, freq: gameboy[cmd.charAt(0)+({_:'','#':'s'})[cmd.charAt(1)]+octave] }, 0x80000*args[0]]
		})
		.filter(n => n != null)
		.reduce((arr, x) => arr.concat(x));

	gameboy.play(2, [gameboy.loopStart, ...data]);
}

export function pallet() {
	track1();
	track2();
	track3();
}
