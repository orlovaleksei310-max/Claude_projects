# Claude_projects

A growing collection of small games that run right in the browser. No build step and no install: each game lives in its own folder as plain HTML, CSS and JavaScript. 3D games keep their own copy of Three.js in a `lib/` folder, so they work offline too.

## Games

| Game | Folder | Description |
|------|--------|-------------|
| Criminal Runaway | [`criminal-runaway/`](criminal-runaway/) | Top-down escape game. Grab all the cash, dodge the police, reach the getaway car. |
| Bank Heist 3D | [`bank-heist/`](bank-heist/) | Third-person 3D game. You spawn outside the bank with a pistol and a 4-slot inventory. Shoot targets, walk in, and take the loot. Desktop only (keyboard and mouse). |

### Bank Heist controls

| Key | Action |
|-----|--------|
| W A S D | Move |
| Mouse | Look around (click the game to capture the mouse, Esc to pause) |
| Left click | Shoot (pistol must be selected) |
| Right click (hold) | Aim: closer camera, slower walk |
| Shift / Space | Sprint / jump |
| R | Reload |
| 1 2 3 4 / mouse wheel | Select inventory slot |
| E / Q | Pick up / drop the selected item |
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
