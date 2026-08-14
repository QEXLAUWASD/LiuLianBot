import json

import core.config as config_module


def test_update_config_writes_atomically_and_refreshes_cache(monkeypatch, tmp_path):
    path = tmp_path / "config.json"
    path.write_text('{"bot_admin": []}', encoding="utf-8")
    monkeypatch.setattr(config_module, "CONFIG_PATH", str(path))
    config_module._config = {}

    updated = config_module.update_config(
        lambda config: config["bot_admin"].append("123")
    )

    assert updated["bot_admin"] == ["123"]
    assert config_module.get_config()["bot_admin"] == ["123"]
    assert json.loads(path.read_text(encoding="utf-8"))["bot_admin"] == ["123"]
    assert not list(tmp_path.glob("*.tmp"))


def test_update_config_keeps_original_when_mutator_fails(monkeypatch, tmp_path):
    path = tmp_path / "config.json"
    path.write_text('{"prefix": ">"}', encoding="utf-8")
    monkeypatch.setattr(config_module, "CONFIG_PATH", str(path))
    config_module._config = {}

    def fail(_):
        raise RuntimeError("stop")

    try:
        config_module.update_config(fail)
    except RuntimeError:
        pass

    assert json.loads(path.read_text(encoding="utf-8")) == {"prefix": ">"}


def test_get_config_returns_a_snapshot(monkeypatch, tmp_path):
    path = tmp_path / "config.json"
    path.write_text('{"bot_admin": ["123"]}', encoding="utf-8")
    monkeypatch.setattr(config_module, "CONFIG_PATH", str(path))
    config_module._config = {}

    snapshot = config_module.get_config()
    snapshot["bot_admin"].append("456")

    assert config_module.get_config() == {"bot_admin": ["123"]}


def test_load_config_rejects_non_object_json(monkeypatch, tmp_path):
    path = tmp_path / "config.json"
    path.write_text("[]", encoding="utf-8")
    monkeypatch.setattr(config_module, "CONFIG_PATH", str(path))
    config_module._config = {}

    try:
        config_module.load_config()
    except ValueError as exc:
        assert str(exc) == "config.json root must be a JSON object"
    else:
        raise AssertionError("expected invalid config root to be rejected")
