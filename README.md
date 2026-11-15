# Claude_projects

A growing collection of small games that run right in the browser. No build step and no install: each game lives in its own folder as plain HTML, CSS and JavaScript. 3D games keep their own copy of Three.js in a `lib/` folder, so they work offline too.

## Games

| Game | Folder | Description |
|------|--------|-------------|
| Criminal Runaway | [`criminal-runaway/`](criminal-runaway/) | Top-down escape game. Grab all the cash, dodge the police, reach the getaway car. |
| Bank Heist 3D | [`bank-heist/`](bank-heist/) | Third-person 3D heist. A teller works inside the bank: hold out your gun and they put their hands up and the alarm goes off. Grab the money and get in the getaway car outside. Stay 30 seconds after the alarm and the police arrive (50 HP each; your pistol does 5 damage). Desktop only (keyboard and mouse). |

### Bank Heist rules

- Point your gun at the teller (hold right click) and they raise their hands. The alarm also goes off if you fire inside the bank or steal money in the teller's view.
- Police arrive 30 seconds after the alarm. There are 4 officers, each with 50 HP. Your pistol does 5 damage per hit. They shoot back; you have 100 HP with slow regeneration.
- The teller is unarmed and can't be hurt.
- Pick up loot, then walk to the getaway car (parked outside the bank) and press E to escape. You need at least some loot to leave.

### Bank Heist controls

| Key | Action |
|-----|--------|
| W A S D | Move |
| Mouse | Look around (click the game to capture the mouse, Esc to pause) |
| Left click | Shoot (pistol must be selected) |
| Right click (hold) | Hold your gun out: aim, closer camera, slower walk |
| Shift / Space | Sprint / jump |
| R | Reload |
| 1 2 3 4 / mouse wheel | Select inventory slot |
| E | Pick up loot / get in the getaway car |
| Q | Drop the selected item |
| M | Mute |

## How to play locally

Open `index.html` in a browser for the game launcher, or open a game's own `index.html` directly.

If you prefer a local server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Publishing online (optional)

Turn on GitHub Pages (Settings → Pages → Deploy from branch → `main` / root) and the games will be playable at `https://orlovaleksei310-max.github.io/Claude_projects/`.

## Adding a new game

1. Create a new folder, e.g. `my-game/`, with an `index.html` (plus `style.css` and `game.js`).
2. Add a card for it in the root `index.html`.
3. Add a row to the table above.

## Repo layout

```
Claude_projects/
├── index.html            # game launcher
├── README.md
├── criminal-runaway/     # one folder per game
│   ├── index.html
│   ├── style.css
│   └── game.js
└── bank-heist/
    ├── index.html
    ├── style.css
    ├── game.js
    └── lib/              # bundled Three.js (r159) and its license
```
