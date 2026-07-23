# Shared Database Config

此資料夾提供 `discord-part`（Discord Bot）同 `website-part` 共用嘅 MySQL
連線設定。

## 建立設定

Linux/macOS：

```bash
cp shared/database/config.example.json shared/database/config.json
```

Windows PowerShell：

```powershell
Copy-Item shared\database\config.example.json shared\database\config.json
```

編輯 `config.json` 入面嘅 `mysql` 物件。`config.json` 包含真實密碼，唔應該
提交到 Git；`config.example.json` 只放安全範例值。

## Python (`discord-part`)

Discord 程式碼透過現有 wrapper 取得連線：

```python
from utils.database import get_db_conn

connection = get_db_conn()
```

## Node.js (`website-part`)

網站由 `src/db/pool.js` 載入同一份 `shared/database/config.json`，並喺
server listen 前執行 website schema migrations。毋須喺 `.env` 重複設定 MySQL。
