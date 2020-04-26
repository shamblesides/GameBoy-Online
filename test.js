import { tracks } from './testsongs/success.js';
import * as pkmn from './testsongs/pkmn.js';
// import { tracks } from './testsongs/trill.js';
import { songLoaded } from './testsongs/vgm.js';
import * as gbs from './lib/index.js';
import { C4 } from './lib/notes.js';

window.addEventListener('mousedown', gbs.allow);
window.addEventListener('touchstart', gbs.allow);

gbs.changeUserVolume(1);

// gbs.renderAll(tracks).play();
songLoaded.then(trax => {
	gbs.renderAll(trax).play();
})

function addButton(name, fn) {
	const button = document.createElement('button');
	button.innerText = name;
	button.style.cssText = `display: block; width: 200px; margin: 10px auto; padding: 20px 0;`
	button.addEventListener('click', fn);

	document.body.appendChild(button);
}

const bumpTrack = gbs.render(0, [{ freq: C4, sweepFactor: -2, fade: 1, duty: 2 }, 0.5]);
let stopHandle = null;
addButton('Bump', () => {
	if (stopHandle) {
		clearInterval(stopHandle);
		stopHandle = null;
	} else {
		bumpTrack.play();
		stopHandle = setInterval(() => bumpTrack.play(), 350);
	}
});

for (const [k, v] of Object.entries(pkmn)) {
	const x = gbs.renderAll(v);
	addButton(k, () => x.play());
}
