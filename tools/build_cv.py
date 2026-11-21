#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ホームページの内容から CV（日本語版・英語版）の PDF を LaTeX で作る。

    python3 tools/build_cv.py          # 内容が変わっていれば作り直す
    python3 tools/build_cv.py --force  # 必ず作り直す

読み取るもの
    cv.html            名前・所属・連絡先（.cv-print-head）と、各セクション（職歴・学歴・受賞・活動 …）
    publications.html  競争的資金・論文・発表

作るもの
    files/CV_Kohei_Hattori_ja.pdf
    files/CV_Kohei_Hattori_en.pdf

HTML に書いた内容がそのまま CV になるので、CV だけを別に書き直す必要はない。
コミットのたびに tools/hooks/pre-commit がこのスクリプトを呼ぶ。
LuaLaTeX（TeX Live / MacTeX）が必要。
"""
import datetime
import io
import os
import re
import shutil
import subprocess
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "tools", "build")
OUT = os.path.join(ROOT, "files")
PDF_NAME = {"ja": "CV_Kohei_Hattori_ja.pdf", "en": "CV_Kohei_Hattori_en.pdf"}
TEX_BIN = ["/Library/TeX/texbin", "/usr/local/texlive/2026/bin/universal-darwin", "/opt/homebrew/bin", "/usr/local/bin"]


# ---------------------------------------------------------------- HTML を読む
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class Node:
    def __init__(self, tag, attrs=None, parent=None):
        self.tag = tag
        self.attrs = dict(attrs or [])
        self.children = []
        self.parent = parent

    def has(self, cls):
        return cls in (self.attrs.get("class") or "").split()

    def walk(self):
        for c in self.children:
            if isinstance(c, Node):
                yield c
                for d in c.walk():
                    yield d

    def find_all(self, tag=None, cls=None, id=None):
        return [n for n in self.walk()
                if (tag is None or n.tag == tag)
                and (cls is None or n.has(cls))
                and (id is None or n.attrs.get("id") == id)]

    def find(self, tag=None, cls=None, id=None):
        found = self.find_all(tag, cls, id)
        return found[0] if found else None


class Builder(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.root = Node("root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        if tag == "li":  # 閉じ忘れた <li> があっても次の <li> で閉じる
            n = self.cur
            while n is not self.root and n.tag not in ("ol", "ul"):
                if n.tag == "li":
                    self.cur = n.parent
                    break
                n = n.parent
        node = Node(tag, attrs, self.cur)
        self.cur.children.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root:
            if n.tag == tag:
                self.cur = n.parent
                return
            n = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def parse(name):
    b = Builder()
    with io.open(os.path.join(ROOT, name), encoding="utf-8") as f:
        b.feed(f.read())
    return b.root


# ---------------------------------------------------------------- HTML → LaTeX
ESC = {
    "\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#", "_": r"\_",
    "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
    u"\u00a0": "~", u"“": "``", u"”": "''", u"‘": "`", u"’": "'", u"–": "--", u"—": "---",
}


def esc(s):
    return "".join(ESC.get(ch, ch) for ch in s)


def esc_url(u):
    return u.replace("\\", "").replace("%", r"\%").replace("#", r"\#").replace("{", "").replace("}", "")


def hidden(node, lang):
    """表示言語と違う側（data-ja / data-en）の要素か。"""
    return ("data-en" in node.attrs) if lang == "ja" else ("data-ja" in node.attrs)


def tidy(s):
    return re.sub(r"\s+", " ", s).strip()


def inline(node, lang, skip_cls=("count",), skip_tag=(), links=True):
    """要素の中身を、選んだ言語の LaTeX 文字列にする。"""
    parts = []
    for c in node.children:
        if not isinstance(c, Node):
            parts.append(esc(re.sub(r"\s+", " ", c)))
            continue
        if hidden(c, lang) or c.tag in skip_tag or any(c.has(k) for k in skip_cls):
            continue
        inner = inline(c, lang, skip_cls, skip_tag, links)
        if c.tag == "br":
            inner = " "
        elif not inner.strip():
            pass
        elif c.has("badge-award"):
            inner = r" \cvbadge{%s}" % inner.strip()
        elif c.tag in ("b", "strong"):
            inner = r"\textbf{%s}" % inner
        elif c.tag in ("i", "em"):
            inner = r"\textit{%s}" % inner
        elif c.tag == "sub":
            inner = r"\textsubscript{%s}" % inner
        elif c.tag == "sup":
            inner = r"\textsuperscript{%s}" % inner
        elif c.tag == "a" and links and (c.attrs.get("href") or "").startswith("http"):
            inner = r"\href{%s}{%s}" % (esc_url(c.attrs["href"]), inner)
        parts.append(inner)
    return "".join(parts)


def text(node, lang, **kw):
    return tidy(inline(node, lang, **kw))


def plain(node, lang):
    """装飾なしの文字列（LaTeX 用のエスケープもしない）。"""
    out = []
    for c in node.children:
        if not isinstance(c, Node):
            out.append(c)
        elif not hidden(c, lang):
            out.append(plain(c, lang))
    return re.sub(r"\s+", " ", "".join(out)).strip()


def count_label(title, n, lang):
    return (u"%s（%d件）" % (title, n)) if lang == "ja" else ("%s (%d)" % (title, n))


# ---------------------------------------------------------------- 各部分を組み立てる
def header(cv, lang):
    head = cv.find(cls="cv-print-head")
    h1 = head.find("h1")
    name = text(h1, lang, skip_tag=("small",))
    sub = text(h1.find("small"), lang) if h1.find("small") else ""
    ps = head.find_all("p")
    affil = text(ps[0], lang) if ps else ""
    contact = []
    for item in re.split(u"\\s*／\\s*", plain(ps[1], lang)) if len(ps) > 1 else []:
        if item.startswith("http"):
            contact.append(r"\href{%s}{%s}" % (esc_url(item), esc(re.sub(r"^https?://|/$", "", item))))
        elif item.upper().startswith("ORCID"):
            oid = item.split(":", 1)[1].strip()
            contact.append(r"ORCID: \href{https://orcid.org/%s}{%s}" % (esc_url(oid), esc(oid)))
        else:
            contact.append(esc(item))
    return name, sub, affil, r"\cvsep ".join(contact)


def cv_sections(cv, lang):
    """cv.html の各セクション（見出し＋年表 or 箇条書き）。"""
    out = []
    for sec in cv.find_all("section", cls="section"):
        title = sec.find(cls="section-title")
        if title is None or sec.has("no-print"):
            continue
        body = []
        for tl in sec.find_all(cls="timeline"):
            body.append(r"\begin{cvdates}")
            for li in tl.find_all("li"):
                lines = [text(li.find(cls="tl-title"), lang)]
                lines += [r"\cvnote{%s}" % text(n, lang) for n in li.find_all(cls="tl-note") if text(n, lang)]
                body.append(r"  \item[\cvdate{%s}] %s" % (text(li.find(cls="tl-date"), lang), r"\\ ".join(lines)))
            body.append(r"\end{cvdates}")
        for ul in sec.find_all(cls="plain-list"):
            body.append(r"\begin{cvitems}")
            for li in ul.find_all("li"):
                main = text(li, lang, skip_cls=("count", "pl-note"))
                notes = [text(n, lang) for n in li.find_all(cls="pl-note")]
                body.append(r"  \item " + r"\\ ".join([main] + [r"\cvnote{%s}" % n for n in notes if n]))
            body.append(r"\end{cvitems}")
        if body:
            out.append(r"\cvsection{%s}" % text(title, lang))
            out += body
    return out


def section_title(pubs, sec_id, lang, n=None):
    t = text(pubs.find(id=sec_id).find(cls="section-title"), lang)
    return count_label(t, n, lang) if n is not None else t


def grants(pubs, lang):
    sec = pubs.find(id="grants")
    if sec is None:
        return []
    out = [r"\cvsection{%s}" % section_title(pubs, "grants", lang), r"\begin{cvitems}"]
    for li in sec.find_all("li", cls="pub"):
        a = li.find(cls="pub-title")
        title = text(a, lang)
        if (a.attrs.get("href") or "").startswith("http"):
            title = r"\href{%s}{%s}" % (esc_url(a.attrs["href"]), title)
        notes = [text(p, lang) for p in li.find_all("p") if p.has("pub-authors") or p.has("pub-venue")]
        out.append(r"  \item " + r"\\ ".join([title] + [r"\cvnote{%s}" % n for n in notes if n]))
    out.append(r"\end{cvitems}")
    return out


def papers(pubs, lang):
    sec = pubs.find(id="papers")
    items = []
    for grp in sec.find_all(cls="paper-year"):
        year = text(grp.find(cls="paper-year-title"), lang)
        for li in grp.find_all("li", cls="pub"):
            a = li.find(cls="pub-title")
            title = text(a, lang)
            href = a.attrs.get("href") or ""
            if href.startswith("http"):
                title = r"\href{%s}{%s}" % (esc_url(href), title)
            authors = text(li.find(cls="pub-authors"), lang)
            venue = text(li.find(cls="pub-venue"), lang)
            entry = r"%s, ``%s,'' %s (%s)." % (authors, title, venue, year)
            if "arXiv" not in venue:  # 出版済みの論文には arXiv 番号も添える
                for tag in li.find_all("a", cls="tag"):
                    m = re.search(r"arxiv\.org/abs/([\w.\-/]+)", tag.attrs.get("href") or "")
                    if m:
                        entry += r" \href{%s}{arXiv:%s}." % (esc_url(tag.attrs["href"]), esc(m.group(1)))
                        break
            items.append(r"  \item " + entry)
    if not items:
        return []
    return ([r"\cvsection{%s}" % section_title(pubs, "papers", lang, len(items)), r"\begin{cvpapers}"]
            + items + [r"\end{cvpapers}"])


def talks(pubs, lang):
    sec = pubs.find(id="presentations")
    total = len(sec.find_all(cls="p-title"))
    out = [r"\cvsection{%s}" % section_title(pubs, "presentations", lang, total)]
    for cat in sec.find_all(cls="pres-cat"):
        n_cat = len(cat.find_all(cls="p-title"))
        out.append(r"\cvsubsection{%s}" % count_label(text(cat.find(cls="pres-cat-title"), lang), n_cat, lang))
        for grp in cat.find_all("details", cls="pres-group"):
            lis = [li for li in grp.find_all("li") if li.find(cls="p-title")]
            if not lis:
                continue
            out.append(r"\cvsubsubsection{%s}" % count_label(text(grp.find("summary"), lang), len(lis), lang))
            out.append(r"\begin{cvtalks}")
            for li in lis:
                lines = [text(li.find(cls="p-title"), lang)]
                lines += [r"\cvnote{%s}" % text(m, lang) for m in li.find_all(cls="p-meta") if text(m, lang)]
                out.append(r"  \item[\cvdate{%s}] %s" % (text(li.find(cls="p-date"), lang), r"\\ ".join(lines)))
            out.append(r"\end{cvtalks}")
    return out


# ---------------------------------------------------------------- LaTeX の雛形
TEMPLATE = r"""% このファイルは tools/build_cv.py が自動で作ります。直接編集しても次回の実行で上書きされます。
% 内容を変えたいときは cv.html / publications.html を編集してください。
\documentclass[a4paper,10pt]{@@CLASS@@}
\usepackage[haranoaji,deluxe]{luatexja-preset}
% 引用符やダッシュなどの記号は欧文として組む
\ltjsetparameter{jacharrange={-2,-3}}
\usepackage[a4paper,top=18mm,bottom=20mm,left=20mm,right=20mm,footskip=10mm]{geometry}
\usepackage{xcolor}
\usepackage{enumitem}
\usepackage{needspace}
\usepackage[bookmarks=false,colorlinks=true,urlcolor=cvaccent,linkcolor=cvaccent]{hyperref}
\hypersetup{pdftitle={@@PDFTITLE@@},pdfauthor={Kohei Hattori},pdflang={@@LANG@@}}

\definecolor{cvaccent}{HTML}{1F3C80}
\definecolor{cvmuted}{HTML}{555555}
\definecolor{cvrule}{HTML}{C5CAD3}

\newcommand{\cvupdated}{@@DATE@@}

\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\raggedbottom
\emergencystretch=3em
\widowpenalty=10000
\clubpenalty=10000

% ---- 見出し
\newcommand{\cvheadfont}{\sffamily\gtfamily\bfseries}
\newcommand{\cvsection}[1]{\par\addvspace{5.5mm}\Needspace{36mm}%
  {\noindent\cvheadfont\large\color{cvaccent}#1\par}\nobreak\vskip 1.2mm
  {\color{cvrule}\hrule height .6pt}\nobreak\vskip 2.8mm}
\newcommand{\cvsubsection}[1]{\par\addvspace{4mm}\Needspace{28mm}%
  {\noindent\cvheadfont #1\par}\nobreak\vskip 1mm}
\newcommand{\cvsubsubsection}[1]{\par\addvspace{2.6mm}\Needspace{20mm}%
  {\noindent\cvheadfont\small\color{cvmuted}#1\par}\nobreak\vskip 1mm}

% ---- 部品
\newcommand{\cvdate}[1]{{\small\color{cvmuted}#1}}
\newcommand{\cvnote}[1]{{\small\color{cvmuted}#1}}
\newcommand{\cvbadge}[1]{{\small\cvheadfont\color{cvaccent}[#1]}}
\newcommand{\cvsep}{\hspace{2.2mm}{\color{cvrule}\textbar}\hspace{2.2mm}}

% ---- リスト
\newlist{cvdates}{itemize}{1}
\setlist[cvdates]{label={},leftmargin=33mm,labelwidth=31mm,labelsep=2mm,align=left,
  itemsep=1.7mm,topsep=0pt,parsep=0pt,partopsep=0pt,before={\interlinepenalty=10000}}
\newlist{cvtalks}{itemize}{1}
\setlist[cvtalks]{label={},leftmargin=17mm,labelwidth=15mm,labelsep=2mm,align=left,
  itemsep=1.4mm,topsep=0pt,parsep=0pt,partopsep=0pt,before={\interlinepenalty=10000}}
\newlist{cvitems}{itemize}{1}
\setlist[cvitems]{label={\color{cvaccent}\textbullet},leftmargin=4.5mm,labelsep=2mm,
  itemsep=1.4mm,topsep=0pt,parsep=0pt,partopsep=0pt,before={\interlinepenalty=10000}}
\newlist{cvpapers}{enumerate}{1}
\setlist[cvpapers]{label={[\arabic*]},leftmargin=7.5mm,labelsep=2mm,
  itemsep=1.7mm,topsep=0pt,parsep=0pt,partopsep=0pt,before={\interlinepenalty=10000}}

% ---- フッター
\makeatletter
\@beginparpenalty=10000 % 見出しと最初の項目の間で改ページしない
\renewcommand{\ps@plain}{\let\@mkboth\@gobbletwo\let\@oddhead\@empty\let\@evenhead\@empty
  \def\@oddfoot{\footnotesize\color{cvmuted}Kohei Hattori --- Curriculum Vitae\hfill\thepage}%
  \let\@evenfoot\@oddfoot}
\makeatother
\pagestyle{plain}

\begin{document}
\setlength{\parindent}{0pt}

{\fontsize{22}{26}\selectfont\bfseries @@NAME@@}\hspace{4mm}{\large\color{cvmuted}@@NAMESUB@@}\par
\vspace{3mm}
{\small @@AFFIL@@\par}
\vspace{1.2mm}
{\small @@CONTACT@@\par}
\vspace{3mm}
{\color{cvaccent}\hrule height 1.1pt}
\vspace{1.5mm}
{\raggedleft\footnotesize\color{cvmuted}\cvupdated\par}
\vspace{-2mm}

@@BODY@@

\end{document}
"""

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def make_tex(lang, cv, pubs, today):
    name, sub, affil, contact = header(cv, lang)
    body = cv_sections(cv, lang) + grants(pubs, lang) + papers(pubs, lang) + talks(pubs, lang)
    if lang == "ja":
        date = u"%d年%d月%d日 現在" % (today.year, today.month, today.day)
    else:
        date = "Last updated: %s %d, %d" % (MONTHS[today.month - 1], today.day, today.year)
    rep = {
        "@@CLASS@@": "ltjsarticle" if lang == "ja" else "article",
        "@@LANG@@": lang,
        "@@PDFTITLE@@": u"服部航平 CV" if lang == "ja" else "Kohei Hattori CV",
        "@@DATE@@": date,
        "@@NAME@@": name, "@@NAMESUB@@": sub, "@@AFFIL@@": affil, "@@CONTACT@@": contact,
        "@@BODY@@": "\n".join(body),
    }
    tex = TEMPLATE
    for k, v in rep.items():
        tex = tex.replace(k, v)
    return tex


# ---------------------------------------------------------------- PDF を作る
def without_date(tex):
    return re.sub(r"\\newcommand\{\\cvupdated\}\{.*\}", "", tex)


def find_lualatex():
    exe = shutil.which("lualatex")
    if exe:
        return exe
    for d in TEX_BIN:
        if os.path.exists(os.path.join(d, "lualatex")):
            return os.path.join(d, "lualatex")
    return None


def compile_tex(lualatex, base):
    env = dict(os.environ)
    env["PATH"] = os.path.dirname(lualatex) + os.pathsep + env.get("PATH", "")
    p = subprocess.run([lualatex, "-interaction=nonstopmode", "-halt-on-error", base + ".tex"],
                       cwd=BUILD, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log_path = os.path.join(BUILD, base + ".log")
    log = io.open(log_path, encoding="utf-8", errors="replace").read() if os.path.exists(log_path) else ""
    if p.returncode != 0 or not os.path.exists(os.path.join(BUILD, base + ".pdf")):
        tail = "\n".join(p.stdout.decode("utf-8", "replace").splitlines()[-25:])
        raise RuntimeError("lualatex failed for %s.tex\n%s\n(log: %s)" % (base, tail, log_path))
    missing = sorted(set(re.findall(r"Missing character: There is no (\S+)", log)))
    if missing:
        print("  warning: %s.pdf に表示できない文字があります: %s" % (base, " ".join(missing)))


def main():
    force = "--force" in sys.argv
    lualatex = find_lualatex()
    if not lualatex:
        print("build_cv: lualatex が見つかりません（MacTeX / TeX Live が必要です）。")
        return 1
    os.makedirs(BUILD, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    cv, pubs = parse("cv.html"), parse("publications.html")
    today = datetime.date.today()
    built = []
    for lang in ("ja", "en"):
        base = "cv_" + lang
        tex = make_tex(lang, cv, pubs, today)
        tex_path = os.path.join(BUILD, base + ".tex")
        pdf_out = os.path.join(OUT, PDF_NAME[lang])
        old = io.open(tex_path, encoding="utf-8").read() if os.path.exists(tex_path) else None
        if not force and old is not None and os.path.exists(pdf_out) and without_date(old) == without_date(tex):
            print("build_cv: %s は最新です（変更なし）" % PDF_NAME[lang])
            continue
        with io.open(tex_path, "w", encoding="utf-8") as f:
            f.write(tex)
        try:
            compile_tex(lualatex, base)
        except Exception:
            os.remove(tex_path)  # 次回もう一度作り直すように
            raise
        shutil.copyfile(os.path.join(BUILD, base + ".pdf"), pdf_out)
        built.append(PDF_NAME[lang])
        print("build_cv: %s を作りました" % PDF_NAME[lang])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa
        print("build_cv: 失敗しました\n%s" % e)
        sys.exit(1)
