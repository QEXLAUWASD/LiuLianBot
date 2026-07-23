import json

from features.r6_roll.data_cache import JsonDataCache


def test_json_cache_reads_once_and_reloads(tmp_path):
    path = tmp_path / "data.json"
    path.write_text(json.dumps({"version": 1}), encoding="utf-8")
    cache = JsonDataCache(path)

    assert cache.get()["version"] == 1
    path.write_text(json.dumps({"version": 2}), encoding="utf-8")
    assert cache.get()["version"] == 1
    assert cache.reload()["version"] == 2
