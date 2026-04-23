# 台股貪婪指數子專案

## 目標

在現有 App 內新增一套「台股市場情緒指數」，用來描述台股整體偏恐慌、偏中性、偏貪婪的狀態。

這個子專案和目前專案內兩個既有功能不同：

- `app/feargreed.tsx`：目前偏向美股市場情緒資料與歷史比較。
- `app/stock/[symbol].tsx`：目前偏向單一股票的五線譜區間與相對貪婪/恐懼判讀。

新子專案要處理的是「台股整體市場」而不是「單一股票」。

## 建議定位

建議把「台股貪婪指數」定義成 0 到 100 的綜合分數：

- `0-24`：極度恐慌
- `25-44`：恐慌
- `45-55`：中性
- `56-74`：貪婪
- `75-100`：極度貪婪

這樣可以沿用現有 App 的視覺與使用者心智，也方便和目前的 `FearGreedGauge` 畫面整合。

## 第一版建議算法

先做一個能快速上線的 `v1`，避免一開始就卡在過度複雜的市場模型。

建議先用 4 個訊號組成總分，每項 0 到 100，最後做加權平均：

1. 大盤位置動能
   - 以加權指數或台灣 50 ETF 為主
   - 觀察收盤價相對於近 20 日、60 日趨勢的位置
2. 上漲下跌家數廣度
   - 上漲家數占比越高，分數越偏貪婪
3. 成交量熱度
   - 近期成交值相對近 20 日均量放大越多，分數越偏貪婪
4. 波動與避險情緒
   - 若能取得台指波動率或替代風險指標，波動越大，分數越偏恐慌

建議初版權重：

- 大盤位置動能：`35%`
- 漲跌家數廣度：`25%`
- 成交量熱度：`20%`
- 波動/風險情緒：`20%`

## 如果資料源受限

若短期內拿不到完整市場廣度與波動資料，可以先做更務實的 `v0`：

- 用 `TAIEX` 或 `0050`
- 搭配成交量
- 再加上使用目前專案已有的五線譜邏輯，將大盤 ETF 映射為市場貪婪分數

這個版本雖然不是真正的全市場情緒指數，但最容易先做出可用畫面與歷史回測。

## 與現有程式的接點

目前專案已經有幾個可直接重用的部分：

- `src/components/FearGreedGauge.tsx`
  - 可直接沿用儀表視覺
- `app/feargreed.tsx`
  - 可參考歷史走勢與互動圖表
- `src/core/fiveLines.ts`
  - 可借用區間分級與分數映射概念
- `src/api/twse.ts`
  - 可延伸成台股市場資料來源模組

## 建議檔案規劃

如果要正式開做，建議新增以下模組：

- `src/api/twMarket.ts`
  - 抓台股大盤、成交值、漲跌家數、風險指標
- `src/core/twFearGreed.ts`
  - 負責計算台股貪婪指數與子分數
- `src/components/TwFearGreedBreakdown.tsx`
  - 顯示各子指標分數
- `app/tw-fear-greed.tsx`
  - 新頁面，專屬台股市場情緒

## 這個子專案目前最需要先定義的事

在真正實作前，最關鍵的是先選定以下其中一條路：

1. 市場版
   - 目標是「台股整體情緒」
   - 比較像 CNN Fear & Greed 的台股版
2. 大盤代理版
   - 先用 `TAIEX`、`0050`、`0056` 之類代表台股情緒
   - 開發最快
3. 個股延伸版
   - 把現有五線譜的貪婪/恐懼分數做成排行榜或聚合指標
   - 最貼近現有程式碼

## 我目前的建議

建議先做「大盤代理版 v1」：

- 成本最低
- 最容易接進現有 App
- 可以先驗證使用者是否真的需要「台股情緒總分」
- 後面再升級成真正的市場版，不用推翻 UI

## 下一步

下一輪可以直接做其中一件事：

1. 把這份規格延伸成實作任務清單
2. 直接建立 `tw-fear-greed` 的 API 與計算骨架
3. 先把新頁面接進 Expo Router，做出可點擊的雛形

## 目前已完成的一年期 Python 驗證版

目前子專案內已有可直接執行的腳本：

- `subprojects/tw-fear-greed-index/tw_fear_greed_1y.py`

用途：

- 從 FinMind 抓取近一年資料
- 計算每日台股恐慌貪婪指數歷史
- 輸出最新分數與分項 breakdown
- 產生 CSV 與 JSON，方便後續搬進 APK

### 目前 v1 採用的 6 個因子

- 市場動能：`TaiwanStockTotalReturnIndex`
- 券資比：`TaiwanStockTotalMarginPurchaseShortSale`
- 融資情緒：`TaiwanStockTotalMarginPurchaseShortSale`
- 外資情緒：`TaiwanStockTotalInstitutionalInvestors`
- P/C Ratio：`TaiwanOptionDaily` 的 `TXO`
- 波動風險：`TaiwanStockTotalReturnIndex`

### 為什麼先不用市場廣度

原本規劃中的「全市場上漲/下跌家數」需要用到 `TaiwanStockPrice` 的單日全市場查詢。
但 FinMind v4 文件標示這個查詢模式屬於較高方案限制，因此目前這支免費版驗證腳本先以「券資比」取代「市場廣度」。

也就是說，這支腳本是：

- 可跑的免費版代理模型
- 適合先驗證指數走勢與分項分數
- 之後若你要升級資料源，再把廣度因子補回去

### 執行方式

PowerShell：

```powershell
$env:FINMIND_TOKEN="你的 token"
python subprojects\tw-fear-greed-index\tw_fear_greed_1y.py
```

可選參數：

```powershell
python subprojects\tw-fear-greed-index\tw_fear_greed_1y.py --end-date 2026-04-22
```

### 輸出位置

- `subprojects/tw-fear-greed-index/output/tw_fear_greed_1y_history.csv`
- `subprojects/tw-fear-greed-index/output/tw_fear_greed_1y_latest.json`
