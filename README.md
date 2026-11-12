# 家好帳

手機優先的家庭收支簿。使用 Supabase Google OAuth、Postgres 與 RLS；金額以新台幣整數儲存。

## 啟動

1. 在 Supabase 專案執行 `supabase/migrations/20261112_family_ledger.sql`。
2. 可直接將 `docs/` 設定為 GitHub Pages 的 `main` 分支網站目錄，或放到其他 HTTPS 靜態託管。`main.js` 中僅含公開的 publishable key，絕不可放入 service role key。Supabase 客戶端由 esm.sh 載入，需網路連線。
3. Supabase Authentication → URL Configuration 中將 Site URL 與 Redirect URLs 設為 `https://jryang-web.github.io/cashbook/`。
4. 在 Google Cloud 建立 Web application OAuth Client。Authorized JavaScript origins 設為 `https://jryang-web.github.io`；Authorized redirect URI 使用 Supabase Authentication → Providers → Google 頁面顯示的 callback URL，通常為 `https://jiofldtieaxlqykhylnc.supabase.co/auth/v1/callback`。將 Client ID 和 Client Secret 填入 Supabase 的 Google provider，啟用後再測試登入。請勿把 Client Secret 放進程式庫。

新用戶先以 Google 帳號登入，建立家庭後複製邀請碼給家人。邀請碼視同加入權限，請只分享給家人。每人可有不同家庭；介面目前一次顯示一個家庭。刪除紀錄不可復原。
新增收支：右下角「＋」→ 選支出或收入 → 輸入金額 → 點分類 → 儲存。日期預設今天，備註可留空；常用分類會記在本機瀏覽器。連續記帳可用「儲存後再記一筆」。
