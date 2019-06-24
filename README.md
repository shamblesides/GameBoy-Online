gameboy-sound
=============

Want some hardware-accurate Gameboy music and sounds in your HTML5 game or app? Don't want to load megabytes of .mp3 files? [Overwhelmed or frustrated](https://blog.mecheye.net/2017/09/i-dont-know-who-the-web-audio-api-is-designed-for/) by the Web Audio API?

Enter **gameboy-sound**, the easy-to-use module that gives you reasonably hardware-accurate sounds in roughly 3 kilobytes. (min + gzip)


Demo
-----

[Try it on StackBlitz!](https://stackblitz.com/edit/gameboy-sound?file=index.js)


Goals
-----

gameboy-sound intends to deliver a good balance between size, accuracy, and ease-of-use. Its internals are still fairly accurate to [how the real hardware works](http://gbdev.gg8.se/wiki/articles/Gameboy_sound_hardware), but it omits some of the more obscure behavior. From a user's point of view, it uses an easy-to-read function-based API, rather than retaining the old notion of writing to registers on an APU. A user should be able to make some kind of sound happen with just one `import` statement and one function call.


Browser support
---------------

Not thoroughly tested, but Chrome, Firefox, and Safari seem good.


Acknowledgments
---------------

This project is actually a fork of [Grant Galitz's JavaScript Gameboy emulator](https://github.com/taisel/GameBoy-Online). I wanted to play convincing retro sound effects in the browser and decided that starting from a working emulator might be the best place to start. Grant's emulator was an excellent place to start from; its audio emulation is very accurate, and it was also clearly written with performance in mind.

I stripped out all of the components except the basics required to generate sound (no CPU cycles, no opcodes, no sprites, no interrupts, no joypad, no registers, no ROM...) and refactored it to make it easier to understand (from the perspective of both a user and a contributor) as well as minify better (less duplicate code, no large function prototypes)

That emulator was provided with the permissive [MIT license](/LICENSE), so this library is too.
