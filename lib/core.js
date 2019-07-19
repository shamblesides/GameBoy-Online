import { pulse } from './channel1.js';
import { wav } from './channel3.js';
import { noise } from './channel4.js';

const channels = [pulse(), pulse(), wav(), noise()]

export const loopStart = {};

let tracks = [];
let currentTracks;
function updateCurrentTracks() {
	currentTracks = [0,1,2,3].map(n => tracks.find(t => t.channel === channels[n])).filter(t=>t);
}
export function play(channel, instructions) {
	const track = {
		channel: channels[channel],
		looping: false,
		instructions,
	};
	tracks.unshift(track);
	updateCurrentTracks();
	return () => track.instructions = [];
}

//Below are the audio generation functions timed against the CPU:
function generateAudio() {
	for (const t of tracks) {
		while (t.instructions.length > 0 && !(t.instructions[0] > 0)) {
			if (t.instructions[0] === loopStart) {
				t.looping = true;
				t.instructions.shift();
			} else if (typeof t.instructions[0] === 'object') {
				if (currentTracks.includes(t)) t.channel.play(t.instructions[0]);

				if (t.looping) t.instructions.push(t.instructions.shift());
				else t.instructions.shift();
			} else if (t.instructions[0] === 0) {
				t.instructions.shift();
			} else {
				throw new Error("Unknown token in song: " + t.instructions[0])
			}
		}
	}

	// calculate how many clock cycles to advance
	const multiplier = Math.min.apply(null, tracks.filter(t=>t.instructions[0] > 0).map(t => t.instructions[0]));

	// advance all tracks
	for (const track of tracks) {
		if (track.instructions[0] >= multiplier) {
			track.instructions[0] -= multiplier;
			if (track.instructions[0] === 0) track.instructions.shift();
			if (track.looping) {
				if (typeof track.instructions[track.instructions.length-1] === 'number') {
					track.instructions[track.instructions.length-1] += multiplier;
				} else {
					track.instructions.push(multiplier);
				}
			}
		}
	}

	// remove dead tracks (move to while loop up there)
	if (tracks.some(t => t.instructions.length === 0)) {
		tracks = tracks.filter(t => t.instructions.length > 0);
		updateCurrentTracks();
	}
}
