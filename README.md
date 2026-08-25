# bot — webgl specimen

A WebGL2 port of the Grok Bot mascot. Eyes live on a sphere.

Live at [grokbot-webgl.jethachan.net](https://grokbot-webgl.jethachan.net/).

Grok Bot was designed for Grok Build. This is a fan specimen of the icon and the way its eyes move. xAI owns Grok Bot.

## Run

Any static server from this directory:

```bash
python -m http.server 8765
```

Then open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

## Controls

- Move the pointer — the eyes look
- Click the canvas — blink
- Space — play the expression reel
- Chips in the footer — jump to a state or face

A Kirby dress-up mode lives dormant in the code (`KIRBY_ENABLED` in `js/main.js`); it is disabled.

## Credits

Eyes measured off [Benji Taylor](https://x.com/benjitaylor/status/2087227155076046995)’s Grok Build film. Icon: [Kenneth Kuh](https://x.com/kenneth_kuh), Justin Jay Wang, Luke Barker, John Bai.
