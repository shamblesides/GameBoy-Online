import { GameBoyCore } from './GameBoyCore.js';

window.addEventListener("DOMContentLoaded", function() {
	const mainCanvas = document.createElement('canvas');
	document.body.appendChild(mainCanvas);

	console.log("windowingInitialize() called.", 0);
	var xhr = new XMLHttpRequest();
	xhr.open("GET", "/infinity.gb");
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
}
