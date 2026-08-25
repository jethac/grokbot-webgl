(() => {
  const { BotEngine, STATES, SEQUENCE, KIRBY_SEQUENCE, EXPRESSIONS, REST_GAZE, clamp } =
    window.GrokBotEngine;

  const canvas = document.getElementById("stage");
  const kirbyBtn = document.getElementById("kirby");
  const stateRow = document.getElementById("states");
  const faceRow = document.getElementById("faces");
  const cursorEl = document.getElementById("cursor");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const GROK_STATES = [
    "idle",
    "wink",
    "wide",
    "thinking",
    "notify",
    "sleep",
    "egg",
    "hexagon",
    "play",
    "orbit",
    "burst",
    "comet",
    "alert",
    "exclaim",
  ];
  const KIRBY_STATES = [
    "idle",
    "wink",
    "wide",
    "happy",
    "curious",
    "inhale",
    "puff",
    "notify",
    "sleep",
    "orbit",
    "burst",
  ];
  const FACE_IDS = Object.keys(EXPRESSIONS);

  const engine = new BotEngine();
  engine.reduced = reduced;
  let renderer;
  try {
    renderer = window.createBotRenderer(canvas);
  } catch (err) {
    document.body.innerHTML =
      "<p style='padding:2rem;font:16px/1.4 sans-serif'>WebGL2 is required for this specimen.<br>" +
      err.message +
      "</p>";
    return;
  }

  let kirby = 0;
  let kirbyTarget = 0;
  let playing = false;
  let playList = SEQUENCE;
  let playIndex = 0;
  let playHoldUntil = 0;
  let last = performance.now() / 1000;
  let t0 = last;
  let pointerOn = false;
  let mx = 0;
  let my = 0;

  function now() {
    return performance.now() / 1000 - t0;
  }

  function setKirby(on) {
    kirbyTarget = on ? 1 : 0;
    kirbyBtn.setAttribute("aria-pressed", on ? "true" : "false");
    document.body.classList.toggle("kirby", on);
    buildChips();
    if (on && !STATES[engine.cur]) engine.setState("idle", now());
    if (on && GROK_STATES.includes(engine.cur) && !KIRBY_STATES.includes(engine.cur)) {
      engine.setState("idle", now());
    }
  }

  function buildChips() {
    const list = kirbyTarget > 0.5 ? KIRBY_STATES : GROK_STATES;
    stateRow.innerHTML = "";
    const play = document.createElement("button");
    play.className = "play";
    play.type = "button";
    play.textContent = playing ? "stop" : "play reel";
    play.setAttribute("aria-pressed", playing ? "true" : "false");
    play.addEventListener("click", togglePlay);
    stateRow.appendChild(play);
    const kchip = document.createElement("button");
    kchip.className = "play";
    kchip.id = "kirby-chip";
    kchip.type = "button";
    kchip.textContent = kirbyTarget > 0.5 ? "kirby on" : "kirby";
    kchip.setAttribute("aria-pressed", kirbyTarget > 0.5 ? "true" : "false");
    kchip.addEventListener("click", () => setKirby(kirbyTarget < 0.5));
    stateRow.appendChild(kchip);
    for (const id of list) {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.dataset.state = id;
      b.textContent = id;
      b.setAttribute("aria-pressed", engine.cur === id ? "true" : "false");
      b.addEventListener("click", () => {
        playing = false;
        engine.setState(id, now());
        syncChips();
      });
      stateRow.appendChild(b);
    }

    faceRow.innerHTML = "";
    for (const id of FACE_IDS) {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.dataset.face = id;
      b.textContent = id;
      b.setAttribute("aria-pressed", engine.expr === id ? "true" : "false");
      b.addEventListener("click", () => {
        playing = false;
        engine.setState("idle", now());
        engine.setExpression(id, now());
        syncChips();
      });
      faceRow.appendChild(b);
    }
  }

  function syncChips() {
    stateRow.querySelectorAll("[data-state]").forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.state === engine.cur ? "true" : "false");
    });
    faceRow.querySelectorAll("[data-face]").forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.face === engine.expr ? "true" : "false");
    });
    const play = stateRow.querySelector(".play:not(#kirby-chip)");
    if (play) {
      play.textContent = playing ? "stop" : "play reel";
      play.setAttribute("aria-pressed", playing ? "true" : "false");
    }
    const kchip = document.getElementById("kirby-chip");
    if (kchip) {
      kchip.textContent = kirbyTarget > 0.5 ? "kirby on" : "kirby";
      kchip.setAttribute("aria-pressed", kirbyTarget > 0.5 ? "true" : "false");
    }
  }

  function togglePlay() {
    playing = !playing;
    if (playing) {
      playList = kirbyTarget > 0.5 ? KIRBY_SEQUENCE : SEQUENCE;
      playIndex = 0;
      const id = playList[0];
      engine.reset(id, now());
      if (STATES[id]) playHoldUntil = now() + STATES[id].duration;
    }
    syncChips();
  }

  function tickPlay(t) {
    if (!playing) return;
    if (t < playHoldUntil) return;
    playIndex += 1;
    if (playIndex >= playList.length) {
      playing = false;
      engine.setState("idle", t);
      syncChips();
      return;
    }
    const id = playList[playIndex];
    engine.setState(id, t);
    const def = STATES[id];
    playHoldUntil = t + (def ? Math.max(def.duration, def.morph + 0.2) : 1.6);
    syncChips();
  }

  function lookFromPointer(t) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * (0.46 + 0.03 * kirbyTarget);
    const R = Math.min(rect.width, rect.height) * 0.26;
    const dx = (mx - cx) / R;
    const dy = (my - cy) / R;
    const yaw = clamp(dx, -1.4, 1.4) * 42;
    const pitch = clamp(-dy, -1.2, 1.2) * 36;
    if (kirbyTarget > 0.5) {
      engine.setLook(
        {
          yaw: pointerOn ? yaw : 0,
          pitch: pointerOn ? pitch : 0,
          mix: 1,
          wander: pointerOn ? 0.2 : 0.35,
        },
        t,
        0.22
      );
    } else {
      engine.setLook(
        {
          yaw,
          pitch,
          mix: pointerOn ? 1 : 0,
          wander: pointerOn ? 0.15 : 1,
        },
        t,
        pointerOn ? 0.18 : 0.55
      );
    }
  }

  const params = new URLSearchParams(location.search);
  if (params.has("kirby")) {
    setKirby(true);
    kirby = 1;
  }
  const startState = params.get("state");
  if (startState && STATES[startState]) engine.setState(startState, now());
  const startFace = params.get("face");
  if (startFace && EXPRESSIONS[startFace]) engine.setExpression(startFace, now());

  kirbyBtn.addEventListener("click", () => setKirby(kirbyTarget < 0.5));

  canvas.addEventListener("pointermove", (e) => {
    pointerOn = true;
    mx = e.clientX;
    my = e.clientY;
    cursorEl.style.left = mx + "px";
    cursorEl.style.top = my + "px";
    document.body.classList.add("show-cursor");
    cursorEl.hidden = false;
  });
  canvas.addEventListener("pointerleave", () => {
    pointerOn = false;
    document.body.classList.remove("show-cursor");
  });
  canvas.addEventListener("pointerdown", () => {
    engine.blinkAt = now();
  });

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "k" || e.key === "K") setKirby(kirbyTarget < 0.5);
    if (e.key === " ") {
      e.preventDefault();
      togglePlay();
    }
    if (e.key === "b" || e.key === "B") engine.blinkAt = now();
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      const list = kirbyTarget > 0.5 ? KIRBY_STATES : GROK_STATES;
      const id = list[n - 1];
      if (id) {
        playing = false;
        engine.setState(id, now());
        syncChips();
      }
    }
  });

  buildChips();

  function frame(ts) {
    const t = ts / 1000 - t0;
    const dt = Math.min(0.05, t - (last - t0));
    last = ts / 1000;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 5.2);
    kirby += (kirbyTarget - kirby) * k;
    lookFromPointer(t);
    tickPlay(t);
    const sample = engine.sample(t);
    renderer.draw(sample, kirby, t, reduced);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
