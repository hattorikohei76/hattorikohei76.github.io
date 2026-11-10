# Kohei Hattori — Homepage

GitHub Pages で公開する個人ホームページです（HTML / CSS / JS のみ、ビルド不要）。

## ファイル構成

| ファイル | 内容 |
| --- | --- |
| `index.html` | ホーム（プロフィール・自己紹介・最新ニュース・連絡先） |
| `news.html` | ニュース一覧 |
| `news-data.js` | ニュースの中身（ここに追記するとホームとニュースページの両方に反映） |
| `research.html` | 研究テーマ |
| `publications.html` | 業績（論文・発表） |
| `cv.html` | 経歴・受賞・活動 |
| `favicon.svg` / `favicon-32.png` / `apple-touch-icon.png` | タブなどに表示されるアイコン |
| `style.css` | デザイン（全ページ共通） |
| `script.js` | 日本語 / English 切替、メニュー、背景アニメーション |
| `.nojekyll` | GitHub Pages の Jekyll 処理を無効化 |
| `.gitignore` | 経歴書.pdf などを公開対象から外す |

## 編集のしかた

- 日本語は `data-ja`、英語は `data-en` のついた要素に書きます。
- ニュースは `news-data.js` に `{ date, type, ja, en }` を追加します（type は talk / invited / seminar / visit / award / info）（日付順に自動で並び、ニュースページでは年ごとに分かれます）。
- 上部メニューは各ページに同じものが入っています。ページを増やすときは全ページのメニューに追加してください。

## ローカルで確認

```sh
python3 -m http.server 8000
# → http://localhost:8000 を開く
```

## GitHub Pages で公開

1. GitHub で `YOUR-USERNAME.github.io` という名前の **Public** リポジトリを作成
2. このフォルダで:
   ```sh
   git add .
   git commit -m "Initial homepage"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-USERNAME.github.io.git
   git push -u origin main
   ```
3. リポジトリの **Settings → Pages** で Source を「Deploy from a branch」、Branch を `main` / `(root)` にして Save
4. 数分後に `https://YOUR-USERNAME.github.io/` で公開されます
