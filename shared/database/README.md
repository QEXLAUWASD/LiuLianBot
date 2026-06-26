# Shared Database Config

此資料夾提供 python-part (Discord bot) 和 website-part 共用的資料庫設定。

## 結構

- `config.json` - MySQL 連線設定
- 未來可加入 SQLite 支援或 migration scripts

## Python (discord-part) 使用方式

```python
import json, os
shared_cfg = os.path.join(os.path.dirname(__file__), '..', '..', 'shared', 'database', 'config.json')
with open(shared_cfg) as f:
    db_config = json.load(f)['mysql']
```

## Node.js (website-part) 使用方式

```javascript
const path = require('path');
const dbConfig = require(path.join(__dirname, '..', '..', 'shared', 'database', 'config.json'));
```

## 注意

- 請勿將含有真實密碼的 `config.json` 提交到 Git
- 可使用 `config.example.json` 作為範本
