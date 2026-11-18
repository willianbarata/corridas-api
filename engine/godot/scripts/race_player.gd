extends Node3D
# Corrida de animais renderizada a partir do JSON normalizado (packages/race-schema/validateRace).
# Tudo é calculado pelo tempo do vídeo (determinístico, sem física): mesma entrada -> mesmo vídeo.
const Props = preload("res://scripts/prop_factory.gd")
const TRACK_DIR := "res://assets/track/"
const LANE_W := 2.2

var race: Dictionary
var fps := 24
var frame := 0
var near_gate: Node3D  # poste do pórtico da largada do lado da câmera
var near_pole: Node3D  # poste da chegada do lado da câmera (some na câmera lenta para não tapar)
var recording := false
var L := 60.0
var n := 2
var runners: Array = []        # [{node, cfg, label, stride}]
var camera: Camera3D
var cap_top: Label
var cap_center: Label
var cap_bottom: Label
var cap_winner: Label
var confetti: Array = []
var crowd: Array = []
var start_lamps: Array = []
var tl: Dictionary

func _ready() -> void:
	var path := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--story="):
			path = arg.trim_prefix("--story=")
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary or not parsed.has("corredores"):
		push_error("Invalid story JSON: " + path)
		get_tree().quit(2)
		return
	race = parsed
	tl = race.timeline
	fps = int(race.video.fps)
	recording = OS.has_feature("movie") or "--write-movie" in OS.get_cmdline_args()
	L = float(race.pista.comprimento)
	n = race.corredores.size()
	_build_world()
	_build_track()
	_build_runners()
	_build_overlay()
	_build_confetti()
	camera = Camera3D.new()
	camera.fov = 42
	add_child(camera)
	camera.make_current()
	evaluate(0.0)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--debug-t="):
			_debug_at(float(arg.trim_prefix("--debug-t=")))
		if arg.begins_with("--start-t="):
			frame = int(float(arg.trim_prefix("--start-t=")) * fps)
	print("STORY_READY ", race.title, " frames=", int(float(race.duration) * fps))

# ---------- mundo ----------
func _mat(hex: String, rough := 0.85) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(hex)
	m.roughness = rough
	return m

func _box(pos: Vector3, size: Vector3, m: Material, parent: Node = self) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	mi.mesh = b
	mi.material_override = m
	mi.position = pos
	parent.add_child(mi)
	return mi

func _gltf(name: String) -> Node3D:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--sem=") and name in arg.trim_prefix("--sem=").split(","):
			return Node3D.new()
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	if doc.append_from_file(ProjectSettings.globalize_path(TRACK_DIR + name + ".gltf"), st) != OK:
		push_error("Peça da pista não carregou: " + name)
		return Node3D.new()
	# Algumas peças Kenney vêm com a malha deslocada da origem: recentraliza (base no chão, centro em X/Z).
	var scene: Node3D = doc.generate_scene(st)
	var box := AABB()
	var first := true
	for m in scene.find_children("*", "MeshInstance3D", true, false):
		var mi: MeshInstance3D = m
		var xf := Transform3D.IDENTITY
		var p: Node = mi
		while p != scene:
			xf = (p as Node3D).transform * xf
			p = p.get_parent()
		var b := xf * mi.get_aabb()
		box = b if first else box.merge(b)
		first = false
	var holder := Node3D.new()
	holder.name = name
	holder.add_child(scene)
	if not first:
		scene.position = -Vector3(box.get_center().x, box.position.y, box.get_center().z)
	return holder

func _build_world() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#8FD0F2")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#F6EEDF")
	env.ambient_light_energy = 0.45
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, 35, 0)
	sun.light_color = Color("#FFF2D6")
	sun.light_energy = 0.8
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 60.0
	add_child(sun)
	_box(Vector3(L * 0.5, -0.06, 0), Vector3(L + 120, 0.1, 160), _mat("#79C25E"))

func _lane_z(lane: int) -> float:
	return (float(lane) - (n - 1) * 0.5) * LANE_W

func _build_track() -> void:
	var half := n * LANE_W * 0.5 + 0.5
	var x0 := -8.0
	var x1 := L + 16.0
	_box(Vector3((x0 + x1) * 0.5, 0.0, 0), Vector3(x1 - x0, 0.04, half * 2), _mat("#C4583C"))
	var white := _mat("#FFFFFF", 0.6)
	for i in n + 1:
		var z := (float(i) - n * 0.5) * LANE_W
		_box(Vector3((x0 + x1) * 0.5, 0.025, z), Vector3(x1 - x0, 0.012, 0.06), white)
	_box(Vector3(0, 0.03, 0), Vector3(0.18, 0.015, half * 2), white)  # largada
	# chegada quadriculada
	var black := _mat("#151515", 0.6)
	var sq := 0.45
	var cols := 2
	var rows := int(ceil(half * 2 / sq))
	for c in cols:
		for r in rows:
			_box(Vector3(L + (c - 0.5) * sq, 0.03, -half + (r + 0.5) * sq), Vector3(sq, 0.016, sq), white if (c + r) % 2 == 0 else black)
	# pórtico de chegada: postes + faixa
	var pole := _mat("#F4F4F4", 0.5)
	for side in [-1, 1]:
		var pb := _box(Vector3(L, 2.2, side * (half + 0.3)), Vector3(0.25, 4.4, 0.25), pole)
		if side == 1:
			near_pole = pb
	_box(Vector3(L, 4.3, 0), Vector3(0.3, 0.7, half * 2 + 0.85), _mat("#E63946", 0.5))
	var banner := Label3D.new()
	banner.text = "CHEGADA"
	banner.font_size = 160
	banner.outline_size = 24
	banner.modulate = Color.WHITE
	banner.position = Vector3(L - 0.2, 4.3, 0)
	banner.rotation_degrees = Vector3(0, -90, 0)
	banner.pixel_size = 0.006
	add_child(banner)
	var banner2: Label3D = banner.duplicate()
	banner2.position = Vector3(L + 0.2, 4.3, 0)
	banner2.rotation_degrees = Vector3(0, 90, 0)
	add_child(banner2)
	# bandeiras quadriculadas e luzes da largada (Kenney Racing Kit)
	for side in [-1, 1]:
		var flag := _gltf("flagCheckers")
		flag.scale = Vector3.ONE * 2.2
		flag.position = Vector3(L + 1.2, 0, side * (half + 1.2))
		add_child(flag)
	# pórtico da largada (caixas): postes + travessa com 4 luzes
	for side in [-1, 1]:
		var gp := _box(Vector3(-0.8, 1.8, side * (half + 0.3)), Vector3(0.22, 3.6, 0.22), _mat("#3A3D46", 0.5))
		if side == 1:
			near_gate = gp
	_box(Vector3(-0.8, 3.5, 0), Vector3(0.3, 0.35, half * 2 + 0.8), _mat("#3A3D46", 0.5))
	for i in 4:
		var lamp := MeshInstance3D.new()
		var sph := SphereMesh.new()
		sph.radius = 0.22
		sph.height = 0.44
		lamp.mesh = sph
		var lm := _mat("#FF3B30", 0.3)
		lm.emission_enabled = true
		lm.emission = Color("#FF3B30")
		lamp.material_override = lm
		lamp.position = Vector3(-0.6, 3.5, (i - 1.5) * 0.7)
		lamp.set_meta("lamp", i)
		add_child(lamp)
		start_lamps.append(lamp)
	# arquibancadas cobertas do lado oposto à câmera, com torcida
	var rngc := RandomNumberGenerator.new()
	rngc.seed = int(race.seed) + 99
	var colors := ["#E63946", "#F4A261", "#2A9D8F", "#264653", "#E9C46A", "#8E5BD6", "#FFFFFF", "#3A86FF"]
	var stand_a := _mat("#D9DDE4", 0.8)
	var stand_b := _mat("#AEB6C2", 0.8)
	var roof_a := _mat("#E63946", 0.6)
	var roof_b := _mat("#FFFFFF", 0.6)
	var x := -6.0
	while x < L + 12.0:
		# arquibancada feita de caixas (o modelo Kenney vinha deslocado e tapava a câmera)
		for row in 4:
			var top := 0.7 + row * 0.95
			_box(Vector3(x, top * 0.5, -half - 1.9 - row * 1.05), Vector3(4.4, top, 1.05), stand_a if row % 2 == 0 else stand_b)
		_box(Vector3(x, 2.8, -half - 6.3), Vector3(4.4, 5.6, 0.3), stand_b)
		_box(Vector3(x, 5.7, -half - 3.6), Vector3(4.5, 0.18, 5.8), roof_a if int(round((x + 6.0) / 4.5)) % 2 == 0 else roof_b)
		for row in 4:
			for k in 7:
				var head := MeshInstance3D.new()
				var sph := SphereMesh.new()
				sph.radius = 0.22
				sph.height = 0.44
				head.mesh = sph
				head.material_override = _mat(colors[rngc.randi() % colors.size()], 0.7)
				head.position = Vector3(x - 1.9 + k * 0.62 + rngc.randf_range(-0.1, 0.1), 1.05 + row * 0.95, -half - 1.9 - row * 1.05)
				var body := MeshInstance3D.new()
				var bm := BoxMesh.new()
				bm.size = Vector3(0.38, 0.42, 0.26)
				body.mesh = bm
				body.material_override = head.material_override
				body.position = Vector3(0, -0.36, 0)
				head.add_child(body)
				head.set_meta("phase", rngc.randf() * TAU)
				head.set_meta("base_y", head.position.y)
				add_child(head)
				crowd.append(head)
		x += 4.5
	# outdoors e árvores atrás
	var bx := 4.0
	while bx < L + 10:
		var tree := _gltf("treeLarge")
		tree.scale = Vector3.ONE * 4.0
		tree.position = Vector3(bx + 2.0, 0, -half - 9.5)
		add_child(tree)
		bx += 9.0

func _build_runners() -> void:
	for cfg in race.corredores:
		var node: Node3D = Props.create(cfg.id, cfg.id)
		node.rotation.y = PI / 2  # modelos Gobkit olham para +Z; a pista corre em +X
		add_child(node)
		var lift := _ground_lift(node)
		var label := Label3D.new()
		label.text = String(cfg.nome)
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.font_size = 64
		label.outline_size = 16
		label.pixel_size = 0.005
		label.no_depth_test = true
		label.modulate = Color.WHITE
		label.outline_modulate = Color("#111111")
		add_child(label)
		runners.append({"node": node, "cfg": cfg, "label": label, "stride": float(cfg.altura) * 0.9, "lift": lift})

# Quanto subir o bicho para os pés tocarem o chão (alguns modelos têm a origem no meio do corpo).
func _ground_lift(node: Node3D) -> float:
	Props.animate(node, "idle", 0.0)
	var min_mesh := INF
	for m in node.find_children("*", "MeshInstance3D", true, false):
		var mi: MeshInstance3D = m
		min_mesh = minf(min_mesh, (mi.global_transform * mi.get_aabb()).position.y)
	return maxf(0.0, -min_mesh) if min_mesh < INF else 0.0

func _caption(top: float, bottom: float, size_ratio: float) -> Label:
	var l := Label.new()
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var h := float(race.video.height)
	l.add_theme_font_size_override("font_size", int(h * size_ratio))
	l.add_theme_color_override("font_color", Color.WHITE)
	l.add_theme_color_override("font_outline_color", Color("#111111"))
	l.add_theme_constant_override("outline_size", int(h * size_ratio * 0.28))
	l.anchor_left = 0.05
	l.anchor_right = 0.95
	l.anchor_top = top
	l.anchor_bottom = bottom
	return l

func _build_overlay() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	cap_top = _caption(0.06, 0.22, 0.05)
	cap_center = _caption(0.30, 0.55, 0.15)
	cap_winner = _caption(0.05, 0.20, 0.07)
	cap_bottom = _caption(0.70, 0.94, 0.042)
	for c in [cap_top, cap_center, cap_bottom, cap_winner]:
		layer.add_child(c)

func _build_confetti() -> void:
	var rngf := RandomNumberGenerator.new()
	rngf.seed = int(race.seed) + 7
	var colors := ["#E63946", "#FFD166", "#06D6A0", "#118AB2", "#EF476F", "#FFFFFF", "#F78C6B"]
	for i in 160:
		var piece := _box(Vector3.ZERO, Vector3(0.12, 0.02, 0.07), _mat(colors[i % colors.size()], 0.5))
		piece.visible = false
		piece.set_meta("v", Vector3(rngf.randf_range(-3.5, 3.5), rngf.randf_range(4.0, 9.0), rngf.randf_range(-4.5, 4.5)))
		piece.set_meta("spin", Vector3(rngf.randf_range(-9, 9), rngf.randf_range(-9, 9), rngf.randf_range(-9, 9)))
		piece.set_meta("delay", rngf.randf_range(0.0, 0.5))
		confetti.append(piece)

# ---------- tempo ----------
func race_time(video_t: float) -> float:
	var rs := float(tl.raceStart)
	var s0 := float(tl.slowStart)
	var s1 := float(tl.slowEnd)
	var k := float(tl.slowFactor)
	var r := video_t - rs
	if r <= s0:
		return r
	var slow_video := (s1 - s0) / k
	if r - s0 <= slow_video:
		return s0 + (r - s0) * k
	return s1 + (r - s0 - slow_video)

func runner_x(cfg: Dictionary, r: float) -> float:
	if r <= 0.0:
		return 0.0
	var T := float(cfg.chegada)
	var a: Array = cfg.curva
	if r <= T:
		var u := r / T
		var acc := 0.07  # arrancada: acelera nos primeiros 7% do tempo
		var h := (u * u / (2.0 * acc)) / (1.0 - acc / 2.0) if u < acc else (u - acc / 2.0) / (1.0 - acc / 2.0)
		var f := h + float(a[0]) * sin(PI * h) + float(a[1]) * sin(TAU * h) + float(a[2]) * sin(3.0 * PI * h)
		return L * f
	var v := L / T
	var d := minf(r - T, 2.2)
	return L + v * d * (1.0 - d / 4.4)

# ---------- quadro ----------
func evaluate(t: float) -> void:
	var r := race_time(t)
	var winner_t := float(tl.winnerVideo)
	var lead_x := 0.0
	var winner_node: Node3D = null
	for item in runners:
		var cfg: Dictionary = item.cfg
		var node: Node3D = item.node
		var x := runner_x(cfg, r)
		lead_x = maxf(lead_x, x)
		var z := _lane_z(int(cfg.raia))
		var running := r > 0.0 and x < L + 4.0 and r < float(cfg.chegada) + 2.2
		var h := float(cfg.altura)
		var y := 0.0
		node.rotation = Vector3(0, PI / 2, 0)
		if running:
			var phase := x / float(item.stride)
			y = absf(sin(phase * PI)) * 0.07 * h
			node.rotation.z = -0.08  # inclina para a frente
			Props.animate(node, "walk", phase * _clip_len(node, "walk"))
		else:
			Props.animate(node, "idle", t)
		if cfg.id == race.vencedorId and t >= winner_t + 0.6:
			# comemora: vira para a câmera e pula
			var c := t - winner_t - 0.6
			node.rotation.y = lerp_angle(PI / 2, PI * 0.25, clampf(c / 0.5, 0, 1))
			y = absf(sin(c * 6.0)) * 0.45 * h
			Props.animate(node, "attack", c)
			winner_node = node
		y += float(item.lift)
		node.position = Vector3(x, y, z)
		var label: Label3D = item.label
		label.position = Vector3(x, h * 1.25 + y + 0.3, z)
		label.visible = t < winner_t + 0.3 or cfg.id == race.vencedorId
		if cfg.id == race.vencedorId and t >= winner_t:
			label.text = "1º " + String(cfg.nome)
			label.modulate = Color("#FFD166")
	var go := t >= float(tl.intro) + 2.25
	for lamp in start_lamps:
		var lit: bool = go or t >= float(tl.intro) + 0.75 * int(lamp.get_meta("lamp")) * 0.75
		var m: StandardMaterial3D = lamp.material_override
		var col := Color("#2ECC71") if go else (Color("#FF3B30") if lit else Color("#4A1A1A"))
		m.albedo_color = col
		m.emission = col if lit else Color.BLACK
	_update_crowd(t, winner_t)
	_update_confetti(t, winner_t)
	_update_captions(t, winner_t)
	_update_camera(t, r, lead_x, winner_t)

func _clip_len(node: Node3D, clip: String) -> float:
	if not node.has_meta("player"):
		return 1.0
	var p: AnimationPlayer = node.get_meta("player")
	return p.get_animation(clip).length if p.has_animation(clip) else 1.0

func _update_crowd(t: float, winner_t: float) -> void:
	var hype := 0.06 + (0.35 if t >= winner_t else (0.12 if t >= float(tl.raceStart) else 0.0))
	for head in crowd:
		head.position.y = float(head.get_meta("base_y")) + absf(sin(t * 7.0 + float(head.get_meta("phase")))) * hype

func _update_confetti(t: float, winner_t: float) -> void:
	var half := n * LANE_W * 0.5
	for piece in confetti:
		var c := t - winner_t - float(piece.get_meta("delay"))
		piece.visible = c > 0.0 and c < 4.5
		if not piece.visible:
			continue
		var v: Vector3 = piece.get_meta("v")
		var p := Vector3(L + 0.5, 4.6, 0) + Vector3(v.x, 0, v.z * half / 4.5) * c + Vector3(0, v.y * c - 4.9 * c * c, 0)
		p.y = maxf(p.y, 0.05)
		piece.position = p
		piece.rotation = piece.get_meta("spin") * c

func _update_captions(t: float, winner_t: float) -> void:
	var intro := float(tl.intro)
	var tx: Dictionary = race.textos
	cap_top.text = ""
	cap_center.text = ""
	cap_bottom.text = ""
	cap_winner.text = ""
	if t < intro:
		cap_top.text = String(tx.gancho)
		cap_bottom.text = String(tx.escolha)
	elif t < intro + 3.0:
		var c := t - intro
		cap_center.text = "3" if c < 0.75 else ("2" if c < 1.5 else ("1" if c < 2.25 else "VAI!"))
		cap_top.text = String(tx.gancho)
	elif t >= winner_t:
		cap_winner.text = String(tx.vencedor) if t < float(race.duration) - 2.8 else String(tx.final)
		var podium := []
		var ordered: Array = race.corredores.duplicate()
		ordered.sort_custom(func(a, b): return int(a.posicao) < int(b.posicao))
		for i in mini(3, ordered.size()):
			podium.append("%dº %s" % [i + 1, String(ordered[i].nome)])
		cap_bottom.text = "
".join(podium)
	elif t >= float(tl.raceStart) + float(tl.slowStart):
		cap_top.text = "QUEM VAI GANHAR?!"

func _look(pos: Vector3, target: Vector3) -> void:
	camera.position = pos
	camera.look_at(target, Vector3.UP)

func _update_camera(t: float, r: float, lead_x: float, winner_t: float) -> void:
	var half := n * LANE_W * 0.5
	var intro := float(tl.intro)
	var rs := float(tl.raceStart)
	var shake := Vector3.ZERO
	if t < intro:
		# apresentação: passa pela fila de largada, de frente para os animais
		var u := smoothstep(0.0, 1.0, t / intro)
		_look(Vector3(9.5, 2.2, lerpf(-half * 0.6, half * 0.6, u)), Vector3(0, 0.7, lerpf(-half * 0.6, half * 0.6, u)))
	elif t < rs:
		_look(Vector3(-4.5, 1.4, half + 5.0), Vector3(2.0, 0.6, 0))
	elif r < float(tl.slowStart):
		var rr := r
		if rr > 5.0 and rr < 8.0:
			# corte de frente: vê as caras dos corredores vindo
			_look(Vector3(lead_x + 9.0, 1.6, half * 0.4), Vector3(lead_x - 2.0, 0.8, 0))
		else:
			var cx := maxf(lead_x - 1.5, 0.0)
			_look(Vector3(cx, 1.9, half + 6.0), Vector3(cx + 2.0, 0.7, 0))
		shake = Vector3(sin(t * 13.0), sin(t * 17.0), 0) * 0.03
	elif t < winner_t + 0.6:
		# câmera lenta rente à linha de chegada
		# segue o líder até a faixa, depois fica parada na linha
		_look(Vector3(minf(lead_x + 3.5, L + 2.5), 0.8, half + 3.6), Vector3(minf(lead_x, L - 1.0), 0.7, 0))
		if t >= winner_t:
			var k := 1.0 - clampf((t - winner_t) / 0.6, 0, 1)
			shake = Vector3(sin(t * 50.0), sin(t * 43.0), 0) * 0.08 * k
	else:
		# close no vencedor comemorando
		var w: Dictionary = {}
		for item in runners:
			if item.cfg.id == race.vencedorId:
				w = item
		var wn: Node3D = w.node
		var h := float(w.cfg.altura)
		var c := clampf((t - winner_t - 0.6) / 1.2, 0, 1)
		var dist := lerpf(6.0, 3.2 + h * 1.4, smoothstep(0.0, 1.0, c))
		_look(Vector3(wn.position.x + dist * 0.75, 0.6 + h * 0.9, wn.position.z + dist * 0.75), Vector3(wn.position.x, h * 0.6, wn.position.z))
	near_pole.visible = r < float(tl.slowStart)
	near_gate.visible = t < rs
	camera.position += shake
	# nomes que cairiam em cima da legenda do topo somem
	var vp_h := float(get_viewport().get_visible_rect().size.y)
	for item in runners:
		var lb: Label3D = item.label
		if lb.visible and lb.text != "" and not camera.is_position_behind(lb.global_position):
			if camera.unproject_position(lb.global_position).y < vp_h * 0.27:
				lb.visible = false

func _debug_at(t: float) -> void:
	# Diagnóstico: --debug-t=<s> imprime câmera e objetos cujo AABB contém/está perto da câmera.
	evaluate(t)
	var cam := camera.global_position
	print("DEBUG camera ", cam, " olhando ", -camera.global_transform.basis.z)
	for m in find_children("*", "MeshInstance3D", true, false):
		var mi: MeshInstance3D = m
		if not mi.is_visible_in_tree() or mi.mesh == null:
			continue
		var box := mi.global_transform * mi.get_aabb()
		var grown := box.grow(1.0)
		if (grown.has_point(cam) or box.size.length() > 30.0 or (box.get_center().distance_to(cam) < 25.0 and box.size.length() > 1.5)) and box.size.length() < 100.0:
			print("DEBUG perto/grande ", mi.get_path(), " aabb=", box)

func _process(_delta: float) -> void:
	if race.is_empty():
		return
	var t := float(frame) / fps if recording else fmod(Time.get_ticks_msec() / 1000.0, float(race.duration))
	evaluate(t)
	frame += 1
