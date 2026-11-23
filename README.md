# Extinction Run

Comet crash game in pixel art. A herd of raptors sprints across a prehistoric plain at dusk while a comet falls out of
the sky, and the multiplier climbs with every metre run. Your bet is a raptor. The only thing you do is **burrow**
(cash out): your raptor digs in and waits out the end in a chamber underground. Any raptor still running when the comet
hits is lost, and so is its bet.

```bash
npm install
npm run dev      # http://localhost:5193
npm run build
```

The game plays against the game API's live crash engine (FeedingFranzeeAPI, `/livecrashhub`, Engine `LiveCrash`,
GameId `extinctionrun`). In dev, Vite proxies `/api`, `/livecrashhub` and `/promohub` to http://localhost:5003, and the
API's `/api/dev-token` signs in a demo player. Production builds call `VITE_API_BASE` with the lobby's `?token=`.
Open the game with `?demo` (or build with `VITE_DEMO=1`) to play offline against the in-browser demo engine
(`src/game/demoEngine.ts`: a R2,000 demo wallet and a few other raptors).

## The round

```text
BETTING (7 s)   the herd gathers; countdown blips in the last 3 s. Two raptors (bet slots) per player.
FLYING          the run. multiplier = e^(0.12·t) floored to the cent: 2× at 5.8 s, 10× at 19 s, 100× at 38 s, 1000× at 58 s.
                burrow any time, by hand or at an auto-burrow target; win = stake × multiplier (capped at MaxWin).
CRASHED (5 s)   impact: 0.6 s of the comet streaking in, then the flash, the fireball and the shockwave. Bets still running lose.
```

## Return to player: 96%

The API draws the impact point before betting opens (`Rng` block: Model `Target`, 4% house edge, max ×1000), so that
P(run reaches m) = 0.96 / m. A cash-out at any multiplier m pays m with probability 0.96 / m, so **every target
returns 96%**: early or late, by hand or with auto burrow. Nothing on screen feeds back into the multiplier, and the
client reports nothing that could move the RTP (no boosts, no skill inputs).

This is checked against the real generator by `FeedingFranzeeAPI/tools/RtpSim`, which draws crash points from EasyRNG
with the live engine's settings and rounding and measures the return at 13 cash-out targets from 1.01× to 1000×:

```bash
cd FeedingFranzeeAPI/tools/RtpSim
dotnet run -c Release 20000000 4 1000    # rounds, house edge %, max multiplier; exits 1 if any target misses 96% ± 3σ
```

On 2026-11-14, 20 million rounds passed at every target (for example 95.99% at 1.01×, 95.99% at 2×, 95.91% at 10×).

Everything on screen is a function of ln(multiplier) (`src/game/run.ts`):

| | formula | at 2× | at 10× | at 100× |
|---|---|---|---|---|
| comet altitude | 20 + 980 / (1 + 1.3·ln m) km | 541 | 274 | 158 |
| threat level | I at 1×, II 1.5×, III 2.5×, IV 5×, V 10×, VI 25× | II | V | VI |
| heat (sky, comet size) | ln m / ln 1000 | 10% | 33% | 67% |

## Provably fair

The hub sends the SHA-256 hash of the server seed and the run's nonce with every round, and reveals the previous seed
when it rotates (every 1 000 draws). Both are shown under **Provably fair** in the menu.

## Backend (FeedingFranzeeAPI)

No new engine: Extinction Run is a `LiveCrash` game, like REDLINE and Storm Chaser. It needs:

- the `extinctionrun` entry in `appsettings.json` `Games` (ProviderGameId 17, LaunchUrl
  `https://extinctionrun.easygamesdemo.co.za/`; Rng Target, 4% edge, max ×1000; Live: 7 s betting, 5 s crashed, growth
  0.12, 2 bet slots), plus the origin in `AllowedOrigins` in `appsettings.json` and `appsettings.Staging.json`
- `Infrastructure/Persistence/ExtinctionRunGameServer.sql`, which creates the `dbo.Games` row
- `ExtinctionRunCatalogue.sql`, which creates the BetAvenue lobby row (provider 10013, GameTypeID 1, the first free Enum
  after 728, the thumbnail, operator 20050)
- a restart once the row exists: `LiveCrashRegistry` builds one engine per enabled LiveCrash game at startup

## Look and feel

Everything is drawn at a low resolution (about 200 rows) and scaled up with hard edges, with an ordered dither in the
sky and the sand like an old console.

- **The sky:** a dusk gradient that burns from violet to red as the comet nears and turns to ash after the impact.
  Stars fade out, a pterosaur flock crosses, and shooting stars and then comet fragments streak down as the threat
  rises.
- **Far:** a volcano range, lit on one slope, smoking harder, running with lava and spitting bombs as the heat climbs.
- **Mid:** mesas, and long-necked sauropods plodding across in silhouette, raising their heads as the end nears.
- **Near:** tree ferns, cycads and conifers in silhouette, combed by the wind and flattened by the shockwave.
- **The plain:** a two-lane sand strip with grass tufts and ripples, cut away below to show the rock: dithered strata,
  roots, sediment lines, ammonites, trilobites, a raptor skeleton, crystal pockets, and magma veins that wake as the
  comet nears.
- **The herd:** every bet is a raptor, and yours carry an arrow in their colour (red, blue). They run on two lanes and
  jump logs, rocks and cycads. They duck under low pterosaurs. All of this is cosmetic.
- **Burrow:** the raptor skids, digs with dirt flying, and drops into a chamber in the cut-away rock, where it curls up
  safe.
- **Impact:** the comet streaks in, a white flash, a fireball dome boils up on the horizon behind the mesas, and a lit
  mushroom cloud climbs and cools. A rolling wall of dust and fire sweeps the plain, flinging every raptor still
  running. Ash falls and embers rise.
- **HUD:** the threat strip (I–VI) with its name, the impact alert, the multiplier in Press Start 2P, and two LCD
  panels: sprint speed and distance, and comet altitude and heat.
- **Sound** is all synthesized (`src/game/sound.ts`): a wind, comet-hiss and rumble bed rising with the threat, the
  herd's footfalls, countdown blips, a two-tone alarm on each threat level, the incoming scream and the impact boom, the
  dig, a win arpeggio. The muted state is remembered.
- `prefers-reduced-motion`: no shake, a softer flash, fewer particles.

Per-frame values never go through React: the loop in `App.tsx` reads the server clock, steps `RunModel`, draws the
canvas (`src/scene/scene.ts`) and publishes a `Frame` on `frameBus`. The HUD updates its DOM directly from that.

## Files

- `src/api/`: SignalR client (`hubEngine.ts`), types, auth (unchanged from the other LiveCrash games)
- `src/game/run.ts`: altitude, heat, threat, speed and distance from time, plus the impact; `useGame.ts`, `clock.ts`,
  `demoEngine.ts`, `frameBus.ts`, `sound.ts`
- `src/scene/scene.ts`: the renderer (camera, the herd and its poses, burrows, pterosaurs, comet, meteors, fireball,
  shockwave, particles, grade); `world.ts`: sky, volcanoes, mesas, sauropods, flora, the plain and the rock;
  `pixel.ts`: the pixel-art sprites (raptor body and legs per frame, curled raptor, pterosaur, clutter, fossils) and a
  3×5 font
- `src/components`: `Dash` (threat strip, impact alert), `Instruments` (sprint and comet panels), `Readout`, bet panel,
  live bets, modals, `Splash`
- `tools/preview.html`: the scene frozen at ten moments (the line-up, the off, the run, burrowing, safe, late, impact,
  the shockwave, flung, extinct)
- `tools/thumbnail.html`: the 1280×720 lobby thumbnail; screenshot it into `public/thumbnail.png`
