"""Gera a marca do NOA: cérebro estilizado com conexões em neon.

Saídas (na pasta passada como argumento, padrão "assets"):
  icon.png     1024x1024, fundo escuro (ícone do iPhone)
  cerebro.png  1024x1024, fundo transparente (usado dentro do app)
  splash.png   1242x2436, tela de abertura

Só usa Pillow. Sempre gera a mesma imagem (semente fixa).
"""
import math
import os
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 1024
CIANO = (0, 229, 255)
MAGENTA = (255, 43, 214)
ROXO = (124, 77, 255)


def mistura(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def cor_em(x):
    # ciano à esquerda -> roxo no meio -> magenta à direita
    t = (x - 200) / (S - 400)
    if t < 0.5:
        return mistura(CIANO, ROXO, t / 0.5)
    return mistura(ROXO, MAGENTA, (t - 0.5) / 0.5)


def fundo(tam_w, tam_h):
    peq = Image.new("RGB", (128, int(128 * tam_h / tam_w)))
    w, h = peq.size
    px = []
    for y in range(h):
        for x in range(w):
            dx = (x - w / 2) / (w / 2)
            dy = (y - h * 0.47) / (w / 2)
            d = min(1.0, math.sqrt(dx * dx + dy * dy))
            c = mistura((16, 20, 58), (2, 3, 10), d ** 0.8)
            px.append(c)
    peq.putdata(px)
    return peq.resize((tam_w, tam_h), Image.BICUBIC)


def mascara_cerebro():
    """Silhueta do cérebro visto de cima: dois hemisférios formados por lóbulos."""
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    lobos = [
        # (cx, cy, rx, ry) para o hemisfério esquerdo; o direito é espelhado
        (395, 330, 120, 105),
        (330, 420, 135, 120),
        (305, 535, 130, 125),
        (335, 650, 125, 110),
        (410, 715, 105, 85),
        (430, 470, 95, 170),
        (440, 600, 85, 150),
    ]
    for cx, cy, rx, ry in lobos:
        for x in (cx, S - cx):
            d.ellipse([x - rx, cy - ry, x + rx, cy + ry], fill=255)
    # fissura central
    d.rectangle([S / 2 - 9, 180, S / 2 + 9, 860], fill=0)
    return m.filter(ImageFilter.GaussianBlur(3)).point(lambda v: 255 if v > 128 else 0)


def pontos_dentro(m, n, dist_min, rnd):
    px = m.load()
    pts = []
    tentativas = 0
    while len(pts) < n and tentativas < 40000:
        tentativas += 1
        x = rnd.uniform(170, S - 170)
        y = rnd.uniform(200, 840)
        if px[int(x), int(y)] == 0:
            continue
        # longe da borda para os nós não ficarem cortados
        if px[int(min(S - 1, x + 18)), int(y)] == 0 or px[int(max(0, x - 18)), int(y)] == 0:
            continue
        if any((x - a) ** 2 + (y - b) ** 2 < dist_min ** 2 for a, b in pts):
            continue
        pts.append((x, y))
    return pts


def desenhar_cerebro(transparente):
    rnd = random.Random(7)
    m = mascara_cerebro()
    pts = pontos_dentro(m, 120, 46, rnd)

    linhas = []
    for i, (x, y) in enumerate(pts):
        viz = sorted(
            ((math.hypot(x - a, y - b), j) for j, (a, b) in enumerate(pts) if j != i),
        )[:3]
        for dist, j in viz:
            a, b = pts[j]
            atravessa = (x - S / 2) * (a - S / 2) < 0
            if dist < 125 and (not atravessa or rnd.random() < 0.35):
                linhas.append((min(i, j), max(i, j)))
    linhas = sorted(set(linhas))

    brilho = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    nitido = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    db = ImageDraw.Draw(brilho)
    dn = ImageDraw.Draw(nitido)

    # contorno do cérebro
    borda = ImageChops.subtract(m.filter(ImageFilter.MaxFilter(9)), m)
    contorno = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for x in range(S):
        c = cor_em(x)
        gd.line([(x, 0), (x, S)], fill=c + (255,))
    contorno.paste(grad, (0, 0), borda)

    for i, j in linhas:
        (x1, y1), (x2, y2) = pts[i], pts[j]
        c = cor_em((x1 + x2) / 2)
        db.line([(x1, y1), (x2, y2)], fill=c + (255,), width=10)
        dn.line([(x1, y1), (x2, y2)], fill=c + (230,), width=3)
    for x, y in pts:
        c = cor_em(x)
        r = rnd.choice([7, 8, 10, 12])
        db.ellipse([x - r * 2.2, y - r * 2.2, x + r * 2.2, y + r * 2.2], fill=c + (255,))
        dn.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,))
        dn.ellipse([x - r * 0.45, y - r * 0.45, x + r * 0.45, y + r * 0.45], fill=(255, 255, 255, 255))

    # anel de interface (HUD) ao redor
    anel = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    da = ImageDraw.Draw(anel)
    R = 432
    for k in range(0, 360, 6):
        ini = k
        fim = k + (4 if k % 30 else 2)
        c = cor_em(S / 2 + R * math.cos(math.radians(k)))
        da.arc([S / 2 - R, S / 2 - R, S / 2 + R, S / 2 + R], ini, fim, fill=c + (170,), width=4)
    R2 = 456
    for k in (20, 140, 260):
        c = cor_em(S / 2 + R2 * math.cos(math.radians(k + 30)))
        da.arc([S / 2 - R2, S / 2 - R2, S / 2 + R2, S / 2 + R2], k, k + 60, fill=c + (220,), width=6)

    camada = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    halo = brilho.filter(ImageFilter.GaussianBlur(26))
    camada = Image.alpha_composite(camada, halo)
    camada = Image.alpha_composite(camada, halo)
    camada = Image.alpha_composite(camada, brilho.filter(ImageFilter.GaussianBlur(8)))
    camada = Image.alpha_composite(camada, contorno.filter(ImageFilter.GaussianBlur(10)))
    camada = Image.alpha_composite(camada, contorno)
    camada = Image.alpha_composite(camada, anel.filter(ImageFilter.GaussianBlur(6)))
    camada = Image.alpha_composite(camada, anel)
    camada = Image.alpha_composite(camada, nitido)

    if transparente:
        return camada
    base = fundo(S, S).convert("RGBA")
    return Image.alpha_composite(base, camada).convert("RGB")


def main():
    pasta = sys.argv[1] if len(sys.argv) > 1 else "assets"
    os.makedirs(pasta, exist_ok=True)
    icone = desenhar_cerebro(transparente=False)
    icone.save(os.path.join(pasta, "icon.png"), optimize=True)
    cerebro = desenhar_cerebro(transparente=True)
    cerebro.save(os.path.join(pasta, "cerebro.png"), optimize=True)

    w, h = 1242, 2436
    splash = fundo(w, h).convert("RGBA")
    marca = cerebro.resize((820, 820), Image.LANCZOS)
    splash.alpha_composite(marca, ((w - 820) // 2, (h - 820) // 2 - 120))
    splash.convert("RGB").save(os.path.join(pasta, "splash.png"), optimize=True)
    print("Marca do NOA gerada em", pasta)


if __name__ == "__main__":
    main()
