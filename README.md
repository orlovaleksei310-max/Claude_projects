# Claude_projects

A growing collection of small games that run right in the browser. No build step and no install: each game lives in its own folder as plain HTML, CSS and JavaScript. 3D games keep their own copy of Three.js in a `lib/` folder, so they work offline too.

**Arrest and prison:** if a police officer, FBI agent or guard gets within about 1.7 m of you for a second you are arrested: the heist ends, the loot is lost and the next time the game loads you wake up in **prison** (your weapons are confiscated until you are out). Pick the lock of your cell (E, free, takes a few seconds), sneak up behind a guard outside his field of view and pick his pocket (E, hold still about 1.5 s) for a keycard (only two of the four guards carry one), open the main gate at the front (E) and run out the front door. You keep the keycard after the escape (one use: it unlocks one Mona Lisa job). The guards shoot on sight and you are unarmed. If they kill you, you restart in your cell. Once you break out you are back at the HQ with your guns.

## Games

| Game | Folder | Description |
|------|--------|-------------|
| Criminal Runaway | [`criminal-runaway/`](criminal-runaway/) | Top-down escape game. Grab all the cash, dodge the police, reach the getaway car. |
| Bank Heist 3D | [`bank-heist/`](bank-heist/) | Third-person 3D heist. A teller works inside the bank: hold out your gun and they put their hands up and the alarm goes off. Grab the money and get in the getaway car outside. Stay 30 seconds after the alarm and the police arrive (50 HP each; your pistol does 5 damage). Escape and you teleport to the HQ, a hideout with an illegal gun shop. Desktop only (keyboard and mouse). |
| Dirt Bike Ride | [`dirt-bike/`](dirt-bike/) | Third-person 3D dirt bike on an endless winding road. W/S throttle and brake, A/D steer (the bends push you outwards, so lean into them), Shift for nitro, E for a wheelie (press again to stop; it scores points the longer you hold it), Space in the air for a flip. The biome changes every 1000 m (grassland first, then desert, snowy mountains, city and forest in a random order; none repeats until all five have been used). Every biome has its own obstacles (a crash stops you for a moment): rocks and logs in the grassland; stumps, fallen trees and slow mud in the forest; cacti and rolling tumbleweeds in the desert; slippery ice patches, snowmen and boulders in the snow; stopped cars, barriers and crates in the city, hit the ramps for air time and flips, and beat your best distance (saved in your browser). Going off the road slows you down. Wheelies and flips earn trick points but cost nitro. Every biome has detailed models and its villages match it (log cabins in the forest, adobe houses in the desert, snowy chalets in the snow). Towns appear now and then in the forest, desert and snow: ride in and the bike shop lets you repaint your bike (4000 points a colour, reset every round). Press E in the air for a random trick (tabletop, superman, 360, whip, helicopter, barrel roll, cliffhanger) scored by how high you are. Stay off the road for 10 seconds and you die (press R). A top-right minimap of the road ahead and behind, soft real-time shadows and a cleaner HUD. It gets harder the further you ride: there are 12 levels (one per 500 m, shown in the HUD) with more obstacles per stretch, sharper bends and a higher top speed, reaching full difficulty at 6000 m. Desktop only. |

### Bank Heist rules

- Point your gun at the teller (hold right click) and they raise their hands. The alarm also goes off if you fire inside the bank or steal money in the teller's view.
- Police arrive 30 seconds after the alarm. There are 4 officers, each with 50 HP. Your pistol does 5 damage per hit. They shoot back; you have 100 HP with slow regeneration.
- The teller is unarmed and can't be hurt.
- Pick up loot, then walk to the getaway car (parked outside the bank) and press E to escape. You need at least some loot to leave.
- Escaping teleports you to the **HQ**. Your loot is sold for cash, and cash and the guns you own are saved in your browser between heists.
- At the HQ, walk up to a pedestal and press E to buy a gun. Guns you carry take up inventory slots, so carrying more guns leaves less room for loot. The gun storage unit on the right wall of the HQ has 10 slots: press E there and click a gun to move it between your inventory and storage. You can store any gun, including the pistol. Everything is saved between heists. Lockpicks ($5,000 each, one use) are sold at the dealer's counter (E). The dressing room on the left wall (E) sells hoodie colours (red, blue, yellow, pink, purple, green) for $30,000 each; once bought you can switch freely and it is saved. Step onto the green circle to choose your next heist; the Factory needs at least one lockpick. Once you have finished a heist, the game always opens at the HQ (also after you get busted or refresh), and only picking a job there starts the next heist.

### Heist locations

After your first heist, stepping onto the green circle at the HQ opens a list of three new targets (press 1, 2 or 3, or click a row). Each has its own building, props, staff member and loot; the alarm, police and getaway car work the same way. From your third heist on, the National Bank is also on the list. The Crown Jewel is the final job and unlocks once all four earlier jobs are done.

| Location | Staff | Loot on site |
|----------|-------|--------------|
| Power Plant | operator | Locked behind the control panel at the back right: reconnect the 5 wires (E at the panel, press a number to pick a wire, then the number of the terminal of the same colour; random layout each visit; a wrong terminal shocks you for 10 HP and the third trips the alarm). Then take Power Cells ($4,000 each) and Fusion Cores ($12,000 each) and run the **laser corridor** out the back door: jump over the 4 lasers (a touch costs 50 HP). The getaway car waits at the end. |
| The Factory | foreman + 5 guards | Guards patrol the floor (and two wait upstairs): shoot them or sneak past, they raise the alarm when they spot you. Go through the **staff door** at the back right, climb the **stairs**, and **pick the lock** (hold E at the door, uses 1 lockpick) to reach the vault: Parts Crates ($3,000 each), Prototypes ($10,000 each). Escape through the **back door** (EXIT) to the getaway car parked in the back lot. |
| Golden Casino | dealer | A black neon-lit room packed with ~15 gamblers (slot machines, roulette tables) that you can shoot. Kill one and the police (3 cars) arrive within 10 seconds; wipe them out and the FBI comes (tougher every wave, up to 6 cars), wave after wave until you die. You can still win by escaping with loot. Loot is locked in the jackpot machine at the back right: crack its 3-symbol code (E at the machine). The code is hidden: find 3 clue notes (one per reel) at random spots around the room, different every visit, then take Chip Stacks ($6,000 each) and Black Chips ($15,000 each). Three wrong tries trip the alarm. |
| The Crown Jewel | curator | **Unlocks after you have finished the Bank, Power Plant, Factory and Casino** (it shows as locked in the job list until then). Hack the security terminal on the west wall (memorise the 6-digit key, then type it) to open the hall shutter, **but the hack trips a silent alarm: 3 FBI cars arrive straight away, and killing them brings ever bigger FBI waves**. Run the dark laser hall (low beams: jump; flashing beams: slip through when they are off; a touch costs 50 HP), spin the vault dial in the chamber at the end (it turns on its own; press ←/→ or A/D and switch direction exactly when the light flashes; 4 right switches open it, a badly timed switch resets the lock), take the Crown Jewel ($40,000) and two Diamonds ($10,000 each), $60,000 in all, climb the ladder on the east wall (press E next to it; you climb by yourself, S reverses) to the roof and board the helicopter (E). |
| The Mona Lisa | curator | **Needs the keycard** (shown as 💳 KEYCARD in the HUD): get arrested and escape from prison to earn one. It is **single use**: it is consumed when you swipe it at the gate, so you need to break out of prison again for each Mona Lisa job. Use it on the reader at the front gate (E), kill the five guards, then cross the laser room behind the partition: low beams (jump), fast-flashing beams (wait for the gap) and a sweeping beam (time it); a touch costs 50 HP. Take the Mona Lisa ($250,000) from the pedestal, cross the lasers again and drive off in the getaway car. |

| Weapon | Price | Damage | Magazine | Fire |
|--------|-------|--------|----------|------|
| Pistol | free | 5 | 12 | semi-auto |
| Knife | $125,000 | 100 (melee, short range) | none | click to stab |
| Shotgun | $25,000 | 8 pellets x 6 | 6 | pump |
| Sniper | $200,000 | 100 to the head, 25 to the body | 5 | bolt, right click zooms |
| Assault Rifle | $175,000 | 12 | 30 | full auto (hold left click) |
| Flamethrower | $225,000 | 4 per 0.1 s to everything in a short cone (about 7.5 m) | 100 fuel (no reload, 1 fuel per 0.5 s of burning, so 50 s of fire) | hold left click |

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
| E | Pick up loot / get in the getaway car / use the HQ shop |
| Q | Drop the selected item |
| M | Mute |
| Boss Rush | [`boss-rush/`](boss-rush/) | Three save slots (progress saves automatically at camp). Top-down 2D. Wake up in a cave and beat five bosses in a row (Rock Golem, Bat Queen, Slime King, Spider Matriarch, Crystal Wyrm), then a lava portal opens to the Underworld with five tougher bosses (Hellhound, Ash Witch, Obsidian Titan, Demon Lord, Infernal Dragon, a winged fire-breather that stomps, sweeps flame, flies up and dive-bombs). WASD to move, mouse to aim and shoot, Space/Shift to dash (invulnerable while dashing). There is a small red ADMIN button top-right (password-gated cheat panel, including a mode where you play as the boss against a very good AI hero). Pick one of three upgrades after each boss and rest at the campfire before the next portal. After the (now much harder, four-phase) Infernal Dragon, an acid portal opens to the Acid Realm with five more bosses (Acid Scorpion, Venom Hydra, Toxic Wraith, Bile Leviathan, Acid Overmind) and stronger acid upgrades. Boss health scales up a lot in each later realm. After the Acid Realm a dream portal opens to the Dreamland with five more bosses (The Sandman, Nightmare Stallion, Plush Terror, Lunar Moth, Dream Eater). Every boss has its own music theme (plus camp and title themes), and defeated bosses fall over while a short speech plays. |

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
