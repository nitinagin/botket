--!strict
-- BOTKET Robot City - Autonomous Delivery Challenge #001
-- Demo-only shared config. Not verified in Roblox Studio. Not published.
-- Not the Challenge Schema (repository issue #99). Schema work stays in a separate issue/PR.
--
-- Studio paste: ModuleScript named ChallengeConfig, parented to ReplicatedStorage.
-- Units: studs, seconds, points, and radians (spawnYaw and turnRate).

export type Rgb = {
	r: number,
	g: number,
	b: number,
}

export type ObstacleSpec = {
	name: string,
	centerX: number,
	centerZ: number,
	sizeX: number,
	sizeY: number,
	sizeZ: number,
	color: Rgb,
	material: string,
}

export type ZoneSpec = {
	name: string,
	centerX: number,
	centerZ: number,
	sizeX: number,
	sizeY: number,
	sizeZ: number,
	color: Rgb,
}

export type Waypoint = {
	x: number,
	z: number,
}

export type MissionSpec = {
	name: string,
	pickup: ZoneSpec,
	dropOff: ZoneSpec,
	toPickup: { Waypoint },
	toDropOff: { Waypoint },
}

export type ChallengeConfig = {
	challengeId: string,
	title: string,
	track: string,
	demoOnly: boolean,
	disclaimer: string,
	arena: {
		sizeX: number,
		sizeZ: number,
		floorThickness: number,
		wallHeight: number,
		wallThickness: number,
		floorColor: Rgb,
		wallColor: Rgb,
	},
	obstacles: { ObstacleSpec },
	missions: { MissionSpec },
	robot: {
		speed: number,
		turnRate: number,
		sizeX: number,
		sizeY: number,
		sizeZ: number,
		spawnX: number,
		spawnZ: number,
		spawnYaw: number,
	},
	scoring: {
		pointsOnPickup: number,
		pointsPerDelivery: number,
		timeLimitSeconds: number,
		collisionPenalty: number,
		collisionDebounceSeconds: number,
	},
}

local function rgb(r: number, g: number, b: number): Rgb
	return {
		r = r,
		g = g,
		b = b,
	}
end

-- Ground footprint is 120 by 120 studs. The server places the floor top at Y = 0
-- and builds four boundary walls from wallHeight and wallThickness. Obstacle and
-- zone X/Z values are ground centers; height sits on the floor from each sizeY.
--
-- Street plan (inner wall face at +/- 58):
--   North-west building  x -43..-17, z -43..-21
--   North-east building  x  18..42,  z -40..-20
--   South-west building  x -42..-22, z  21..43
--   South-east building  x  21..43,  z  18..42
--   Center kiosk         x  -5..5,   z  -5..5
-- Robot spawn center is x -50, z -14, facing +Z (spawnYaw = pi).
-- Missions run in order. toPickup and toDropOff are street waypoints for the
-- scripted auto-drive. They are not a published route graph.
local PICKUP_COLOR = rgb(48, 128, 214)
local DROPOFF_COLOR = rgb(36, 168, 112)

local function zone(name: string, centerX: number, centerZ: number, sizeX: number, sizeZ: number, color: Rgb): ZoneSpec
	return {
		name = name,
		centerX = centerX,
		centerZ = centerZ,
		sizeX = sizeX,
		sizeY = 6,
		sizeZ = sizeZ,
		color = color,
	}
end

local function wp(x: number, z: number): Waypoint
	return {
		x = x,
		z = z,
	}
end
local config: ChallengeConfig = {
	challengeId = "guild-001-autonomous-delivery",
	title = "Robot City - Autonomous Delivery Challenge #001",
	track = "virtual",
	demoOnly = true,
	disclaimer = "Demo source only. Not verified in Roblox Studio. Not published. Scripted driving aid only. Not the Challenge Schema.",
	arena = {
		sizeX = 120,
		sizeZ = 120,
		floorThickness = 2,
		wallHeight = 12,
		wallThickness = 2,
		floorColor = rgb(54, 58, 64),
		wallColor = rgb(168, 172, 176),
	},
	obstacles = {
		{
			name = "BuildingNorthWest",
			centerX = -30,
			centerZ = -32,
			sizeX = 26,
			sizeY = 16,
			sizeZ = 22,
			color = rgb(158, 74, 58),
			material = "Brick",
		},
		{
			name = "BuildingNorthEast",
			centerX = 30,
			centerZ = -30,
			sizeX = 24,
			sizeY = 20,
			sizeZ = 20,
			color = rgb(118, 124, 132),
			material = "Concrete",
		},
		{
			name = "BuildingSouthWest",
			centerX = -32,
			centerZ = 32,
			sizeX = 20,
			sizeY = 14,
			sizeZ = 22,
			color = rgb(72, 98, 122),
			material = "Concrete",
		},
		{
			name = "BuildingSouthEast",
			centerX = 32,
			centerZ = 30,
			sizeX = 22,
			sizeY = 18,
			sizeZ = 24,
			color = rgb(154, 132, 92),
			material = "Brick",
		},
		{
			name = "PlazaKiosk",
			centerX = 0,
			centerZ = 0,
			sizeX = 10,
			sizeY = 8,
			sizeZ = 10,
			color = rgb(62, 66, 72),
			material = "Concrete",
		},
	},
	missions = {
		{
			name = "West street to east street",
			pickup = zone("Pickup1", -50, 0, 10, 10, PICKUP_COLOR),
			dropOff = zone("DropOff1", 50, 0, 10, 10, DROPOFF_COLOR),
			toPickup = { wp(-50, -8), wp(-50, 0) },
			toDropOff = { wp(-50, -12), wp(-12, -12), wp(12, -12), wp(50, -12), wp(50, 0) },
		},
		{
			name = "North street to south street",
			pickup = zone("Pickup2", 0, -50, 8, 8, PICKUP_COLOR),
			dropOff = zone("DropOff2", 0, 50, 8, 8, DROPOFF_COLOR),
			toPickup = { wp(-50, -28), wp(-50, -50), wp(-16, -50), wp(0, -50) },
			toDropOff = { wp(12, -50), wp(12, -12), wp(12, 12), wp(12, 50), wp(0, 50) },
		},
		{
			name = "Southwest corner to northeast corner",
			pickup = zone("Pickup3", -50, 32, 8, 8, PICKUP_COLOR),
			dropOff = zone("DropOff3", 36, -50, 8, 8, DROPOFF_COLOR),
			toPickup = { wp(-50, 8), wp(-50, 32) },
			toDropOff = { wp(-50, 12), wp(-12, 12), wp(12, 12), wp(50, 12), wp(50, -50), wp(36, -50) },
		},
	},
	robot = {
		speed = 18,
		turnRate = math.rad(120),
		sizeX = 4,
		sizeY = 2.2,
		sizeZ = 6,
		spawnX = -50,
		spawnZ = -14,
		spawnYaw = math.pi,
	},
	scoring = {
		pointsOnPickup = 10,
		pointsPerDelivery = 100,
		timeLimitSeconds = 240,
		collisionPenalty = 5,
		collisionDebounceSeconds = 0.75,
	},
}

table.freeze(config.arena.floorColor)
table.freeze(config.arena.wallColor)
table.freeze(config.arena)
for _, obstacle in config.obstacles do
	table.freeze(obstacle.color)
	table.freeze(obstacle)
end
table.freeze(config.obstacles)
for _, mission in config.missions do
	table.freeze(mission.pickup.color)
	table.freeze(mission.pickup)
	table.freeze(mission.dropOff.color)
	table.freeze(mission.dropOff)
	for _, point in mission.toPickup do
		table.freeze(point)
	end
	table.freeze(mission.toPickup)
	for _, point in mission.toDropOff do
		table.freeze(point)
	end
	table.freeze(mission.toDropOff)
	table.freeze(mission)
end
table.freeze(config.missions)
table.freeze(config.robot)
table.freeze(config.scoring)
table.freeze(config)

return config
