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
