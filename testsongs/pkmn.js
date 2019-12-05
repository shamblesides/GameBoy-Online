import * as notes from '../lib/notes';

export const cities1 = tracks(require('./pkmn/cities1').default);
export const cities2 = tracks(require('./pkmn/cities2').default);
export const gymleaderbattle = tracks(require('./pkmn/gymleaderbattle').default);
export const meeteviltrainer = tracks(require('./pkmn/meeteviltrainer').default);
export const meetfemaletrainer = tracks(require('./pkmn/meetfemaletrainer').default);
export const meetmaletrainer = tracks(require('./pkmn/meetmaletrainer').default);
export const pallet = tracks(require('./pkmn/pallet').default);
export const printer = tracks(require('./pkmn/printer').default);
export const routes2 = tracks(require('./pkmn/routes2').default);
export const routes3 = tracks(require('./pkmn/routes3').default);
export const routes4 = tracks(require('./pkmn/routes4').default);
export const surfing = tracks(require('./pkmn/surfing').default);
export const trainerbattle = tracks(require('./pkmn/trainerbattle').default);

function tracks(data) {
	const lines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
	let track = null;
	const tracks = [];
	const myTracks = [];
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
			if (track == null) {
				track = [];
				tracks.push(track);
				if (line.match(/Ch\d::$/)) {
					console.log(tracks.length, line);
					myTracks.push(track);
				}
			}
			const [, label] = line.match(/(.*?):+$/);
			labels[label] = track.length;
			continue;
		}

		const [cmd, ...argStr] = line.split(/,? /g);
		const args = argStr.map(n => +n);

		if (cmd === 'endchannel') {
			track = null;
		} else if (cmd === 'loopchannel') {
			if (args[0] > 0) {

			} else {
				track.splice(labels[argStr[1]], 0, 'LOOPSTART')
				track = null;
			}
		} else if (cmd === 'callchannel') {
			// track.push({ callchannel: argStr[0] })
		} else if (cmd === 'octave') {
			octave = args[0]+2;
		} else if (cmd === 'notetype') {
			notespeed = args[0];
			volume = args[1];
			fade = args[2] > 8 ? (args[2] - 20) : args[2];
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
		} else if (cmd.startsWith('snare')) {
			// TODO find actual snare sfx
			track.push({ freq: 1<<9, volume: 9, fade: 1 });
			track.push(867*tempo/0x100000*args[0]*notespeed/12);
		} else if (cmd.startsWith('triangle')) {
			// TODO find actual tri sfx
			track.push({ freq: 1<<9, volume: 9, fade: 1 });
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

	return myTracks;
}
