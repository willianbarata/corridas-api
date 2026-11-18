extends RefCounted
# Carrega objetos de cena convertidos (assets/props/props.json -> res://assets/props/<id>.glb + .json).
# Estáticos já vêm em metros; bichos com esqueleto trazem `scale` no .json e animações (idle/walk...).
const PROP_DIR := "res://assets/animals/"

static func exists(id: String) -> bool:
	return FileAccess.file_exists(PROP_DIR + id + ".glb")

static func create(id: String, node_name: String = "") -> Node3D:
	var root := Node3D.new()
	root.name = node_name if node_name != "" else id
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	var err := doc.append_from_file(ProjectSettings.globalize_path(PROP_DIR + id + ".glb"), state)
	if err != OK:
		push_error("Objeto não carregou: %s (%s)" % [id, err])
		return root
	var visual: Node3D = doc.generate_scene(state)
	visual.name = "Model"
	var meta = JSON.parse_string(FileAccess.get_file_as_string(PROP_DIR + id + ".json"))
	if meta is Dictionary:
		visual.scale = Vector3.ONE * float(meta.get("scale", 1.0))
		root.set_meta("prop", meta)
	root.add_child(visual)
	var players = visual.find_children("*", "AnimationPlayer", true, false)
	if not players.is_empty():
		var player: AnimationPlayer = players[0]
		# Sem avanço próprio: quem usa chama animate(t) com tempo absoluto (render determinístico).
		player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		root.set_meta("player", player)
	return root

static func animate(prop: Node3D, clip: String, time: float) -> void:
	if not prop.has_meta("player"):
		return
	var player: AnimationPlayer = prop.get_meta("player")
	if not player.has_animation(clip):
		return
	if player.current_animation != clip:
		player.play(clip)
	player.seek(fposmod(time, maxf(player.get_animation(clip).length, 0.001)), true)
