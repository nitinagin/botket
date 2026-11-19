--!strict
-- BOTKET Robot City - Autonomous Delivery Challenge #001
-- Demo-only server script. Not verified in Roblox Studio. Not published.
-- One robot. Sequential delivery missions. Scripted waypoint auto-drive, not a trained model.
--
-- Studio paste: Script named DeliveryManager, parented to ServerScriptService.
-- Requires the ModuleScript ReplicatedStorage.ChallengeConfig.
-- Creates ReplicatedStorage.RobotCityRemotes at runtime:
-- MovementInput, ChallengeState, DriveMode, Restart.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local STATUS_TIME_UP = "Time is up."
local STATUS_COMPLETE = "All deliveries are complete."
local INPUT_TIMEOUT_SECONDS = 0.3
local MAX_STEP_SECONDS = 0.1
local WAYPOINT_RADIUS = 6
local AVOID_LOOK_DISTANCE = 8
local AVOID_SIDE_DISTANCE = 6

type Rgb = {
	r: number,
	g: number,
	b: number,
}

type ObstacleSpec = {
	name: string,
	centerX: number,
	centerZ: number,
	sizeX: number,
	sizeY: number,
	sizeZ: number,
	color: Rgb,
	material: string,
}

type ZoneSpec = {
	name: string,
	centerX: number,
	centerZ: number,
	sizeX: number,
	sizeY: number,
	sizeZ: number,
	color: Rgb,
}

type Waypoint = {
	x: number,
	z: number,
}

type MissionSpec = {
	name: string,
	pickup: ZoneSpec,
	dropOff: ZoneSpec,
	toPickup: { Waypoint },
	toDropOff: { Waypoint },
}

type Config = {
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

type RobotRecord = {
	player: any,
	model: any,
	hull: any,
	cargo: any,
	align: any,
	yaw: number,
	throttle: number,
	steer: number,
	lastInputAt: number,
	lastCollisionAt: number,
	startedAt: number,
	elapsed: number,
	sentElapsed: number,
	score: number,
	deliveries: number,
	collisions: number,
	carrying: boolean,
	status: string,
	removed: boolean,
	spawnY: number,
	driveMode: string,
	missionIndex: number,
	waypointIndex: number,
	evadeUntil: number,
	evadeSteer: number,
	anchorX: number,
	anchorZ: number,
	anchorAt: number,
	rayParams: any,
}

type BuiltZones = {
	pickup: any,
	dropOff: any,
}

local robots: { [string]: RobotRecord } = {}

local function fail(message: string): never
	error("[DeliveryManager] " .. message, 0)
end

local function readTable(source: any, label: string): { [string]: any }
	if typeof(source) ~= "table" then
		fail(label .. " must be a table")
	end
	return source
end

local function readArray(source: any, label: string): { any }
	if typeof(source) ~= "table" then
		fail(label .. " must be a table")
	end
	return source
end

local function readNumber(source: any, label: string): number
	if typeof(source) ~= "number" then
		fail(label .. " must be a number")
	end
	return source
end

local function readPositive(source: any, label: string): number
	local value = readNumber(source, label)
	if value <= 0 then
		fail(label .. " must be greater than 0")
	end
	return value
end

local function readNonNegative(source: any, label: string): number
	local value = readNumber(source, label)
	if value < 0 then
		fail(label .. " must be 0 or greater")
	end
	return value
end

local function readString(source: any, label: string): string
	if typeof(source) ~= "string" or source == "" then
		fail(label .. " must be a non-empty string")
	end
	return source
end

local function readBoolean(source: any, label: string): boolean
	if typeof(source) ~= "boolean" then
		fail(label .. " must be a boolean")
	end
	return source
end

local function readChannel(source: any, label: string): number
	local value = readNumber(source, label)
	if value < 0 or value > 255 then
		fail(label .. " must be between 0 and 255")
	end
	return value
end

local function readRgb(source: any, label: string): Rgb
	local record = readTable(source, label)
	return {
		r = readChannel(record.r, label .. ".r"),
		g = readChannel(record.g, label .. ".g"),
		b = readChannel(record.b, label .. ".b"),
	}
end

local function assertMaterial(name: string, label: string)
	if name ~= "Brick" and name ~= "Concrete" and name ~= "Asphalt" and name ~= "SmoothPlastic" then
		fail(label .. " material is not supported: " .. name)
	end
end

local function readObstacle(source: any, label: string): ObstacleSpec
	local record = readTable(source, label)
	local spec: ObstacleSpec = {
		name = readString(record.name, label .. ".name"),
		centerX = readNumber(record.centerX, label .. ".centerX"),
		centerZ = readNumber(record.centerZ, label .. ".centerZ"),
		sizeX = readPositive(record.sizeX, label .. ".sizeX"),
		sizeY = readPositive(record.sizeY, label .. ".sizeY"),
		sizeZ = readPositive(record.sizeZ, label .. ".sizeZ"),
		color = readRgb(record.color, label .. ".color"),
		material = readString(record.material, label .. ".material"),
	}
	assertMaterial(spec.material, label)
	return spec
end

local function readZone(source: any, label: string): ZoneSpec
	local record = readTable(source, label)
	return {
		name = readString(record.name, label .. ".name"),
		centerX = readNumber(record.centerX, label .. ".centerX"),
		centerZ = readNumber(record.centerZ, label .. ".centerZ"),
		sizeX = readPositive(record.sizeX, label .. ".sizeX"),
		sizeY = readPositive(record.sizeY, label .. ".sizeY"),
		sizeZ = readPositive(record.sizeZ, label .. ".sizeZ"),
		color = readRgb(record.color, label .. ".color"),
	}
end

local function readWaypoint(source: any, label: string): Waypoint
	local record = readTable(source, label)
	return {
		x = readNumber(record.x, label .. ".x"),
		z = readNumber(record.z, label .. ".z"),
	}
end

local function readWaypoints(source: any, label: string): { Waypoint }
	local list = readArray(source, label)
	local points: { Waypoint } = {}
	for index, entry in list do
		if typeof(index) ~= "number" then
			fail(label .. " must be an array")
		end
		table.insert(points, readWaypoint(entry, label .. "[" .. tostring(index) .. "]"))
	end
	if #points == 0 then
		fail(label .. " must include a waypoint")
	end
	return points
end

local function readMission(source: any, label: string): MissionSpec
	local record = readTable(source, label)
	return {
		name = readString(record.name, label .. ".name"),
		pickup = readZone(record.pickup, label .. ".pickup"),
		dropOff = readZone(record.dropOff, label .. ".dropOff"),
		toPickup = readWaypoints(record.toPickup, label .. ".toPickup"),
		toDropOff = readWaypoints(record.toDropOff, label .. ".toDropOff"),
	}
end

local function loadConfig(): Config
	local configModule = ReplicatedStorage:WaitForChild("ChallengeConfig")
	if configModule:IsA("ModuleScript") ~= true then
		fail("ReplicatedStorage.ChallengeConfig must be a ModuleScript")
	end
	-- The analyzer only resolves string require paths. Studio require() takes the ModuleScript instance.
	local requireInstance: any = require
	local loaded = requireInstance(configModule)
	local root = readTable(loaded, "ChallengeConfig")
	local arena = readTable(root.arena, "arena")
	local robot = readTable(root.robot, "robot")
	local scoring = readTable(root.scoring, "scoring")
	local obstacleSource = readArray(root.obstacles, "obstacles")
	local obstacles: { ObstacleSpec } = {}
	for index, entry in obstacleSource do
		if typeof(index) ~= "number" then
			fail("obstacles must be an array")
		end
		table.insert(obstacles, readObstacle(entry, "obstacles[" .. tostring(index) .. "]"))
	end
	if #obstacles == 0 then
		fail("obstacles must include at least one block")
	end
	local missionSource = readArray(root.missions, "missions")
	local missions: { MissionSpec } = {}
	for index, entry in missionSource do
		if typeof(index) ~= "number" then
			fail("missions must be an array")
		end
		table.insert(missions, readMission(entry, "missions[" .. tostring(index) .. "]"))
	end
	if #missions < 2 then
		fail("missions must include more than one delivery")
	end

	return {
		challengeId = readString(root.challengeId, "challengeId"),
		title = readString(root.title, "title"),
		track = readString(root.track, "track"),
		demoOnly = readBoolean(root.demoOnly, "demoOnly"),
		disclaimer = readString(root.disclaimer, "disclaimer"),
		arena = {
			sizeX = readPositive(arena.sizeX, "arena.sizeX"),
			sizeZ = readPositive(arena.sizeZ, "arena.sizeZ"),
			floorThickness = readPositive(arena.floorThickness, "arena.floorThickness"),
			wallHeight = readPositive(arena.wallHeight, "arena.wallHeight"),
			wallThickness = readPositive(arena.wallThickness, "arena.wallThickness"),
			floorColor = readRgb(arena.floorColor, "arena.floorColor"),
			wallColor = readRgb(arena.wallColor, "arena.wallColor"),
		},
		obstacles = obstacles,
		missions = missions,
		robot = {
			speed = readPositive(robot.speed, "robot.speed"),
			turnRate = readPositive(robot.turnRate, "robot.turnRate"),
			sizeX = readPositive(robot.sizeX, "robot.sizeX"),
			sizeY = readPositive(robot.sizeY, "robot.sizeY"),
			sizeZ = readPositive(robot.sizeZ, "robot.sizeZ"),
			spawnX = readNumber(robot.spawnX, "robot.spawnX"),
			spawnZ = readNumber(robot.spawnZ, "robot.spawnZ"),
			spawnYaw = readNumber(robot.spawnYaw, "robot.spawnYaw"),
		},
		scoring = {
			pointsOnPickup = readNonNegative(scoring.pointsOnPickup, "scoring.pointsOnPickup"),
			pointsPerDelivery = readNonNegative(scoring.pointsPerDelivery, "scoring.pointsPerDelivery"),
			timeLimitSeconds = readPositive(scoring.timeLimitSeconds, "scoring.timeLimitSeconds"),
			collisionPenalty = readNonNegative(scoring.collisionPenalty, "scoring.collisionPenalty"),
			collisionDebounceSeconds = readNonNegative(scoring.collisionDebounceSeconds, "scoring.collisionDebounceSeconds"),
		},
	}
end

local function toColor3(color: Rgb): any
	return Color3.fromRGB(color.r, color.g, color.b)
end

local function materialFromName(name: string): any
	if name == "Brick" then
		return Enum.Material.Brick
	elseif name == "Concrete" then
		return Enum.Material.Concrete
	elseif name == "Asphalt" then
		return Enum.Material.Asphalt
	elseif name == "SmoothPlastic" then
		return Enum.Material.SmoothPlastic
	end
	error("[DeliveryManager] material is not supported: " .. name, 0)
end

local function makePart(name: string, size: any, cframe: any, color: any, material: any, parent: any): any
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.CFrame = cframe
	part.Color = color
	part.Material = material
	part.Anchored = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Parent = parent
	return part
end

local function buildArena(config: Config): BuiltZones
	local arena = config.arena
	local arenaFolder = Instance.new("Folder")
	arenaFolder.Name = "RobotCityArena"
	arenaFolder:SetAttribute("ChallengeId", config.challengeId)
	arenaFolder:SetAttribute("Title", config.title)
	arenaFolder:SetAttribute("Track", config.track)
	arenaFolder:SetAttribute("DemoOnly", config.demoOnly)
	arenaFolder:SetAttribute("Disclaimer", config.disclaimer)
	arenaFolder.Parent = Workspace

	local floor = makePart(
		"Floor",
		Vector3.new(arena.sizeX, arena.floorThickness, arena.sizeZ),
		CFrame.new(0, -arena.floorThickness / 2, 0),
		toColor3(arena.floorColor),
		Enum.Material.Asphalt,
		arenaFolder
	)
	floor.CanCollide = true
	floor.CanTouch = true

	local wallsFolder = Instance.new("Folder")
	wallsFolder.Name = "Walls"
	wallsFolder.Parent = arenaFolder

	local halfX = arena.sizeX / 2
	local halfZ = arena.sizeZ / 2
	local thickness = arena.wallThickness
	type WallSpec = {
		name: string,
		centerX: number,
		centerZ: number,
		sizeX: number,
		sizeZ: number,
	}
	local wallSpecs: { WallSpec } = {
		{ name = "WallNorth", centerX = 0, centerZ = -halfZ + thickness / 2, sizeX = arena.sizeX, sizeZ = thickness },
		{ name = "WallSouth", centerX = 0, centerZ = halfZ - thickness / 2, sizeX = arena.sizeX, sizeZ = thickness },
		{ name = "WallWest", centerX = -halfX + thickness / 2, centerZ = 0, sizeX = thickness, sizeZ = arena.sizeZ },
		{ name = "WallEast", centerX = halfX - thickness / 2, centerZ = 0, sizeX = thickness, sizeZ = arena.sizeZ },
	}
	for _, spec in wallSpecs do
		local wall = makePart(
			spec.name,
			Vector3.new(spec.sizeX, arena.wallHeight, spec.sizeZ),
			CFrame.new(spec.centerX, arena.wallHeight / 2, spec.centerZ),
			toColor3(arena.wallColor),
			Enum.Material.Concrete,
			wallsFolder
		)
		wall.CanCollide = true
		wall.CanTouch = true
		wall:SetAttribute("RobotCityCollider", "wall")
	end

	local obstaclesFolder = Instance.new("Folder")
	obstaclesFolder.Name = "Obstacles"
	obstaclesFolder.Parent = arenaFolder
	for _, spec in config.obstacles do
		local obstacle = makePart(
			spec.name,
			Vector3.new(spec.sizeX, spec.sizeY, spec.sizeZ),
			CFrame.new(spec.centerX, spec.sizeY / 2, spec.centerZ),
			toColor3(spec.color),
			materialFromName(spec.material),
			obstaclesFolder
		)
		obstacle.CanCollide = true
		obstacle.CanTouch = true
		obstacle:SetAttribute("RobotCityCollider", "obstacle")
	end

	local zonesFolder = Instance.new("Folder")
	zonesFolder.Name = "Zones"
	zonesFolder.Parent = arenaFolder

	local function buildZone(spec: ZoneSpec, labelText: string): any
		local zone = makePart(
			spec.name,
			Vector3.new(spec.sizeX, spec.sizeY, spec.sizeZ),
			CFrame.new(spec.centerX, spec.sizeY / 2, spec.centerZ),
			toColor3(spec.color),
			Enum.Material.SmoothPlastic,
			zonesFolder
		)
		zone.CanCollide = false
		zone.CanTouch = true
		zone.CanQuery = false
		zone.Transparency = 0.55

		local billboard = Instance.new("BillboardGui")
		billboard.Name = "Label"
		billboard.Size = UDim2.fromOffset(180, 36)
		billboard.StudsOffset = Vector3.new(0, spec.sizeY / 2 + 1.5, 0)
		billboard.AlwaysOnTop = true
		billboard.MaxDistance = 250
		billboard.Parent = zone

		local text = Instance.new("TextLabel")
		text.Name = "Text"
		text.BackgroundTransparency = 1
		text.Size = UDim2.fromScale(1, 1)
		text.Font = Enum.Font.GothamBold
		text.Text = labelText
		text.TextColor3 = Color3.new(1, 1, 1)
		text.TextScaled = true
		text.Parent = billboard
		return zone
	end

	local missionCount = #config.missions
	local firstMission = config.missions[1]
	if firstMission == nil then
		fail("missions[1] is missing")
	end
	local pickup = buildZone(firstMission.pickup, string.format("Pickup 1/%d", missionCount))
	local dropOff = buildZone(firstMission.dropOff, string.format("Drop-off 1/%d", missionCount))
	pickup.Name = "PickupZone"
	dropOff.Name = "DropOffZone"
	return {
		pickup = pickup,
		dropOff = dropOff,
	}
end

local function createRemotes(): (any, any, any, any)
	local remotes = Instance.new("Folder")
	remotes.Name = "RobotCityRemotes"
	remotes.Parent = ReplicatedStorage

	local movementInput = Instance.new("RemoteEvent")
	movementInput.Name = "MovementInput"
	movementInput.Parent = remotes

	local challengeState = Instance.new("RemoteEvent")
	challengeState.Name = "ChallengeState"
	challengeState.Parent = remotes

	local driveMode = Instance.new("RemoteEvent")
	driveMode.Name = "DriveMode"
	driveMode.Parent = remotes

	local restart = Instance.new("RemoteEvent")
	restart.Name = "Restart"
	restart.Parent = remotes
	return movementInput, challengeState, driveMode, restart
end

local function weldTo(hull: any, other: any)
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = hull
	weld.Part1 = other
	weld.Parent = hull
end

local function playerKey(player: any): string
	return tostring(player.UserId)
end

local config = loadConfig()

if Workspace:FindFirstChild("RobotCityArena") ~= nil then
	warn("[DeliveryManager] Robot City arena already exists; this script did not build a second one.")
	return
end

local zones = buildArena(config)
local movementInput, challengeState, driveModeEvent, restartEvent = createRemotes()

local robotsFolder = Instance.new("Folder")
robotsFolder.Name = "RobotCityRobots"
robotsFolder.Parent = Workspace

local function publish(record: RobotRecord)
	if record.removed then
		return
	end
	local elapsedWhole = math.floor(record.elapsed)
	record.sentElapsed = elapsedWhole
	record.model:SetAttribute("Score", record.score)
	record.model:SetAttribute("Deliveries", record.deliveries)
	record.model:SetAttribute("Collisions", record.collisions)
	record.model:SetAttribute("ElapsedTime", elapsedWhole)
	record.model:SetAttribute("Carrying", record.carrying)
	record.model:SetAttribute("Status", record.status)
	record.model:SetAttribute("TimeLimitSeconds", config.scoring.timeLimitSeconds)
	record.model:SetAttribute("MissionIndex", record.missionIndex)
	record.model:SetAttribute("MissionCount", #config.missions)
	record.model:SetAttribute("DriveMode", record.driveMode)
	record.cargo.Color = if record.carrying then Color3.fromRGB(140, 214, 255) else Color3.fromRGB(88, 96, 108)
	challengeState:FireClient(
		record.player,
		record.score,
		record.deliveries,
		record.collisions,
		elapsedWhole,
		record.carrying,
		record.status,
		config.scoring.timeLimitSeconds,
		record.missionIndex,
		#config.missions,
		record.driveMode
	)
end

local function missionTitle(index: number): string
	local mission = config.missions[index]
	if mission == nil then
		return "Mission"
	end
	return mission.name
end

local function pickupStatus(index: number): string
	return missionTitle(index) .. ". Drive to the blue pickup."
end

local function dropOffStatus(index: number): string
	return missionTitle(index) .. ". Drive to the green drop-off."
end

local function roundOpen(record: RobotRecord): boolean
	return not record.removed and record.status ~= STATUS_TIME_UP and record.status ~= STATUS_COMPLETE
end

local function setZone(zone: any, spec: ZoneSpec, labelText: string)
	zone.Size = Vector3.new(spec.sizeX, spec.sizeY, spec.sizeZ)
	zone.CFrame = CFrame.new(spec.centerX, spec.sizeY / 2, spec.centerZ)
	zone.Color = toColor3(spec.color)
	local billboard = zone:FindFirstChild("Label")
	if billboard == nil then
		return
	end
	local text = billboard:FindFirstChild("Text")
	if text ~= nil then
		text.Text = labelText
	end
end

local function placeMission(index: number)
	local mission = config.missions[index]
	if mission == nil then
		fail("mission " .. tostring(index) .. " is missing")
	end
	local count = #config.missions
	setZone(zones.pickup, mission.pickup, string.format("Pickup %d/%d", index, count))
	setZone(zones.dropOff, mission.dropOff, string.format("Drop-off %d/%d", index, count))
end

local function applyMotion(record: RobotRecord, dt: number)
	local frozen = not roundOpen(record)
	if not frozen then
		record.yaw += record.steer * config.robot.turnRate * dt
	end
	local rotation = CFrame.Angles(0, record.yaw, 0)
	record.align.CFrame = rotation
	local look = rotation.LookVector
	local speed = 0
	if not frozen then
		speed = record.throttle * config.robot.speed
	end
	local vertical = record.hull.AssemblyLinearVelocity.Y
	if typeof(vertical) ~= "number" then
		vertical = 0
	end
	vertical = math.clamp(vertical, -30, 8)
	record.hull.AssemblyLinearVelocity = Vector3.new(look.X * speed, vertical, look.Z * speed)
	if record.hull.Position.Y < -5 then
		record.hull.AssemblyLinearVelocity = Vector3.zero
		record.hull.CFrame = CFrame.new(config.robot.spawnX, record.spawnY, config.robot.spawnZ)
			* CFrame.Angles(0, record.yaw, 0)
	end
end

local function onHullTouched(record: RobotRecord, hit: any)
	if not roundOpen(record) then
		return
	end
	local kind = hit:GetAttribute("RobotCityCollider")
	if kind ~= "wall" and kind ~= "obstacle" then
		return
	end
	local now = os.clock()
	if now - record.lastCollisionAt < config.scoring.collisionDebounceSeconds then
		return
	end
	record.lastCollisionAt = now
	record.collisions += 1
	record.score = math.max(0, record.score - config.scoring.collisionPenalty)
	publish(record)
end

local function recordFromHit(hit: any): RobotRecord?
	local model = hit:FindFirstAncestorOfClass("Model")
	if model == nil then
		return nil
	end
	local ownerId = model:GetAttribute("OwnerUserId")
	if typeof(ownerId) ~= "number" then
		return nil
	end
	local record = robots[tostring(ownerId)]
	if record == nil or record.removed or record.model ~= model then
		return nil
	end
	return record
end

local function completePickup(record: RobotRecord)
	if not roundOpen(record) or record.carrying then
		return
	end
	record.carrying = true
	record.score += config.scoring.pointsOnPickup
	record.waypointIndex = 1
	record.evadeUntil = 0
	record.status = dropOffStatus(record.missionIndex)
	publish(record)
end

local function completeDropOff(record: RobotRecord)
	if not roundOpen(record) or not record.carrying then
		return
	end
	record.carrying = false
	record.deliveries += 1
	record.score += config.scoring.pointsPerDelivery
	record.waypointIndex = 1
	record.evadeUntil = 0
	if record.missionIndex >= #config.missions then
		record.status = STATUS_COMPLETE
		record.throttle = 0
		record.steer = 0
		record.driveMode = "manual"
	else
		record.missionIndex += 1
		placeMission(record.missionIndex)
		record.status = pickupStatus(record.missionIndex)
	end
	publish(record)
end

local function onZoneTouched(kind: string, hit: any)
	local record = recordFromHit(hit)
	if record == nil then
		return
	end
	if kind == "pickup" then
		completePickup(record)
		return
	end
	completeDropOff(record)
end

zones.pickup.Touched:Connect(function(hit: any)
	onZoneTouched("pickup", hit)
end)
zones.dropOff.Touched:Connect(function(hit: any)
	onZoneTouched("dropoff", hit)
end)

local function wrapAngle(rad: number): number
	local turns = (rad + math.pi) / (2 * math.pi)
	return ((turns - math.floor(turns)) * (2 * math.pi)) - math.pi
end

local function flatUnit(vector: any): any
	local flat = Vector3.new(vector.X, 0, vector.Z)
	if flat.Magnitude < 0.05 then
		return Vector3.new(0, 0, -1)
	end
	return flat.Unit
end

local function rayDistance(record: RobotRecord, direction: any, distance: number): number
	local result = Workspace:Raycast(record.hull.Position, direction * distance, record.rayParams)
	if result == nil then
		return distance
	end
	local hitDistance = result.Distance
	if typeof(hitDistance) ~= "number" then
		return distance
	end
	return hitDistance
end

local function activeRoute(record: RobotRecord): { Waypoint }
	local mission = config.missions[record.missionIndex]
	if mission == nil then
		return {}
	end
	if record.carrying then
		return mission.toDropOff
	end
	return mission.toPickup
end

-- Scripted auto-drive: steer toward the active mission's street waypoints and
-- turn away from a nearby wall or building. This is not a trained model.
local function scriptedDrive(record: RobotRecord)
	local route = activeRoute(record)
	if #route == 0 then
		record.throttle = 0
		record.steer = 0
		return
	end
	local index = record.waypointIndex
	if index < 1 then
		index = 1
	end
	if index > #route then
		index = #route
	end
	local point = route[index]
	local pos = record.hull.Position
	local dx = point.x - pos.X
	local dz = point.z - pos.Z
	local dist = math.sqrt((dx * dx) + (dz * dz))
	if dist < WAYPOINT_RADIUS and index < #route then
		index += 1
		record.waypointIndex = index
		point = route[index]
		dx = point.x - pos.X
		dz = point.z - pos.Z
		dist = math.sqrt((dx * dx) + (dz * dz))
	end

	local diff = wrapAngle(math.atan2(-dx, -dz) - record.yaw)
	local steer = math.clamp(diff / math.rad(35), -1, 1)
	local throttle = 1
	if math.abs(diff) > math.rad(55) then
		throttle = 0.2
	elseif math.abs(diff) > math.rad(25) then
		throttle = 0.55
	end
	if dist < WAYPOINT_RADIUS then
		throttle = math.min(throttle, 0.35)
	end

	local rotation = CFrame.Angles(0, record.yaw, 0)
	local look = flatUnit(rotation.LookVector)
	local right = flatUnit(rotation.RightVector)
	local ahead = rayDistance(record, look, AVOID_LOOK_DISTANCE)
	local leftDist = rayDistance(record, flatUnit(look - right), AVOID_SIDE_DISTANCE)
	local rightDist = rayDistance(record, flatUnit(look + right), AVOID_SIDE_DISTANCE)
	if ahead < 7 then
		local capped = if ahead < 4 then 0.15 else 0.45
		throttle = math.min(throttle, capped)
		local turnLeft = leftDist > rightDist + 0.5
		if not turnLeft and rightDist <= leftDist + 0.5 then
			turnLeft = steer < 0
		end
		steer = if turnLeft then -1 else 1
	end

	local now = os.clock()
	if now < record.evadeUntil then
		record.throttle = 0.4
		record.steer = record.evadeSteer
		return
	end
	local movedX = pos.X - record.anchorX
	local movedZ = pos.Z - record.anchorZ
	local moved = math.sqrt((movedX * movedX) + (movedZ * movedZ))
	if now - record.anchorAt > 1.25 then
		if moved < 1.2 and throttle > 0.15 then
			record.evadeSteer = if record.evadeSteer > 0 then -1 else 1
			record.evadeUntil = now + 0.7
			record.anchorAt = now
			record.anchorX = pos.X
			record.anchorZ = pos.Z
			record.throttle = 0.35
			record.steer = record.evadeSteer
			return
		end
		record.anchorAt = now
		record.anchorX = pos.X
		record.anchorZ = pos.Z
	end
	record.throttle = throttle
	record.steer = steer
end

local function placeRobotAtSpawn(record: RobotRecord)
	record.yaw = config.robot.spawnYaw
	record.throttle = 0
	record.steer = 0
	record.hull.AssemblyLinearVelocity = Vector3.zero
	record.hull.AssemblyAngularVelocity = Vector3.zero
	record.hull.CFrame = CFrame.new(config.robot.spawnX, record.spawnY, config.robot.spawnZ)
		* CFrame.Angles(0, record.yaw, 0)
	record.align.CFrame = CFrame.Angles(0, record.yaw, 0)
	record.anchorX = config.robot.spawnX
	record.anchorZ = config.robot.spawnZ
	record.anchorAt = os.clock()
end

local function restartRound(record: RobotRecord)
	record.score = 0
	record.deliveries = 0
	record.collisions = 0
	record.carrying = false
	record.startedAt = os.clock()
	record.elapsed = 0
	record.sentElapsed = -1
	record.lastCollisionAt = 0
	record.lastInputAt = 0
	record.driveMode = "manual"
	record.missionIndex = 1
	record.waypointIndex = 1
	record.evadeUntil = 0
	record.evadeSteer = 1
	record.status = pickupStatus(1)
	placeMission(1)
	placeRobotAtSpawn(record)
	publish(record)
end

local function hullInsideZone(hull: any, zone: any): boolean
	local delta = hull.Position - zone.Position
	local half = zone.Size * 0.5
	local ax = math.abs(delta.X)
	local ay = math.abs(delta.Y)
	local az = math.abs(delta.Z)
	if typeof(ax) ~= "number" or typeof(ay) ~= "number" or typeof(az) ~= "number" then
		return false
	end
	return ax <= half.X and az <= half.Z and ay <= half.Y + 3
end

local function spawnRobot(player: any)
	local key = playerKey(player)
	if robots[key] ~= nil then
		return
	end

	local sizeX = config.robot.sizeX
	local sizeY = config.robot.sizeY
	local sizeZ = config.robot.sizeZ
	local spawnY = sizeY / 2 + 1
	local spawn = CFrame.new(config.robot.spawnX, spawnY, config.robot.spawnZ) * CFrame.Angles(0, config.robot.spawnYaw, 0)

	local model = Instance.new("Model")
	model.Name = "DeliveryRobot_" .. key
	model:SetAttribute("OwnerUserId", player.UserId)
	model:SetAttribute("ChallengeId", config.challengeId)
	model:SetAttribute("DemoOnly", config.demoOnly)
	model:SetAttribute("Track", config.track)

	local hull = Instance.new("Part")
	hull.Name = "Hull"
	hull.Size = Vector3.new(sizeX, sizeY, sizeZ)
	hull.Color = Color3.fromRGB(240, 186, 48)
	hull.Material = Enum.Material.SmoothPlastic
	hull.Anchored = false
	hull.CanCollide = true
	hull.CanTouch = true
	hull.TopSurface = Enum.SurfaceType.Smooth
	hull.BottomSurface = Enum.SurfaceType.Smooth
	hull.CustomPhysicalProperties = PhysicalProperties.new(0.8, 0.5, 0.05, 1, 1)
	hull.CFrame = spawn
	hull.Parent = model

	local cargo = Instance.new("Part")
	cargo.Name = "CargoBay"
	cargo.Size = Vector3.new(sizeX * 0.72, sizeY * 0.55, sizeZ * 0.42)
	cargo.Color = Color3.fromRGB(88, 96, 108)
	cargo.Material = Enum.Material.SmoothPlastic
	cargo.Anchored = false
	cargo.CanCollide = false
	cargo.CanTouch = false
	cargo.Massless = true
	cargo.CFrame = spawn * CFrame.new(0, sizeY / 2 + cargo.Size.Y / 2, sizeZ * 0.08)
	cargo.Parent = model
	weldTo(hull, cargo)

	local nose = Instance.new("Part")
	nose.Name = "Nose"
	nose.Size = Vector3.new(sizeX * 0.35, sizeY * 0.28, 0.6)
	nose.Color = Color3.fromRGB(40, 44, 52)
	nose.Material = Enum.Material.SmoothPlastic
	nose.Anchored = false
	nose.CanCollide = false
	nose.CanTouch = false
	nose.Massless = true
	nose.CFrame = spawn * CFrame.new(0, 0.15, -sizeZ / 2 - 0.3)
	nose.Parent = model
	weldTo(hull, nose)

	model.PrimaryPart = hull
	model.Parent = robotsFolder

	local rayParams = RaycastParams.new()
	rayParams.FilterType = Enum.RaycastFilterType.Exclude
	rayParams.FilterDescendantsInstances = { model }
	rayParams.IgnoreWater = true

	local attachment = Instance.new("Attachment")
	attachment.Name = "DriveAttachment"
	attachment.Parent = hull

	local align = Instance.new("AlignOrientation")
	align.Name = "DriveOrientation"
	align.Mode = Enum.OrientationAlignmentMode.OneAttachment
	align.Attachment0 = attachment
	align.RigidityEnabled = false
	align.Responsiveness = 40
	align.MaxTorque = 100000
	align.MaxAngularVelocity = 12
	align.CFrame = CFrame.Angles(0, config.robot.spawnYaw, 0)
	align.Parent = hull

	task.defer(function()
		local ownerOk, ownerErr = pcall(function()
			hull:SetNetworkOwner(nil)
		end)
		if not ownerOk then
			warn("[DeliveryManager] Server network ownership was not set: " .. tostring(ownerErr))
		end
	end)

	local record: RobotRecord = {
		player = player,
		model = model,
		hull = hull,
		cargo = cargo,
		align = align,
		yaw = config.robot.spawnYaw,
		throttle = 0,
		steer = 0,
		lastInputAt = 0,
		lastCollisionAt = 0,
		startedAt = os.clock(),
		elapsed = 0,
		sentElapsed = -1,
		score = 0,
		deliveries = 0,
		collisions = 0,
		carrying = false,
		status = pickupStatus(1),
		removed = false,
		spawnY = spawnY,
		driveMode = "manual",
		missionIndex = 1,
		waypointIndex = 1,
		evadeUntil = 0,
		evadeSteer = 1,
		anchorX = config.robot.spawnX,
		anchorZ = config.robot.spawnZ,
		anchorAt = os.clock(),
		rayParams = rayParams,
	}
	robots[key] = record
	hull.Touched:Connect(function(hit: any)
		onHullTouched(record, hit)
	end)
	publish(record)
end

local function parkCharacter(character: any)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if humanoid ~= nil then
		humanoid.WalkSpeed = 0
		humanoid.JumpHeight = 0
		humanoid.PlatformStand = true
		humanoid.AutoRotate = false
	end
	local root = character:WaitForChild("HumanoidRootPart")
	if root:IsA("BasePart") then
		root.Anchored = true
		root.CFrame = CFrame.new(0, 50, 0)
	end
end

local robotClaimed = false

local function onPlayerAdded(player: any)
	player.CharacterAdded:Connect(parkCharacter)
	if player.Character ~= nil then
		task.defer(parkCharacter, player.Character)
	end
	if robotClaimed then
		return
	end
	robotClaimed = true
	spawnRobot(player)
end

local function onPlayerRemoving(player: any)
	local key = playerKey(player)
	local record = robots[key]
	if record == nil then
		return
	end
	record.removed = true
	record.model:Destroy()
	robots[key] = nil
end

movementInput.OnServerEvent:Connect(function(player: any, throttleValue: any, steerValue: any)
	local record = robots[playerKey(player)]
	if record == nil or record.driveMode == "auto" or not roundOpen(record) then
		return
	end
	if typeof(throttleValue) ~= "number" or typeof(steerValue) ~= "number" then
		return
	end
	if throttleValue ~= throttleValue or steerValue ~= steerValue then
		return
	end
	record.throttle = math.clamp(throttleValue, -1, 1)
	record.steer = math.clamp(steerValue, -1, 1)
	record.lastInputAt = os.clock()
end)

driveModeEvent.OnServerEvent:Connect(function(player: any, mode: any)
	local record = robots[playerKey(player)]
	if record == nil or not roundOpen(record) then
		return
	end
	if mode ~= "manual" and mode ~= "auto" then
		return
	end
	record.driveMode = mode
	record.throttle = 0
	record.steer = 0
	record.waypointIndex = 1
	record.evadeUntil = 0
	publish(record)
end)

restartEvent.OnServerEvent:Connect(function(player: any)
	local record = robots[playerKey(player)]
	if record == nil or record.removed then
		return
	end
	restartRound(record)
end)

RunService.Heartbeat:Connect(function(dt: number)
	if dt > MAX_STEP_SECONDS then
		dt = MAX_STEP_SECONDS
	end
	local now = os.clock()
	for _, record in robots do
		if record.removed then
			continue
		end
		record.elapsed = now - record.startedAt
		if record.status ~= STATUS_COMPLETE and record.elapsed >= config.scoring.timeLimitSeconds then
			record.throttle = 0
			record.steer = 0
			if record.status ~= STATUS_TIME_UP then
				record.status = STATUS_TIME_UP
				publish(record)
			end
			applyMotion(record, dt)
			continue
		end
		if not roundOpen(record) then
			record.throttle = 0
			record.steer = 0
			applyMotion(record, dt)
			continue
		end
		if record.driveMode == "auto" then
			scriptedDrive(record)
		elseif now - record.lastInputAt > INPUT_TIMEOUT_SECONDS then
			record.throttle = 0
			record.steer = 0
		end
		applyMotion(record, dt)
		if hullInsideZone(record.hull, zones.pickup) then
			completePickup(record)
		elseif hullInsideZone(record.hull, zones.dropOff) then
			completeDropOff(record)
		end
		if math.floor(record.elapsed) ~= record.sentElapsed then
			publish(record)
		end
	end
end)

Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(onPlayerRemoving)
for _, player in Players:GetPlayers() do
	onPlayerAdded(player)
end
