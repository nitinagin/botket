# BOTKET Robot City — Phase 1 (Roblox source)

Source-only Luau prototype for one delivery robot in one city arena. It is the Roblox counterpart to the browser prototype in [draft PR #102](https://github.com/nitinagin/botket/pull/102). The Phase 1 plan is [issue #101](https://github.com/nitinagin/botket/issues/101).

**This folder is not verified in Roblox Studio and is not published.** It is not a deployed game, a live challenge, or an investor-demo build. The first investor demo target is **15 Nov 2026**. That date is a target only. Import and playtest results still have to be recorded before anyone treats this as demo-ready.

No paid services, purchases, or vendor commitments are added here.

## What you can do in a local Studio playtest

- Drive one robot with WASD or the on-screen touch joystick.
- Complete three pickup and delivery missions in order. The blue pickup and green drop-off move when a delivery is finished.
- See score, deliveries, collisions, the current mission, and time remaining.
- Turn **Scripted AI** on or off from the HUD. Manual driving remains available when it is off.
- Press **Restart** to run the round again from mission 1.

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

`restartRound` is a function in `DeliveryManager`. It puts the robot back at the spawn, returns to mission 1, clears score, deliveries, collisions, and cargo, switches drive mode back to manual, and starts the timer again. Restart still works after the time limit or after all three deliveries.

## Round and scoring

Demo constants live in `ChallengeConfig`. They are not final challenge rules.

- Three missions, in order: west to east, north to south, then southwest to northeast.
- Touching the active pickup, or overlapping it, awards `pointsOnPickup` (10) and arms the drop-off.
- Touching the active drop-off, or overlapping it, awards `pointsPerDelivery` (100) and advances the mission.
- A wall or building touch subtracts `collisionPenalty` (5), at most once per `collisionDebounceSeconds` (0.75). The score does not go below 0.
- The round ends at `timeLimitSeconds` (240) or when all three deliveries are complete. Elapsed time is shown; it is not added into the score number.

Zone parts use `Touched`. The server also treats the robot as inside a zone when its hull overlaps that zone, because a physics touch can be missed. Only the delivery robot counts.

There is one robot, created for the first player who joins. Later players do not get a robot. This is not a multiplayer mode: no match, no shared score, and no player-versus-player rules.

## Schema coordination

This folder lines up with the Virtual-track discussion in [issue #99](https://github.com/nitinagin/botket/issues/99) only as a gameplay sketch: one arena, obstacles, deliveries, collisions, and elapsed time. It does not add the shared Challenge Schema. That schema is still a separate issue and pull request. [Issue #101](https://github.com/nitinagin/botket/issues/101) lists a shared schema as an acceptance item that this PR does not complete. Numbers in `ChallengeConfig` are local demo values.

## Checks outside Studio

On 1 Nov 2026 these files were parsed and checked with official release binaries, not inside Roblox Studio:

- Luau 0.745 (`luau-ubuntu.zip`, sha256 `186e5ddaa2b048ebc7390c11ed1b00c04e7d3beaffed429250329e3575d2ece2`): `luau-compile --only-parse` and `luau-analyze` both exited 0. The analyzer was given a temporary `.luaurc` that names the Roblox globals this code uses, because that Luau CLI build has no Roblox type library. That file is not part of the repository.
- Selene 0.32.0 (`selene-0.32.0-linux.zip`, sha256 `d3773393578580074386e69337d35b7acddfbaa9fc38964c07fa3e28436ade9b`) with `std = "roblox"` exited 0.

Those commands are not run in CI. A clean result is not a Studio playtest.

## Limitations

- Manual paste only. No Rojo and no automated Studio import.
- Not verified in Roblox Studio. Not published. Not deployed.
- No multiplayer mode, accounts, submissions, prizes, payments, marketplace, real robot connection, or ROS 2.
- Scripted auto-drive can still miss a corner or stall. Use Restart and drive manually if it does.
- The default avatar is parked and is not used for the delivery.
- The shared challenge schema is not in this folder.
