# BOTKET Robot City — Phase 1 (Roblox source)

Source-only Luau prototype for one delivery robot in one city arena. It is the Roblox counterpart to the browser prototype in [draft PR #102](https://github.com/nitinagin/botket/pull/102). The Phase 1 plan is [issue #101](https://github.com/nitinagin/botket/issues/101).

**This folder is not verified in Roblox Studio and is not published.** It is not a deployed game, a live challenge, or an investor-demo build. The first investor demo target is **15 Nov 2026**. That date is a target only. Import and playtest results still have to be recorded before anyone treats this as demo-ready.

No paid services, purchases, or vendor commitments are added here.

## What you can do in a local Studio playtest

- Drive one robot with WASD or the on-screen touch joystick.
- Pick up the blue package and deliver it to the green drop-off. The three street routes repeat, and the round does not end after three deliveries.
- See score, deliveries, collisions, and elapsed time. Elapsed time is a display. The HUD has no countdown and no mission-of-3 counter.
- Turn **Scripted AI** on or off from the HUD. Manual driving remains available when it is off. Both modes use the same scoring path.
- Press **Restart** to clear the round and put the robot back at the spawn.

Scripted AI follows street waypoints and turns away from a nearby wall or building. It is a short driving script, not trained machine learning, not ROS 2, and not a claim that a route will always succeed.

## Studio setup (manual paste, no Rojo)

Roblox Studio is required. This repository has no Rojo project.

1. Create or open a place in Roblox Studio.
2. Create the instances below and paste each file's source into the instance. The `.luau` suffix and the `.server` / `.client` suffixes are only a layout hint. The Studio class and name are what the scripts use.

| Source file | Studio class | Parent | Instance name |
| --- | --- | --- | --- |
| `roblox/src/shared/ChallengeConfig.luau` | ModuleScript | `ReplicatedStorage` | `ChallengeConfig` |
| `roblox/src/server/DeliveryManager.server.luau` | Script | `ServerScriptService` | `DeliveryManager` |
| `roblox/src/client/RobotController.client.luau` | LocalScript | `StarterPlayer.StarterPlayerScripts` | `RobotController` |

3. Do not pre-create the remotes. `DeliveryManager` creates `ReplicatedStorage.RobotCityRemotes` with `MovementInput`, `ChallengeState`, `DriveMode`, and `Restart`.
4. Press Play. The server builds the arena and spawns one robot for the first player. The camera should follow that robot. The default avatar is parked above the arena and is not the delivery robot.

Check the Output window if the HUD stays on "Waiting for the delivery robot...". The usual cause is that `ChallengeConfig` is not a ModuleScript named `ChallengeConfig`, or `DeliveryManager` is not a server Script.

## Controls

| Input | Action |
| --- | --- |
| W / S | Drive forward / back |
| A / D | Turn left / right |
| Touch joystick (lower left) | Same axes, shown when `UserInputService.TouchEnabled` is true |
| Scripted AI | Toggles waypoint auto-drive. While it is on, WASD and the joystick do not drive. |
| Restart | Asks the server to run `restartRound` |

`restartRound` is a function in `DeliveryManager`. It puts the robot back at the spawn, returns to the first route, clears score, deliveries, collisions, cargo, elapsed time, and the collision cooldown, and switches drive mode back to manual.

## Round and scoring

Demo constants live in `ChallengeConfig`. The label is `rulesVersion` `robot-city-demo-v1`, with `demoOnly` true and `scoring.final` false. These match the browser prototype in [draft PR #102](https://github.com/nitinagin/botket/pull/102) (`robot-city.html` at `e4456e3`) and the contract proposed in [draft PR #115](https://github.com/nitinagin/botket/pull/115), which is Option A on [issue #99](https://github.com/nitinagin/botket/issues/99#issuecomment-6736232903). They are not approved final challenge rules. `roblox/scoring-contract.json` records the same numbers.

- Pickup awards `pointsOnPickup` (10) and arms the drop-off.
- A delivery awards `pointsPerDelivery` (100). The same pickup or drop-off is not awarded twice without the cargo state changing.
- A wall or building touch subtracts `collisionPenalty` (1), at most once per `collisionCooldownSeconds` (0.5, which is 500 ms). The score does not go below 0.
- Routes repeat in order: west to east, north to south, then southwest to northeast, then the first route again. There is no fixed three-mission end state.
- There is no round time limit. Elapsed time is shown on the HUD and is not part of the score.
- Scripted AI and manual driving call the same pickup, delivery, and collision scoring. Scripted driving does not add a bonus or an extra penalty.
- Restart clears score, deliveries, collisions, cargo, the collision cooldown, elapsed time, the route index, and waypoints, and places the robot at the spawn. Drive mode returns to manual.

`loadConfig()` accepts one or more routes. An empty route list is rejected. A single route is valid and repeats. The shipped arena still defines three routes.

Zone parts use `Touched`. The server also treats the robot as inside a zone when its hull overlaps that zone, because a physics touch can be missed. Only the delivery robot counts.

There is one robot, created for the first player who joins. Later players do not get a robot. This is not a multiplayer mode: no match, no shared score, and no player-versus-player rules.

## Schema coordination

This folder lines up with the Virtual-track discussion in [issue #99](https://github.com/nitinagin/botket/issues/99) as a gameplay sketch: one arena, obstacles, repeating deliveries, collisions, and elapsed time. `rulesVersion` `robot-city-demo-v1` is the demo scoring label from Option A. It is not the shared Challenge Schema, and `scoring.final` stays false. That schema is still a separate issue and pull request. [Issue #101](https://github.com/nitinagin/botket/issues/101) lists a shared schema as an acceptance item that this folder does not complete.

## Checks outside Studio

On 1 Nov 2026 these files were parsed and checked with official release binaries, not inside Roblox Studio:

- Luau 0.745 (`luau-ubuntu.zip`, sha256 `186e5ddaa2b048ebc7390c11ed1b00c04e7d3beaffed429250329e3575d2ece2`): `luau-compile --only-parse` and `luau-analyze` both exited 0. The analyzer was given a temporary `.luaurc` that names the Roblox globals this code uses, because that Luau CLI build has no Roblox type library. That file is not part of the repository.
- Selene 0.32.0 (`selene-0.32.0-linux.zip`, sha256 `d3773393578580074386e69337d35b7acddfbaa9fc38964c07fa3e28436ade9b`) with `std = "roblox"` exited 0.

Those commands are not run in CI. A clean result is not a Studio playtest.

The scoring contract can be checked without Roblox Studio:

```bash
node --test roblox/check-scoring-parity.mjs
```

That test reads `roblox/scoring-contract.json` and the Luau sources. It checks the agreed constants, the score floor, the 500 ms collision cooldown, the repeating routes, and that the HUD does not show a countdown or a mission-of-3 counter. It does not execute Luau and it does not open Roblox Studio.

## Limitations

- Manual paste only. No Rojo and no automated Studio import.
- Not verified in Roblox Studio. Not published. Not deployed.
- No multiplayer mode, accounts, submissions, prizes, payments, marketplace, real robot connection, or ROS 2.
- Scripted auto-drive can still miss a corner or stall. Use Restart and drive manually if it does.
- The default avatar is parked and is not used for the delivery.
- The shared challenge schema is not in this folder.
