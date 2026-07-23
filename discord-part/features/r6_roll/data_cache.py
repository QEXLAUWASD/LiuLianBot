import json
from pathlib import Path
from threading import RLock


class JsonDataCache:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._value = None
        self._lock = RLock()

    def get(self):
        with self._lock:
            if self._value is None:
                self._value = json.loads(self.path.read_text(encoding="utf-8"))
            return self._value

    def reload(self):
        with self._lock:
            self._value = json.loads(self.path.read_text(encoding="utf-8"))
            return self._value
