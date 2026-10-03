#!/usr/bin/env python3
"""Draws the README illustrations: `python docs/draw.py` rewrites docs/*.svg.

Every color is the mod's own (crush-style/hooks/theme.tsx), and every row is
laid out the way the mod lays it out. Text runs carry `textLength`, so a row
lines up whatever monospace font the viewer has; the glyphs a font may lack
(the bar, the diagonal fill, the meter, the status marks) are drawn as shapes.
"""

from pathlib import Path
from unicodedata import east_asian_width
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent

C = {
    'primary': '#6B50FF',  # Charple
    'secondary': '#FF60FF',  # Dolly
    'tertiary': '#68FFD6',  # Bok
    'info': '#00A4FF',  # Malibu
    'success': '#12C78F',  # Guac
    'warn': '#F5EF34',  # Mustard
    'error': '#EB4268',  # Sriracha
    'muted': '#858392',  # Squid
    'subtle': '#605F6B',  # Oyster
    'line': '#4B4A57',
}
FG = '#DFDBDD'
BG = '#151419'
BAR = '#1f1e25'
FRAME = '#2e2d36'
CLAUDE = '#D77757'

CW = 8.4  # one terminal cell
LH = 20  # one terminal row
FONT = 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace'


def rgb(color: str) -> tuple[int, int, int]:
    return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)


def mix(a: str, b: str, t: float) -> str:
    return '#' + ''.join(f'{round(x + (y - x) * t):02x}' for x, y in zip(rgb(a), rgb(b)))


def dimmed(color: str) -> str:
    return mix(color, C['line'], 0.55)


def cells(s: str) -> int:
    return sum(2 if east_asian_width(ch) in 'WF' else 1 for ch in s)


class Canvas:
    def __init__(self, width: float, height: float) -> None:
        self.width, self.height = width, height
        self.defs: list[str] = []
        self.body: list[str] = []
        self.count = 0

    def uid(self, prefix: str) -> str:
        self.count += 1

        return f'{prefix}{self.count}'

    def add(self, *parts: str) -> None:
        self.body.extend(parts)

    def window(self, x: float, y: float, w: float, h: float, title: str = '') -> None:
        r = 10
        self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{BG}" stroke="{FRAME}"/>',
            f'<path d="M{x},{y + 30} V{y + r} a{r},{r} 0 0 1 {r},{-r} H{x + w - r} a{r},{r} 0 0 1 {r},{r} V{y + 30} Z" fill="{BAR}"/>',
            f'<line x1="{x}" y1="{y + 30}" x2="{x + w}" y2="{y + 30}" stroke="{FRAME}"/>',
        )

        for i in range(3):
            self.add(f'<circle cx="{x + 18 + i * 17}" cy="{y + 15}" r="5" fill="#3a3942"/>')

        if title:
            self.add(f'<text x="{x + w / 2}" y="{y + 19.5}" text-anchor="middle" fill="{C["muted"]}" font-size="12.5">{escape(title)}</text>')

    def svg(self, title: str, desc: str, backdrop: bool = False) -> str:
        """The finished image. `backdrop` lays a dark card under it all, so its light
        labels read on GitHub's light theme as on its dark one."""
        style = f'<style>text{{font-family:{FONT};font-size:14px;white-space:pre}}</style>'
        card = f'<rect width="{self.width}" height="{self.height}" rx="14" fill="#0d0c11"/>' if backdrop else ''

        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" '
            f'viewBox="0 0 {self.width} {self.height}" role="img" aria-labelledby="title desc">'
            f'<title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc>'
            f'{style}<defs>{"".join(self.defs)}</defs>{card}{"".join(self.body)}</svg>\n'
        )


class Grid:
    """Draws into a cell grid whose top-left cell sits at (ox, oy)."""

    def __init__(self, canvas: Canvas, ox: float, oy: float) -> None:
        self.c, self.ox, self.oy = canvas, ox, oy

    def at(self, col: float, row: float) -> tuple[float, float]:
        return round(self.ox + col * CW, 2), round(self.oy + row * LH, 2)

    def text(self, col: float, row: float, s: str, color: str = FG, bold: bool = False, fill: str | None = None) -> float:
        """Writes `s` from that cell, exactly as many cells wide as a terminal draws it; returns the next column."""
        x, y = self.at(col, row)
        weight = ' font-weight="bold"' if bold else ''
        self.c.add(
            f'<text x="{x}" y="{round(y + 14.5, 2)}" textLength="{round(cells(s) * CW, 2)}" '
            f'lengthAdjust="spacingAndGlyphs" fill="{fill or color}"{weight}>{escape(s)}</text>'
        )

        return col + cells(s)

    def right(self, end_col: float, row: float, s: str, color: str = FG) -> None:
        self.text(end_col - cells(s), row, s, color)

    def gradient_text(self, col: float, row: float, s: str, a: str, b: str, bold: bool = False) -> float:
        gid = self.c.uid('g')
        self.c.defs.append(f'<linearGradient id="{gid}"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>')

        return self.text(col, row, s, bold=bold, fill=f'url(#{gid})')

    def shimmer_text(self, col: float, row: float, s: str) -> float:
        """The spinner's word: a purple-pink wave that travels through it, as the mod animates it."""
        x, _ = self.at(col, row)
        w = round(cells(s) * CW, 2)
        gid = self.c.uid('s')
        self.c.defs.append(
            f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{x}" y1="0" x2="{round(x + w, 2)}" y2="0" spreadMethod="repeat">'
            f'<stop offset="0" stop-color="{C["primary"]}"/><stop offset="0.5" stop-color="{C["secondary"]}"/>'
            f'<stop offset="1" stop-color="{C["primary"]}"/>'
            f'<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="{w} 0" dur="1.7s" repeatCount="indefinite"/>'
            f'</linearGradient>'
        )

        return self.text(col, row, s, fill=f'url(#{gid})')

    def bar(self, col: float, row: float, rows: int = 1) -> None:
        x, y = self.at(col, row)
        self.c.add(f'<rect x="{x}" y="{y}" width="{CW * 0.5}" height="{LH * rows}" fill="{C["primary"]}"/>')

    def check(self, col: float, row: float, color: str = C['success']) -> None:
        x, y = self.at(col, row)
        self.c.add(
            f'<polyline points="{x + 1.4},{y + 10.6} {x + 3.6},{y + 13.2} {x + 7.2},{y + 6.8}" fill="none" '
            f'stroke="{color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
        )

    def disc(self, col: float, row: float, color: str, r: float = 3.2) -> None:
        x, y = self.at(col, row)
        self.c.add(f'<circle cx="{x + CW / 2}" cy="{y + LH / 2}" r="{r}" fill="{color}"/>')

    def ring(self, col: float, row: float, color: str) -> None:
        x, y = self.at(col, row)
        self.c.add(f'<circle cx="{x + CW / 2}" cy="{y + LH / 2}" r="3" fill="none" stroke="{color}" stroke-width="1.3"/>')

    def diamond(self, col: float, row: float, color: str = C['secondary']) -> None:
        x, y = self.at(col, row)
        cx, cy = x + CW / 2, y + LH / 2
        self.c.add(
            f'<polygon points="{cx},{cy - 4.8} {cx + 3.8},{cy} {cx},{cy + 4.8} {cx - 3.8},{cy}" fill="none" '
            f'stroke="{color}" stroke-width="1.4" stroke-linejoin="round"/>'
        )

    def branch(self, col: float, row: float, color: str = C['muted']) -> None:
        x, y = self.at(col, row)
        a, b = x + 2.4, x + 7
        self.c.add(
            f'<g fill="none" stroke="{color}" stroke-width="1.2">'
            f'<circle cx="{a}" cy="{y + 5}" r="1.6"/><circle cx="{a}" cy="{y + 15}" r="1.6"/>'
            f'<circle cx="{b}" cy="{y + 7.5}" r="1.6"/><line x1="{a}" y1="{y + 6.6}" x2="{a}" y2="{y + 13.4}"/>'
            f'<path d="M{b},{y + 9.1} Q{b},{y + 12.4} {a},{y + 12.6}"/></g>'
        )

    def asterisk(self, col: float, row: float, color: str = CLAUDE) -> None:
        x, y = self.at(col, row)
        cx, cy = x + CW / 2, y + LH / 2
        spokes = ''.join(
            f'<line x1="{cx}" y1="{cy}" x2="{round(cx + 4.2 * dx, 2)}" y2="{round(cy + 4.2 * dy, 2)}"/>'
            for dx, dy in ((0, -1), (0.87, -0.5), (0.87, 0.5), (0, 1), (-0.87, 0.5), (-0.87, -0.5))
        )
        self.c.add(f'<g stroke="{color}" stroke-width="1.6" stroke-linecap="round">{spokes}</g>')

    def spinner(self, col: float, row: float) -> None:
        """A braille spinner: one of eight dots goes dark and the gap runs round."""
        x, y = self.at(col, row)
        order = ((0, 0), (1, 0), (1, 1), (1, 2), (1, 3), (0, 3), (0, 2), (0, 1))
        dots = []

        for i, (dc, dr) in enumerate(order):
            color = mix(C['primary'], C['secondary'], i / 7)
            dots.append(
                f'<circle cx="{round(x + 2.4 + dc * 3.6, 2)}" cy="{round(y + 4.4 + dr * 3.8, 2)}" r="1.25" fill="{color}">'
                f'<animate attributeName="opacity" values="0.15;1;1;1;1;1;1;1" calcMode="discrete" dur="0.96s" '
                f'begin="{round(i * 0.12, 2)}s" repeatCount="indefinite"/></circle>'
            )

        self.c.add(*dots)

    def gutter(self, col: float, row: float, last: bool = False) -> None:
        x, y = self.at(col, row)
        mx = x + CW / 2

        if last:
            self.c.add(
                f'<path d="M{mx},{y} V{y + LH / 2 - 3} Q{mx},{y + LH / 2} {mx + 3},{y + LH / 2} H{x + CW}" '
                f'fill="none" stroke="{C["line"]}" stroke-width="1.2"/>'
            )
        else:
            self.c.add(f'<line x1="{mx}" y1="{y}" x2="{mx}" y2="{y + LH}" stroke="{C["line"]}" stroke-width="1.2"/>')

    def meter(self, col: float, row: float, percent: float, width: int) -> float:
        x, y = self.at(col, row)
        filled = round(percent / 100 * width)

        for i in range(width):
            cx = round(x + i * CW + 0.6, 2)

            if i < filled:
                color = mix(C['primary'], C['secondary'], i / max(1, width - 1))
                self.c.add(f'<rect x="{cx}" y="{y + 4}" width="{CW - 1.2}" height="{LH - 8}" rx="1" fill="{color}"/>')
            else:
                self.c.add(f'<rect x="{cx}" y="{y + 4}" width="{CW - 1.2}" height="{LH - 8}" rx="1" fill="{C["line"]}" opacity="0.45"/>')

        return col + width

    def rule(self, col: float, row: float, width: int, a: str, b: str) -> float:
        """Crush's diagonal fill, `width` cells of it on a ramp from `a` to `b`."""
        x, y = self.at(col, row)

        for i in range(max(0, width)):
            color = mix(a, b, i / max(1, width - 1))
            self.c.add(
                f'<line x1="{round(x + i * CW + 1.3, 2)}" y1="{y + LH - 5}" x2="{round(x + (i + 1) * CW - 1.3, 2)}" '
                f'y2="{y + 5}" stroke="{color}" stroke-width="1.3" stroke-linecap="round"/>'
            )

        return col + max(0, width)

    def section(self, col: float, row: float, title: str, width: int) -> None:
        nxt = self.text(col, row, title, C['muted'])
        self.rule(nxt + 1, row, width - cells(title) - 1, dimmed(C['primary']), dimmed(C['secondary']))

    def tool(self, row: float, status: str, name: str, detail: str, frame_end: int | None = None, tail: tuple[int, int] | None = None) -> None:
        if status == 'done':
            self.check(0, row)
        elif status == 'running':
            self.spinner(0, row)

        nxt = self.text(2, row, name, C['info'], bold=True)
        self.text(nxt + 1, row, detail, C['muted'])

        if tail is not None and frame_end is not None:
            added, removed = f'+{tail[0]}', f'-{tail[1]}'
            start = frame_end - cells(added) - 1 - cells(removed)
            self.text(start, row, added, C['success'])
            self.text(start + cells(added) + 1, row, removed, C['error'])

    def prompt(self, row: float, width: int, segments: list[tuple[str, str, bool]]) -> None:
        x0, y0 = self.at(0, row)
        x1 = x0 + width * CW
        self.c.add(
            f'<line x1="{x0}" y1="{y0 - 6}" x2="{x1}" y2="{y0 - 6}" stroke="{C["line"]}"/>',
            f'<line x1="{x0}" y1="{y0 + LH + 6}" x2="{x1}" y2="{y0 + LH + 6}" stroke="{C["line"]}"/>',
            f'<polyline points="{x0 + 1.5},{y0 + 6} {x0 + 5.5},{y0 + 10} {x0 + 1.5},{y0 + 14}" fill="none" stroke="{FG}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
        )
        col = 2.0

        for s, color, bold in segments:
            col = self.text(col, row, s, color, bold)

        cx, cy = self.at(col, row)
        self.c.add(f'<rect x="{cx + 1}" y="{cy + 3}" width="{CW - 1}" height="{LH - 6}" fill="{FG}" opacity="0.75"/>')


def band(g: Grid, row: float, width: int, model: str, percent: int, usd: str, todos: str, branch: str, place: str) -> None:
    """The line above the prompt, laid out as the mod's bandRow lays it out."""
    col = g.rule(0, row, 2, dimmed(C['primary']), dimmed(C['secondary'])) + 1
    parts = [
        ('model', 2 + cells(model)),
        ('meter', 8 + cells(f' {percent}%')),
        ('usd', cells(usd)),
        ('todos', 2 + cells(todos)),
        ('branch', 2 + cells(branch)),
        ('place', cells(place)),
    ]

    for i, (kind, w) in enumerate(parts):
        if col + (3 if i else 0) + w > width - 1:
            break

        if i:
            g.text(col, row, ' · ', C['subtle'])
            col += 3

        if kind == 'model':
            g.diamond(col, row)
            col = g.text(col + 2, row, model)
        elif kind == 'meter':
            col = g.text(g.meter(col, row, percent, 8), row, f' {percent}%', C['muted'])
        elif kind == 'usd':
            col = g.text(col, row, usd, C['muted'])
        elif kind == 'todos':
            g.check(col, row, C['muted'])
            col = g.text(col + 2, row, todos, C['muted'])
        elif kind == 'branch':
            g.branch(col, row)
            col = g.text(col + 2, row, branch, C['muted'])
        else:
            col = g.text(col, row, place, C['subtle'])

    fill = width - int(col) - 2

    if fill >= 3:
        g.rule(col + 1, row, fill, dimmed(C['secondary']), dimmed(C['primary']))


def overview() -> str:
    talk, side_col, side_w = 74, 77, 32  # transcript cells; sidebar body starts at 77, 32 wide
    ox, oy = 20, 50
    canvas = Canvas(964, 646)
    canvas.window(0, 0, 964, 646, 'claude · ~/code/my-app')
    g = Grid(canvas, ox, oy)

    # The transcript, oldest at the top.
    g.bar(0, 0)
    g.text(2, 0, '帮我修一下构建脚本')
    g.text(2, 2, '构建脚本里的输出路径写错了,我来改一下。')
    g.tool(4, 'done', 'View', 'package.json')
    g.tool(5, 'done', 'Edit', 'scripts/build.js', frame_end=talk, tail=(3, 1))
    g.tool(6, 'done', 'Bash', 'npm run build')

    for i, line in enumerate(('> my-app@1.0.0 build', '> node scripts/build.js', 'built 42 files in 1.3s')):
        g.gutter(2, 7 + i)
        g.text(4, 7 + i, line)

    g.gutter(2, 10, last=True)
    g.text(4, 10, '… 6 more lines (ctrl+o to expand)', C['subtle'])
    g.text(2, 12, '修好了,构建已经通过。')
    g.diamond(0, 13)
    g.text(2, 13, 'Opus 5.5', C['muted'])
    g.text(12, 13, '1m 4s', C['subtle'])
    g.bar(0, 15)
    g.text(2, 15, '再跑一遍测试')
    g.tool(17, 'running', 'Bash', 'npm test')
    g.spinner(0, 19)
    nxt = g.shimmer_text(2, 19, 'Thinking')
    g.text(nxt, 19, '…', C['subtle'])
    g.text(nxt + 3, 19, '8s', C['subtle'])
    band(g, 24, talk, 'Opus 5.5', 34, '$0.42', '1/3', 'main', '~/code/my-app')

    # The divider the engine draws beside a docked pane, and its close mark.
    dx = ox + 75.3 * CW
    canvas.add(f'<line x1="{dx}" y1="{oy - 8}" x2="{dx}" y2="{oy + 25 * LH}" stroke="{FRAME}" stroke-width="2"/>')
    g.text(side_col + side_w, 0, '×', C['subtle'])

    # The sidebar.
    s, end = side_col, side_col + side_w
    nxt = g.gradient_text(s, 0, 'CLAUDE CODE', C['primary'], C['secondary'], bold=True)
    g.rule(nxt + 1, 0, side_w - 12, dimmed(C['primary']), dimmed(C['secondary']))
    g.text(s, 2, '帮我修一下构建脚本', bold=True)
    g.text(s, 3, '~/code/my-app', C['muted'])
    g.branch(s, 4)
    g.text(s + 2, 4, 'main', C['muted'])
    g.diamond(s, 6)
    g.text(s + 2, 6, 'Opus 5.5')
    g.text(g.meter(s + 2, 7, 34, 20), 7, ' 34%', C['muted'])
    g.text(s + 2, 8, '68.0K / 200.0K', C['muted'])
    g.text(s + 2, 9, '$0.42', C['muted'])

    for row, label, pct in ((10, '5h', 23), (11, '7d', 8)):
        g.text(s + 2, row, label, C['muted'])
        g.text(g.meter(s + 8, row, pct, 12), row, f' {pct}%', C['muted'])

    g.section(s, 13, 'Modified Files', side_w)
    nxt = g.text(s, 14, '+3', C['success'])
    nxt = g.text(nxt + 1, 14, '-1', C['error'])
    g.text(nxt + 1, 14, 'scripts/build.js')
    g.section(s, 16, 'To-Do 1/3', side_w)
    g.check(s, 17)
    g.text(s + 2, 17, '找到报错原因', C['muted'])
    g.disc(s, 18, C['secondary'])
    g.text(s + 2, 18, '正在跑测试')
    g.ring(s, 19, C['subtle'])
    g.text(s + 2, 19, '更新文档', C['muted'])
    g.section(s, 21, 'Activity', side_w)

    for row, (tool, count) in enumerate((('Bash', '2'), ('Edit', '1'), ('View', '1')), start=22):
        g.text(s, row, tool, C['muted'])
        g.right(end, row, count, C['subtle'])

    # The prompt, full width under both, with a draft the mod colors.
    g.prompt(26, 110, [('/review', C['secondary'], True), (' ', FG, False), ('@scripts/build.js', C['tertiary'], False)])
    g.text(2, 28, 'esc to interrupt', C['subtle'])

    return canvas.svg(
        'Claude Crush 界面示意',
        '对话区、侧边栏、状态行和输入框,按 crush-style mod 的配色和布局绘制。',
    )


def switch() -> str:
    """The same exchange drawn by Claude Code as it ships (left) and by the mod (right)."""
    cols, pad, gap = 46, 16, 96
    win_w = cols * CW + pad * 2
    canvas = Canvas(round(20 * 2 + win_w * 2 + gap), 312)
    left_x, right_x = 20, 20 + win_w + gap

    for x, label, sub in ((left_x, 'Claude Code 原样', '/crush off'), (right_x, 'Crush 风格', '/crush on')):
        canvas.add(
            f'<text x="{x + win_w / 2}" y="24" text-anchor="middle" fill="{FG}" font-weight="bold">{escape(label)}</text>',
        )
        canvas.window(x, 40, win_w, 252, sub)

    a = Grid(canvas, left_x + pad, 82)
    a.text(0, 0, '>', C['muted'])
    a.text(2, 0, '帮我修一下构建脚本')
    a.disc(0, 2, FG, 3)
    a.text(2, 2, '构建脚本里的输出路径写错了,我来改一下。')
    a.disc(0, 4, C['success'], 3)
    nxt = a.text(2, 4, 'Update', bold=True)
    a.text(nxt, 4, '(scripts/build.js)')
    a.text(2, 5, '⎿', C['muted'])
    a.text(5, 5, 'Added 3 lines, removed 1 line', C['muted'])
    a.disc(0, 6, C['success'], 3)
    nxt = a.text(2, 6, 'Bash', bold=True)
    a.text(nxt, 6, '(npm run build)')
    a.text(2, 7, '⎿', C['muted'])
    a.text(5, 7, '> my-app@1.0.0 build', C['muted'])
    a.asterisk(0, 9)
    nxt = a.text(2, 9, 'Sauteing…', CLAUDE)
    a.text(nxt + 1, 9, '(8s · esc to interrupt)', C['muted'])

    b = Grid(canvas, right_x + pad, 82)
    b.bar(0, 0)
    b.text(2, 0, '帮我修一下构建脚本')
    b.text(2, 2, '构建脚本里的输出路径写错了,我来改一下。')
    b.tool(4, 'done', 'Edit', 'scripts/build.js', frame_end=cols, tail=(3, 1))
    b.gutter(2, 5, last=True)
    b.text(4, 5, 'Added 3 lines, removed 1 line', C['muted'])
    b.tool(6, 'done', 'Bash', 'npm run build')
    b.gutter(2, 7, last=True)
    b.text(4, 7, '> my-app@1.0.0 build')
    b.spinner(0, 9)
    nxt = b.shimmer_text(2, 9, 'Thinking')
    b.text(nxt, 9, '…', C['subtle'])
    b.text(nxt + 3, 9, '8s', C['subtle'])

    # The switch between them.
    mx, x0, x1 = left_x + win_w + gap / 2, left_x + win_w + 14, right_x - 14
    canvas.add(
        f'<g fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
        f'<path d="M{x0},146 H{x1} M{x1 - 7},140 L{x1},146 L{x1 - 7},152" stroke="{C["secondary"]}"/>'
        f'<path d="M{x1},206 H{x0} M{x0 + 7},200 L{x0},206 L{x0 + 7},212" stroke="{C["muted"]}"/></g>',
        f'<text x="{mx}" y="134" text-anchor="middle" fill="{C["secondary"]}" font-size="13">/crush on</text>',
        f'<text x="{mx}" y="230" text-anchor="middle" fill="{C["muted"]}" font-size="13">/crush off</text>',
    )

    return canvas.svg(
        '/crush on 与 /crush off 对比',
        '同一段对话,左边是 Claude Code 原样,右边是 crush-style mod 打开后的样子。',
        backdrop=True,
    )


def layouts() -> str:
    """Where the sidebar shows up, by layout and terminal width."""
    panel_w, gap, top = 288, 22, 44
    canvas = Canvas(20 * 2 + panel_w * 3 + gap * 2, 312)
    panels = (
        ('全屏模式 · 至少 144 列', 'dock', ('侧边栏自动停靠在旁边',)),
        ('全屏模式 · 110 到 143 列', 'ask', ('输入 /sidebar 打开,', '同样停靠在旁边')),
        ('非全屏模式', 'inline', ('输入 /sidebar 后,', '在输入框上方展开')),
    )

    for i, (title, kind, caption) in enumerate(panels):
        x = 20 + i * (panel_w + gap)
        canvas.add(f'<text x="{x + panel_w / 2}" y="26" text-anchor="middle" fill="{FG}" font-weight="bold">{escape(title)}</text>')
        canvas.window(x, top, panel_w, 196)
        body_top, body_bottom = top + 42, top + 196 - 12
        talk_right = x + panel_w - (110 if kind in ('dock', 'ask') else 14)

        # The transcript: a prompt, a reply, two tool rows.
        rows = [
            (C['primary'], 0.62),
            (FG, 0.85),
            (C['success'], 0.5),
            (C['success'], 0.7),
            (FG, 0.6),
        ]

        # Inline, the opened block takes the room the last rows would have had.
        for j, (lead, share) in enumerate(rows[:3] if kind == 'inline' else rows):
            y = body_top + j * 15
            canvas.add(f'<rect x="{x + 14}" y="{y}" width="4" height="8" rx="1" fill="{lead}"/>')
            width = (talk_right - x - 30) * share
            canvas.add(f'<rect x="{x + 24}" y="{y + 1.5}" width="{round(width, 1)}" height="5" rx="2.5" fill="{C["muted"] if j else FG}" opacity="0.55"/>')

        # The band and the prompt, at the foot.
        band_y = body_bottom - 34
        canvas.add(
            f'<rect x="{x + 14}" y="{band_y}" width="{round(talk_right - x - 28, 1)}" height="5" rx="2.5" fill="{dimmed(C["primary"])}"/>',
            f'<line x1="{x + 14}" y1="{body_bottom - 22}" x2="{x + panel_w - 14}" y2="{body_bottom - 22}" stroke="{C["line"]}"/>',
            f'<polyline points="{x + 15},{body_bottom - 15} {x + 19},{body_bottom - 11} {x + 15},{body_bottom - 7}" fill="none" stroke="{FG}" stroke-width="1.4"/>',
            f'<line x1="{x + 14}" y1="{body_bottom}" x2="{x + panel_w - 14}" y2="{body_bottom}" stroke="{C["line"]}"/>',
        )

        if kind in ('dock', 'ask'):
            sx, sy, sw, sh = x + panel_w - 98, body_top - 4, 84, band_y - body_top + 10
            dashed = ' stroke-dasharray="4 3"' if kind == 'ask' else ''
            fill = '#1d1c24' if kind == 'dock' else 'none'
            canvas.add(f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="4" fill="{fill}" stroke="{C["line"] if kind == "dock" else C["secondary"]}"{dashed}/>')

            if kind == 'dock':
                gid = canvas.uid('lg')
                canvas.defs.append(f'<linearGradient id="{gid}"><stop offset="0" stop-color="{C["primary"]}"/><stop offset="1" stop-color="{C["secondary"]}"/></linearGradient>')
                canvas.add(f'<rect x="{sx + 7}" y="{sy + 8}" width="34" height="5" rx="2.5" fill="url(#{gid})"/>')

                # Title, the context meter on the brand ramp, then the sections.
                for k, share in enumerate((0.8, None, 0.7, 0.45, 0.65, 0.5, 0.6)):
                    fill = f'url(#{gid})' if share is None else C['muted']
                    opacity = '' if share is None else ' opacity="0.5"'
                    canvas.add(
                        f'<rect x="{sx + 7}" y="{sy + 21 + k * 12}" width="{round((sw - 14) * (share or 0.6), 1)}" '
                        f'height="4" rx="2" fill="{fill}"{opacity}/>'
                    )
            else:
                canvas.add(
                    f'<text x="{sx + sw / 2}" y="{sy + sh / 2 + 1}" text-anchor="middle" fill="{C["secondary"]}" font-size="12">/sidebar</text>'
                )
        else:
            iy = band_y - 50
            canvas.add(
                f'<rect x="{x + 14}" y="{iy}" width="{panel_w - 28}" height="42" rx="4" fill="none" stroke="{C["secondary"]}" stroke-dasharray="4 3"/>',
                f'<text x="{x + panel_w / 2}" y="{iy + 26}" text-anchor="middle" fill="{C["secondary"]}" font-size="13">/sidebar</text>',
            )

        for k, line in enumerate(caption):
            canvas.add(f'<text x="{x + panel_w / 2}" y="{top + 196 + 24 + k * 20}" text-anchor="middle" fill="{C["muted"]}" font-size="13">{escape(line)}</text>')

    return canvas.svg(
        '侧边栏在哪里出现',
        '全屏模式下够宽时侧边栏自动停靠;窄一些时输入 /sidebar 打开;非全屏时 /sidebar 在输入框上方展开。',
        backdrop=True,
    )


if __name__ == '__main__':
    for name, draw in (('overview', overview), ('switch', switch), ('layouts', layouts)):
        (HERE / f'{name}.svg').write_text(draw(), encoding='utf-8')
        print(f'wrote docs/{name}.svg')
