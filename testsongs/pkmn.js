import * as notes from '../lib/notes';
import data from './pkmn/routes3.js';

const lines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
let track = [];
export const tracks = [track];
const labels = {};

const samples = '02468ACEFFFEEDDCCBA9876544332211'.split('').map(d => parseInt(d, 16));
let octave = 5;
let volume = 13;
let fade = 3;
let duty = 2;
let tempo = 160;
let notespeed = 12;

for (const line of lines) {
	if (line.endsWith(':')) {
		const [, label] = line.match(/(.*?):+$/);
		labels[label] = track.length;
		continue;
	}

	const [cmd, ...argStr] = line.split(/,? /g);
	const args = argStr.map(n => +n);

	if (cmd === 'endchannel') {
	} else if (cmd === 'loopchannel') {
		track.splice(labels[argStr[1]], 0, 'LOOPSTART')
		track = [];
		tracks.push(track);
	} else if (cmd === 'octave') {
		octave = args[0]+2;
	} else if (cmd === 'notetype') {
		notespeed = args[0];
		volume = args[1];
		fade = args[2];
	} else if (cmd === 'dspeed') {
		notespeed = args[0];
	} else if (cmd === 'note') {
		const note = argStr[0].charAt(0);
		const sharp = ({'_':'','#':'s'})[argStr[0].charAt(1)];
		const freq = notes[note + sharp + octave] || notes.C3;
		track.push({ freq, volume, fade, duty, samples, length: note==='_' ? 0 : Infinity });
		track.push(800*tempo/0x100000*args[1]);
	} else if (cmd.match(/^[A-G][_#]$/)) {
		const note = cmd.charAt(0);
		const sharp = ({'_':'','#':'s'})[cmd.charAt(1)];
		const freq = notes[note + sharp + octave];
		track.push({ freq, volume, fade, duty, samples });
		track.push(867*tempo/0x100000*args[0]*notespeed/12);
	} else if (cmd === 'rest') {
		track.push({ volume: 0, length: 0 });
		track.push(867*tempo/0x100000*args[0]*notespeed/12);
	} else if (cmd.startsWith('mutedsnare')) {
		// TODO find actual mutedsnare sfx
		track.push({ freq: 1<<8, volume: 6, fade: 1 });
		track.push(867*tempo/0x100000*args[0]*notespeed/12);
	} else if (cmd === 'tempo') {
		tempo = args[0];
	} else if (cmd === 'vibrato') {

	} else if (cmd === 'duty') {
		duty = args[0];
	} else if (cmd === 'volume') {

	} else if (cmd === 'toggleperfectpitch') {

	} else {
		throw new Error('Unknown command: ' + line);
	}
}

// export function pkmn() {
// 	tracks.slice(0,-1).forEach((track, n) => gb.play(n, track));
// }
