--!strict
-- BOTKET Robot City - Autonomous Delivery Challenge #001
-- Demo-only LocalScript. Not verified in Roblox Studio. Not published.
--
-- Studio paste: LocalScript named RobotController, parented to
-- StarterPlayer.StarterPlayerScripts.
-- Manual drive: MovementInput. Scripted auto toggle: DriveMode. Restart: Restart.
-- Score snapshots arrive on ChallengeState.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local SEND_INTERVAL_SECONDS = 0.05
local JOYSTICK_DEAD_ZONE = 10

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local movementEvent: any = nil
local driveModeEvent: any = nil
local restartEvent: any = nil
local currentDriveMode = "manual"
local joystickActive = false
local joystickThrottle = 0
local joystickSteer = 0
local activeTouch: any = nil
local followedHull: any = nil

local gui = Instance.new("ScreenGui")
gui.Name = "RobotCityHUD"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = playerGui

local panel = Instance.new("Frame")
panel.Name = "StatusPanel"
panel.AnchorPoint = Vector2.new(0.5, 0)
panel.Position = UDim2.new(0.5, 0, 0, 12)
panel.Size = UDim2.new(0.92, 0, 0, 120)
panel.BackgroundColor3 = Color3.fromRGB(22, 24, 28)
panel.BackgroundTransparency = 0.25
panel.BorderSizePixel = 0
panel.Parent = gui

local panelCorner = Instance.new("UICorner")
panelCorner.CornerRadius = UDim.new(0, 8)
panelCorner.Parent = panel

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 8)
padding.PaddingBottom = UDim.new(0, 8)
padding.PaddingLeft = UDim.new(0, 12)
padding.PaddingRight = UDim.new(0, 12)
padding.Parent = panel

local statusLabel = Instance.new("TextLabel")
statusLabel.Name = "Status"
statusLabel.BackgroundTransparency = 1
statusLabel.Size = UDim2.fromScale(1, 1)
statusLabel.Font = Enum.Font.GothamMedium
statusLabel.TextSize = 16
statusLabel.TextXAlignment = Enum.TextXAlignment.Left
statusLabel.TextYAlignment = Enum.TextYAlignment.Top
statusLabel.TextColor3 = Color3.fromRGB(240, 242, 245)
statusLabel.TextWrapped = true
statusLabel.Text = "Waiting for the delivery robot..."
statusLabel.Parent = panel

local buttonRow = Instance.new("Frame")
buttonRow.Name = "Buttons"
buttonRow.AnchorPoint = Vector2.new(1, 1)
buttonRow.Position = UDim2.new(1, -16, 1, -24)
buttonRow.Size = UDim2.fromOffset(220, 100)
buttonRow.BackgroundTransparency = 1
buttonRow.Parent = gui

local buttonLayout = Instance.new("UIListLayout")
buttonLayout.FillDirection = Enum.FillDirection.Vertical
buttonLayout.HorizontalAlignment = Enum.HorizontalAlignment.Right
buttonLayout.Padding = UDim.new(0, 8)
buttonLayout.Parent = buttonRow

local function makeButton(name: string, text: string, color: any): any
	local button = Instance.new("TextButton")
	button.Name = name
	button.Size = UDim2.fromOffset(210, 44)
	button.BackgroundColor3 = color
	button.BorderSizePixel = 0
	button.Font = Enum.Font.GothamBold
	button.TextSize = 16
	button.TextColor3 = Color3.fromRGB(12, 16, 20)
	button.Text = text
	button.AutoButtonColor = true
	button.Parent = buttonRow
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = button
	return button
end

local modeButton = makeButton("DriveMode", "Scripted AI: Off", Color3.fromRGB(67, 214, 208))
local restartButton = makeButton("Restart", "Restart", Color3.fromRGB(240, 186, 48))

local joystickBase = Instance.new("Frame")
joystickBase.Name = "Joystick"
joystickBase.AnchorPoint = Vector2.new(0, 1)
joystickBase.Position = UDim2.new(0, 20, 1, -24)
joystickBase.Size = UDim2.fromOffset(150, 150)
joystickBase.BackgroundColor3 = Color3.fromRGB(18, 20, 24)
joystickBase.BackgroundTransparency = 0.35
joystickBase.BorderSizePixel = 0
joystickBase.Visible = UserInputService.TouchEnabled
joystickBase.Parent = gui

local baseCorner = Instance.new("UICorner")
baseCorner.CornerRadius = UDim.new(1, 0)
baseCorner.Parent = joystickBase

local knob = Instance.new("Frame")
knob.Name = "Knob"
knob.AnchorPoint = Vector2.new(0.5, 0.5)
knob.Position = UDim2.fromScale(0.5, 0.5)
knob.Size = UDim2.fromOffset(64, 64)
knob.BackgroundColor3 = Color3.fromRGB(240, 186, 48)
knob.BorderSizePixel = 0
knob.Parent = joystickBase

local knobCorner = Instance.new("UICorner")
knobCorner.CornerRadius = UDim.new(1, 0)
knobCorner.Parent = knob

local function controlHint(): string
	if UserInputService.TouchEnabled then
		return "Joystick or WASD"
	end
	return "WASD"
end

local function showStatus(
	score: number,
	deliveries: number,
	collisions: number,
	elapsed: number,
	carrying: boolean,
	status: string,
	timeLimit: number,
	missionIndex: number,
	missionCount: number,
	driveMode: string
)
	currentDriveMode = driveMode
	if driveMode == "auto" then
		modeButton.Text = "Scripted AI: On"
	else
		modeButton.Text = "Scripted AI: Off"
	end
	local remaining = timeLimit - elapsed
	if remaining < 0 then
		remaining = 0
	end
	local carryText = if carrying then "yes" else "no"
	statusLabel.Text = string.format(
		"Score %d    Deliveries %d    Collisions %d\nMission %d/%d    Time left %ds    Carrying %s\n%s\n%s",
		score,
		deliveries,
		collisions,
		missionIndex,
		missionCount,
		remaining,
		carryText,
		status,
		controlHint()
	)
end

local function onState(
	score: any,
	deliveries: any,
	collisions: any,
	elapsed: any,
	carrying: any,
	status: any,
	timeLimit: any,
	missionIndex: any,
	missionCount: any,
	driveMode: any
)
	if typeof(score) ~= "number" or typeof(deliveries) ~= "number" or typeof(collisions) ~= "number" then
		return
	end
	if typeof(elapsed) ~= "number" or typeof(timeLimit) ~= "number" then
		return
	end
	if typeof(carrying) ~= "boolean" or typeof(status) ~= "string" then
		return
	end
	if typeof(missionIndex) ~= "number" or typeof(missionCount) ~= "number" or typeof(driveMode) ~= "string" then
		return
	end
	showStatus(score, deliveries, collisions, elapsed, carrying, status, timeLimit, missionIndex, missionCount, driveMode)
end

local function keyboardAxes(): (number, number)
	local forward = 0
	local turn = 0
	if UserInputService:IsKeyDown(Enum.KeyCode.W) then
		forward += 1
	end
	if UserInputService:IsKeyDown(Enum.KeyCode.S) then
		forward -= 1
	end
	if UserInputService:IsKeyDown(Enum.KeyCode.D) then
		turn += 1
	end
	if UserInputService:IsKeyDown(Enum.KeyCode.A) then
		turn -= 1
	end
	return math.clamp(forward, -1, 1), math.clamp(turn, -1, 1)
end

local function resetKnob()
	joystickThrottle = 0
	joystickSteer = 0
	knob.Position = UDim2.fromScale(0.5, 0.5)
end

local function updateJoystick(position: any)
	local center = joystickBase.AbsolutePosition + (joystickBase.AbsoluteSize * 0.5)
	local delta = Vector2.new(position.X - center.X, position.Y - center.Y)
	local travel = (joystickBase.AbsoluteSize.X * 0.5) - (knob.AbsoluteSize.X * 0.5)
	if travel < 1 then
		travel = 1
	end
	local magnitude = delta.Magnitude
	if magnitude > travel and magnitude > 0 then
		delta = delta.Unit * travel
		magnitude = travel
	end
	knob.Position = UDim2.new(0.5, delta.X, 0.5, delta.Y)
	if magnitude < JOYSTICK_DEAD_ZONE then
		joystickThrottle = 0
		joystickSteer = 0
		return
	end
	joystickSteer = math.clamp(delta.X / travel, -1, 1)
	joystickThrottle = math.clamp(-delta.Y / travel, -1, 1)
end

local function touchInJoystick(position: any): boolean
	local origin = joystickBase.AbsolutePosition
	local size = joystickBase.AbsoluteSize
	local insideX = position.X >= origin.X and position.X <= origin.X + size.X
	local insideY = position.Y >= origin.Y and position.Y <= origin.Y + size.Y
	return insideX and insideY
end

local function readAxes(): (number, number)
	if joystickActive then
		return joystickThrottle, joystickSteer
	end
	return keyboardAxes()
end

local function applyCamera()
	local camera = Workspace.CurrentCamera
	if camera ~= nil and followedHull ~= nil then
		camera.CameraSubject = followedHull
		camera.CameraType = Enum.CameraType.Custom
	end
end

local function considerRobot(child: any)
	if child:IsA("Model") ~= true then
		return
	end
	if child:GetAttribute("OwnerUserId") ~= player.UserId then
		return
	end
	local hull = child:WaitForChild("Hull")
	if hull:IsA("BasePart") then
		followedHull = hull
		applyCamera()
	end
end

local function disableDefaultControls()
	local ok, err = pcall(function()
		local scripts = player:WaitForChild("PlayerScripts")
		local moduleScript = scripts:WaitForChild("PlayerModule")
		local requireInstance: any = require
		local playerModule = requireInstance(moduleScript)
		playerModule:GetControls():Disable()
	end)
	if not ok then
		warn("[RobotController] Default character controls were left on: " .. tostring(err))
	end
end

UserInputService.InputBegan:Connect(function(input: any, _processed: any)
	if input.UserInputType ~= Enum.UserInputType.Touch then
		return
	end
	if activeTouch ~= nil or joystickBase.Visible ~= true then
		return
	end
	if touchInJoystick(input.Position) then
		activeTouch = input
		joystickActive = true
		updateJoystick(input.Position)
	end
end)

UserInputService.InputChanged:Connect(function(input: any, _processed: any)
	if input == activeTouch then
		updateJoystick(input.Position)
	end
end)

UserInputService.InputEnded:Connect(function(input: any, _processed: any)
	if input == activeTouch then
		activeTouch = nil
		joystickActive = false
		resetKnob()
	end
end)

UserInputService.WindowFocusReleased:Connect(function()
	activeTouch = nil
	joystickActive = false
	resetKnob()
end)

Workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(applyCamera)
player.CharacterAdded:Connect(function(_character: any)
	task.defer(applyCamera)
end)

task.delay(10, function()
	if movementEvent == nil then
		statusLabel.Text = "Still waiting for RobotCityRemotes. DeliveryManager should be a server Script, and ChallengeConfig a ModuleScript in ReplicatedStorage."
	end
end)

disableDefaultControls()

local remotes = ReplicatedStorage:WaitForChild("RobotCityRemotes")
movementEvent = remotes:WaitForChild("MovementInput")
driveModeEvent = remotes:WaitForChild("DriveMode")
restartEvent = remotes:WaitForChild("Restart")
local stateEvent = remotes:WaitForChild("ChallengeState")
stateEvent.OnClientEvent:Connect(onState)

modeButton.Activated:Connect(function()
	if driveModeEvent == nil then
		return
	end
	local nextMode = if currentDriveMode == "auto" then "manual" else "auto"
	currentDriveMode = nextMode
	if nextMode == "auto" then
		modeButton.Text = "Scripted AI: On"
	else
		modeButton.Text = "Scripted AI: Off"
	end
	driveModeEvent:FireServer(nextMode)
end)

restartButton.Activated:Connect(function()
	if restartEvent == nil then
		return
	end
	restartEvent:FireServer()
end)

local robotsFolder = Workspace:WaitForChild("RobotCityRobots")
robotsFolder.ChildAdded:Connect(considerRobot)
for _, child in robotsFolder:GetChildren() do
	considerRobot(child)
end

task.delay(5, function()
	if followedHull == nil and movementEvent ~= nil then
		statusLabel.Text = "This demo spawns one robot for the first player. No robot is assigned to this client."
	end
end)

local sendAccum = 0
RunService.Heartbeat:Connect(function(dt: number)
	sendAccum += dt
	if sendAccum < SEND_INTERVAL_SECONDS then
		return
	end
	sendAccum = 0
	if movementEvent == nil then
		return
	end
	local throttle, steer = readAxes()
	movementEvent:FireServer(throttle, steer)
end)
