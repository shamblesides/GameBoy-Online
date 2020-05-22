APU
===

Want some hardware-accurate Gameboy music and sounds in your HTML5 game or app? Don't want to load megabytes of .mp3 files? [Overwhelmed or frustrated](https://blog.mecheye.net/2017/09/i-dont-know-who-the-web-audio-api-is-designed-for/) by the Web Audio API? Welcome to **apu**!


Features
--------

* Tiny; single .js file, about 9 kB (gzip)
* Supports playing .vgm files (which are typically a few kB after gzip)
* Mute BGM channels while playing SFX
* Highly performant
* * Fast sample generation in WebAssembly
* * When possible, uses AudioWorklet to run completely outside the main thread (works in latest Chrome and FireFox)
* UMD module; works as script tag, AMD module, in webpack, etc
* TypeScript bindings


Browser support
---------------

Latest Chrome, Safari, Firefox


Acknowledgments
---------------

The high-performance WebAssembly bundle for emulating the GameBoy's APU is compiled from C code that was adapted from
an old version of VGMPlay, which was written by Anthony Kruize in 2002. Without that code, this module would not be
nearly as performant nor as accurate as it is today.


License
-------
[BSD 3-Clause](/LICENSE)
