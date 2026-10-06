# SSH VPN 帳戶管理與自動撤銷

網站會每 30 秒啟動一次同步：為每位授權用戶建立獨立憑證，並撤銷到期、停用、失去節點授權或已刪除用戶的帳戶。VPS 端每分鐘檢查到期時間，所以網站停止運作時，已同步的帳戶仍會到期撤銷。同步可能因 SSH／服務故障延遲；失敗會重試，後台可查看狀態及手動同步。

支援混合節點：獨立 Hysteria2 使用 `auth.type: userpass`；sing-box 管理 VLESS、VMess、Trojan、Hysteria2 與 SS2022 AES 多用戶入站；Xray 管理 VLESS、VMess 與 Trojan；Mihomo 管理 Hysteria2 與 VLESS（包括 Reality）。單一共用密碼／UUID 無法個別撤銷；啟用管理前，請自行輪替或移除曾經分發的共用憑證。工具保留不屬於 `llb-s<節點ID>-` 命名空間的帳戶。

格式依據：[Hysteria2 userpass](https://v2.hysteria.network/docs/advanced/Full-Server-Config/)、[sing-box Hysteria2](https://sing-box.sagernet.org/configuration/inbound/hysteria2/)、[sing-box SS2022 多用戶](https://sing-box.sagernet.org/configuration/inbound/shadowsocks/)、[Xray VLESS clients](https://xtls.github.io/en/config/inbounds/vless.html)。此版本不直接管理 shadowsocks-rust／libev；該類節點可繼續作未管理節點。

VPN 用戶使用獨立資料表，不需建立網站帳號。Migration `022` 保留現有 ID、訂閱網址、授權與憑證；網站帳號刪除不再影響 VPN 訂閱。

## 1. 網站主機設定

將 [ssh-profiles.example.json](ssh-profiles.example.json) 複製到網站使用者可讀取、repository 外的 `/etc/liulianbot/clash-ssh-profiles.json`，填入真實 SSH host、username、私鑰路徑、host key SHA256 **64 位十六進位**雜湊，以及 VPS target 名稱。`credential_style` 對獨立 Hysteria2 必須為 `hysteria2-userpass`；sing-box／Xray／Mihomo 使用 `standard`。每個節點使用不同 target，且 target 只對應一個入站。

私鑰可加上 SSH forced command 與 `restrict` 限制；若使用密碼，改填 `password_env`（例如 `CLASH_VPS_PASSWORD`），將實際密碼放在網站環境變數。不要把 SSH 私鑰、密碼、實際設定檔或加密金鑰提交到 Git。

網站 `.env` 設定：

```dotenv
CLASH_SSH_PROFILES_FILE=/etc/liulianbot/clash-ssh-profiles.json
CLASH_CREDENTIAL_ENCRYPTION_KEY=<base64 編碼的 32-byte 金鑰>
```

金鑰可用 `openssl rand -base64 32` 產生，請備份；更換金鑰會使既有帳戶憑證無法解密。網站啟動自動執行 migration `021`／`022`。SSH 設定內容只在伺服器端讀取，後台只顯示 profile 名稱。帳戶憑證在資料庫使用 AES-256-GCM 加密。

## 2. VPS 安裝工具

適用 Linux／systemd 或 OpenWrt／procd。網站同步工作使用 Node.js 背景排程，本身不需要 systemd；OpenWrt 網站主機可沿用現有的啟動方式。以下 systemd 安裝步驟只適用於 VPN 主機，procd 替代步驟見下方。VPS 須有 Node.js 18 或更新版本、npm、`flock` 與所用 VPN 程式。把本資料夾複製到 VPS 的 `/opt/liulian-vpn`，並以 root 完成：

```sh
cd /opt/liulian-vpn
npm ci --omit=dev
install -d -m 700 /etc/liulian-vpn /var/lib/liulian-vpn
install -d /usr/local/libexec
install -m 755 liulian-vpn-sync /usr/local/libexec/liulian-vpn-sync
install -m 644 liulian-vpn-expire.service liulian-vpn-expire.timer /etc/systemd/system/
```

確保 `/opt/liulian-vpn`、工具、依賴、`/etc/liulian-vpn` 及狀態目錄均由 root 擁有，SSH 帳戶沒有寫入權限。wrapper 預設 Node 路徑是 `/usr/bin/node`；若不同，請按 VPS 實際路徑調整。wrapper 透過 `flock` 序列化 SSH 與本機到期清理，避免同時修改設定。

把 [targets.example.json](targets.example.json) 複製到 `/etc/liulian-vpn/targets.json`（root 擁有、權限 `600`）。填入真實引擎、設定檔、binary、systemd service 及 inbound tag。`owner_prefix` 必須對應後台節點 ID，例如 ID 12 就是 `llb-s12-`。範例路徑及服務名稱須按實際安裝修改；工具不會猜測或搜尋設定檔。

VPN 設定檔須是 root 擁有的普通檔案，禁止符號連結及群組／其他人寫入。sing-box／Xray 設定須是單一 JSON 檔，入站 tag 必須唯一；不支援由管理面板或目錄合併生成的設定。

sing-box 入站須已有 `users` 陣列。SS2022 須使用 `2022-blake3-aes-128-gcm` 或 `2022-blake3-aes-256-gcm`，不使用 SSM API／relay，且後台代理 YAML 的 cipher 與伺服器主密碼必須吻合；用戶訂閱會自動使用 `伺服器主密碼:個別用戶密碼`。

獨立 Hysteria2 須先改為多用戶驗證，例如：

```yaml
auth:
  type: userpass
  userpass:
    admin: <保留的管理者密碼>
```

工具不會自動把單密碼模式轉為多用戶，也不會改 TLS、Reality、路由、監聽埠等設定。若沒有其他帳戶，會保留一個無法取得憑證的停用帳戶，避免空帳戶清單觸發共用密碼回退。

SSH 帳戶需能免密碼 sudo 執行指定工具。可用 `visudo` 加入僅允許**不帶參數**的規則（替換帳戶名稱）：

```sudoers
vpn-manager ALL=(root) NOPASSWD: /usr/local/libexec/liulian-vpn-sync ""
```

啟用本機到期清理：

```sh
systemctl daemon-reload
systemctl enable --now liulian-vpn-expire.timer
systemctl status liulian-vpn-expire.timer
```

工具只在 systemd timer 或 OpenWrt 到期清理服務運作時接受網站的同步請求。`targets.json` 為空時，清理成功只代表沒有待處理目標，不能證明用戶帳戶已啟用或能撤銷。請讓 VPS 與網站使用 NTP 校時；撤銷是週期性執行，不保證精確到秒。

## 3. 後台啟用與驗證

1. 先建立 VPN 節點，取得 ID；設定 VPS target 的 `owner_prefix`。
2. 在節點的「SSH 管理設定」選擇對應 profile，儲存後按「立即同步」。
3. 在 VPN 用戶列表按「新增」，輸入獨立 VPN 用戶名稱、到期時間與可用節點；同步成功前，不會在訂閱中提供新的個別憑證。
4. 在「SSH 同步」確認 `ready`、上次同步時間。失敗顯示 `error` 並自動重試，不會回退到共用憑證。
5. 用測試用戶驗證訂閱及 VPN 連線，設定短期到期時間，再確認下載停止、該帳戶從 VPS 移除；也可暫停網站，確認 VPS timer 仍能清理。

管理 profile、協定、主密碼及監聽埠在啟用後不能修改，避免遺失舊伺服器上的撤銷目標；改用新節點。刪除節點會保留撤銷紀錄，直到 SSH 已移除該節點管理的帳戶。SSH 同步紀錄只顯示固定錯誤訊息，不含密碼或私鑰。

修改帳戶清單時會驗證 sing-box／Xray／Mihomo 設定，再以同目錄原子寫入套用，重新啟動對應服務並確認服務仍運作；啟動失敗會還原原設定及嘗試啟動。獨立 Hysteria2 做結構驗證及啟動回滾，不假設它提供 config-check 指令。重新啟動會斷開同服務的既有連線，其他帳戶可以重新連線。

VPS 的待套用請求與最後成功帳戶／到期時間均以 `600` 權限保存；即使工具中途停止，下次 timer 仍會重試。新設定失敗時仍會嘗試清理最後成功設定的到期帳戶。設定備份位於原檔案旁的 `.llb-backup`，同樣包含機密資料。

診斷本機 timer 可用 `journalctl -u liulian-vpn-expire.service`。未有真實 VPS 連線資料前，repository 測試僅驗證工具與模擬 SSH／服務流程，不能代替真實部署驗證。

## OpenWrt／procd VPN 主機

完成通用工具、依賴與 target 安裝，略過 systemd unit 安裝，改用：

```sh
install -m 755 /opt/liulian-vpn/liulian-vpn-expire.procd /etc/init.d/liulian-vpn-expire
/etc/init.d/liulian-vpn-expire enable
/etc/init.d/liulian-vpn-expire start
/etc/init.d/liulian-vpn-expire running
```

VPN target 設定 `service_manager: "procd"`、`service: "mihomo"`（對應 `/etc/init.d/mihomo`）。VPN init script 必須由 procd 管理並支援 `running`；工具會在 restart 後檢查狀態，失敗則還原設定並使用同一服務管理器重新啟動。到期服務立即清理一次，之後每 60 秒執行，前一次未完成時不重疊。相關服務與檔案必須由 root 擁有且不可由其他帳戶寫入。參考 [OpenWrt procd init scripts](https://openwrt.org/docs/guide-developer/procd-init-scripts)。

## Mihomo listener

使用 `engine: "mihomo"`，設定檔為單一 YAML；`inbound_tag` 對應 listener 的唯一 `name`。Hysteria2 使用 `users` 對照表，VLESS 使用含 `username`／`uuid`／可選 `flow` 的 `users` 陣列。Hysteria2 的用戶名不參與認證，profile 使用 `standard`，訂閱只提供個別密碼。工具會先以 `mihomo -t -d <設定目錄> -f <候選設定>` 驗證，再套用；TLS／Reality／路由及其他命名空間帳戶保留。

Mihomo v1.19.32 的 Shadowsocks listener 僅接受共享 `password`，不支援本工具需要的獨立 `users`；不得把此 SS2022 listener 標為已支援個別撤銷。若需要 SS2022 個別帳戶，須另行遷移到支援多用戶的引擎與新節點；此工具不自動遷移或輪替現有共享憑證。參考 [Mihomo Hysteria2](https://wiki.metacubex.one/config/inbound/listeners/hysteria2/)、[VLESS](https://wiki.metacubex.one/config/inbound/listeners/vless/)、[v1.19.32 Shadowsocks 原始碼](https://github.com/MetaCubeX/mihomo/blob/v1.19.32/listener/inbound/shadowsocks.go)。

2026-10-06 已以 SSH 唯讀檢查 Digi Pro 2：Ubuntu 20.04.6、Mihomo v1.19.32，服務 `mihomo-server.service`，binary `/usr/local/bin/mihomo`，設定 `/etc/mihomo-server/config.yaml`。Listener 為 `ss2022-in`（2096）、`hysteria2-in`（8443）、`vless-reality-in`（443）；後兩者已有多用戶格式。當時到期 timer 運作，但 `targets.json` 為空，尚未啟用帳戶同步／撤銷。此檢查未修改 VPS 或重新啟動服務，也不能代表其餘 7 台的部署狀態。
