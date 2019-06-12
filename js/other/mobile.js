import { start } from '../GameBoyIO.js';

window.addEventListener("DOMContentLoaded", function() {
	console.log("windowingInitialize() called.", 0);
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/infinity.gb");
  xhr.responseType = "blob";
  xhr.onload = function () {
		var blob = new Blob([this.response], { type: "text/plain" });
		var binaryHandle = new FileReader();
		binaryHandle.onload = function () {
			if (this.readyState === 2) {
				var mainCanvas = document.getElementById("mainCanvas");
				start(mainCanvas, this.result);
			}
		};
		binaryHandle.readAsBinaryString(blob);
  };
  xhr.send();
});
