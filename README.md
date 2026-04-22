# 樂活五線譜 Lohas Stock App

樂活五線譜是一款以 **台股 / 美股追蹤、五線譜技術分析、樂活通道、恐慌貪婪指數觀察** 為核心的 Android 股票 App。  
這個專案使用 **Expo + React Native + TypeScript + expo-router** 開發，主打手機上快速查看多週期趨勢、訊號區間與市場情緒。

Lohas Stock App is an Android stock analysis app focused on **Taiwan stocks, US stocks, five-line analysis, Lohas channel trends, and Fear & Greed sentiment tracking**.

## 專案特色 Features

- 支援台股與美股代號搜尋，例如 `2330`、`1303`、`QQQ`、`SPY`、`AAPL`
- 首頁最愛股票清單支援分類、排序、刪除與單筆管理
- 內建五線譜圖表，可查看 `3M / 6M / 1.5Y / 3.5Y` 多週期訊號
- 圖表支援時間軸縮放，方便細看近期走勢
- 內建樂活通道與五線譜資訊卡，適合觀察壓力、支撐與區間位置
- 提供市場情緒 Fear & Greed 指數儀表與歷史比較畫面
- 可在市場情緒頁疊加單一股票進行上下雙圖同步比較
- 首頁台股 / 美股會顯示目前更新狀態：即時更新或非交易時段低頻更新
- Android APK 可直接編譯，也可直接從 repo 下載安裝

## 適合誰使用

- 想用手機快速追蹤台股、美股技術面的人
- 想觀察股價相對五線譜區間位置的人
- 想用 Fear & Greed 指數搭配股價一起判讀市場情緒的人
- 想研究 React Native / Expo 股票 App 實作的人

## 快速下載 APK

最新版 APK 會放在：

- [release/app-release.apk](./release/app-release.apk)

如果 GitHub 頁面已啟用 Releases，也可以直接從 Release 頁下載。

## 主要畫面功能

### 1. 首頁 Watchlist

- 台股與美股分區顯示
- 顯示股票代號、名稱、最新股價、漲跌幅、區間訊號
- 可依設定切換是否顯示上移 / 下移 / 刪除按鈕

### 2. 個股詳細頁

- 顯示最新股價與相對前一交易日漲跌
- 顯示多週期技術訊號
- 圖表切換 `3M / 6M / 1.5Y / 3.5Y`
- 左上角 `+ / -` 可縮放 X 軸時間範圍
- 下方資訊卡顯示當前日期對應的五線譜 / 樂活通道數值

### 3. 市場情緒頁

- Fear & Greed 半圓儀表
- 歷史走勢頁面
- 可輸入單一股票代號，與市場情緒做上下同步時間軸比較

## 技術架構 Tech Stack

- Expo
- React Native
- TypeScript
- expo-router
- Zustand
- React Native SVG
- Axios

## 資料來源 Data Sources

- Yahoo Finance
- TWSE 即時報價
- CNN Fear & Greed Index

## 本地開發方式

```bash
npm install
npm run start
```

## Android 編譯方式

```bash
cd android
gradlew.bat assembleRelease
```

APK 輸出位置：

```text
android/app/build/outputs/apk/release/app-release.apk
```

## 專案結構

```text
app/                    Expo Router 頁面
src/api/                報價與市場情緒 API
src/components/         圖表、卡片、徽章等 UI 元件
src/core/               五線譜與訊號計算核心
src/store/              Zustand 狀態管理
release/                對外提供下載的 APK
```

## 關鍵字 Keywords

台股 App、美股 App、股票 App、五線譜、技術分析、恐慌貪婪指數、Fear and Greed、ETF、Yahoo Finance、React Native Stock App、Expo Android App

## Roadmap

- 更完整的圖表拖曳平移
- 更多區間與自訂分析視角
- 更完整的 GitHub Release 發佈流程
- 更完整的市場資訊與提醒功能

## License

MIT
