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
| `404.html` | 存在しない URL を開いたときのページ（ファイル参照は `/` から始まる絶対パス） |
| `favicon.svg` / `favicon-32.png` / `apple-touch-icon.png` | タブなどに表示されるアイコン |
| `style.css` | デザイン（全ページ共通） |
| `script.js` | 日本語 / English 切替、メニュー、背景アニメーション |
| `files/CV_Kohei_Hattori_ja.pdf` / `_en.pdf` | CV の PDF（日本語版・英語版）。自動で作られるので直接は編集しない |
| `tools/build_cv.py` | `cv.html` と `publications.html` の内容から、LaTeX で CV の PDF を作るスクリプト |
| `tools/hooks/pre-commit` | コミットのたびに CV の PDF を作り直す設定 |
| `.nojekyll` | GitHub Pages の Jekyll 処理を無効化 |
| `.gitignore` | 経歴書.pdf などを公開対象から外す |

## 編集のしかた

- 日本語は `data-ja`、英語は `data-en` のついた要素に書きます。
- `og-image.jpg` は URL を共有したときに表示されるカード画像です。
- ニュースは `news-data.js` に `{ date, type, ja, en }` を追加します（type は talk / invited / seminar / visit / award / info。予定には `jaPast` / `enPast` を書いておくと、過ぎたあと自動で過去形になります）（日付順に自動で並び、ニュースページでは年ごとに分かれます）。
- `style.css` / `script.js` / `news-data.js` を変更したら、全 HTML の `?v=…` の番号も更新してください（ブラウザに古いファイルが残らないようにするため）。
- ライト / ダークの色は `style.css` の先頭にあります。ダークの値は 2 か所（OS の設定に従う場合・ボタンで選んだ場合）に同じものを書いているので、変えるときは両方を直してください。
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

## 発表にスライド・ポスターの PDF を付ける

1. PDF を `files/` フォルダに入れる（例：`files/2026-03-aps-gps-slides.pdf`）。
2. `publications.html` の該当する発表の `<p class="p-meta">…</p>` の直後に、次の1行を足す。

```html
<p class="p-files"><a class="tag" href="files/2026-03-aps-gps-slides.pdf" target="_blank" rel="noopener">Slides</a><a class="tag" href="files/2026-03-aps-gps-poster.pdf" target="_blank" rel="noopener">Poster</a></p>
```

スライドだけ・ポスターだけの場合は、不要な方の `<a …>` を消す。公開してよい（共著者の了承がある、未発表データを含まない）ものだけを置くこと。

## CV の PDF（自動作成）

経歴ページの下にある「CV（PDF）」の 2 つのファイルは、ホームページの内容から自動で作られます。CV だけを別に書き直す必要はありません。

- もとになる内容：`cv.html`（名前・所属・連絡先、職歴・学歴・受賞・活動）と `publications.html`（競争的資金・論文・発表）。日本語版は `data-ja`、英語版は `data-en` の文章が使われます。
- 作り直されるタイミング：`cv.html` か `publications.html` を含むコミットをしたとき。新しい PDF は同じコミットに自動で入ります。
- 手で作り直すとき：`python3 tools/build_cv.py`（必ず作り直すなら `--force`）。
- 必要なもの：LuaLaTeX（MacTeX / TeX Live）と python3。
- 見た目（余白・色・見出しなど）を変えたいとき：`tools/build_cv.py` の中の `TEMPLATE`（LaTeX の雛形）を編集します。

別のパソコンにこのフォルダを移したときは、自動作成を有効にするために次を 1 回だけ実行してください。

```sh
git config core.hooksPath tools/hooks
```
