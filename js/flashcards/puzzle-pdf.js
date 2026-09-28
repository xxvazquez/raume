// Flashcards -- Puzzles as a PDF (RaumeStudy.flashcards.puzzlePdf).
//
// "Save as PDF" in the Puzzles ⋯ menu: the worksheet drawn onto A4 pages
// here, square by square, rather than left to each browser's print engine
// (which laid the grid out differently on a phone). Every page is painted
// on a canvas at ~200 dpi with the page's own fonts -- so kana and kanji
// render exactly as on screen, no font embedding -- then packed as a JPEG
// per page into a minimal hand-written PDF. The last page is the answer key,
// so a saved sheet is complete on its own.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.puzzlePdf = (function () {
  "use strict";

  var MM = 8;                        // canvas px per mm (≈ 203 dpi)
  var MARGIN = 14 * MM;
  // A4, portrait or landscape -- chosen per puzzle in render(), whichever
  // gives the grid bigger squares.
  var PAGE_W, PAGE_H, CONTENT_W, BOTTOM;
  function setOrientation(landscape) {
    PAGE_W = (landscape ? 297 : 210) * MM; PAGE_H = (landscape ? 210 : 297) * MM;
    CONTENT_W = PAGE_W - 2 * MARGIN; BOTTOM = PAGE_H - MARGIN;
  }
  setOrientation(false);
  // Largest square per style: an arroword square holds its clue, so it gets
  // the most room.
  var MAX_CELL = { crossword: 10, arroword: 13, wordsearch: 12 };
  var INK = "#16181d", MUTED = "#6b7280", FAINT = "#9aa1ab", LINE = "#8f96a0", CLUE_FILL = "#eef0f3";
  function pt(n) { return n * 0.3528 * MM; } // points -> canvas px

  function fontFamily() {
    try { return getComputedStyle(document.body).fontFamily || "sans-serif"; } catch (e) { return "sans-serif"; }
  }
  var FAMILY = "sans-serif";
  function font(ctx, weight, sizePt) { ctx.font = weight + " " + pt(sizePt) + "px " + FAMILY; }

  function newPage(pages) {
    var canvas = document.createElement("canvas");
    canvas.width = PAGE_W; canvas.height = PAGE_H;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.textBaseline = "alphabetic";
    var page = { canvas: canvas, ctx: ctx, y: MARGIN };
    pages.push(page);
    return page;
  }

  function header(page, title, meta) {
    var ctx = page.ctx;
    font(ctx, "700", 20);
    ctx.fillStyle = INK;
    ctx.fillText(title, MARGIN, page.y + pt(20) * 0.8);
    page.y += pt(20) * 1.1;
    if (meta) {
      font(ctx, "400", 9.5);
      ctx.fillStyle = MUTED;
      ctx.fillText(meta, MARGIN, page.y + pt(9.5) * 1.2);
      page.y += pt(9.5) * 1.6;
    }
    page.y += 7 * MM;
  }

  // Words wrapped to `width`, at most `maxLines` (the last one ellipsised).
  function wrap(ctx, text, width, maxLines) {
    var words = String(text).split(/\s+/), lines = [], line = "";
    words.forEach(function (w) {
      var next = line ? line + " " + w : w;
      if (ctx.measureText(next).width <= width || !line) line = next;
      else { lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    // A single word wider than the box is broken by characters.
    lines = [].concat.apply([], lines.map(function (l) {
      if (ctx.measureText(l).width <= width) return [l];
      var out = [], cur = "";
      Array.from(l).forEach(function (ch) {
        if (ctx.measureText(cur + ch).width > width && cur) { out.push(cur); cur = ch; } else cur += ch;
      });
      if (cur) out.push(cur);
      return out;
    }));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (last && ctx.measureText(last + "…").width > width) last = last.slice(0, -1);
      lines[maxLines - 1] = last + "…";
    }
    return lines;
  }

  // An arroword clue square: the arrow on top, then the clue at the largest
  // size (5.5pt down to 3.6pt) that fits the square in at most three lines.
  function clueSquare(ctx, x, y, s, cc) {
    ctx.fillStyle = CLUE_FILL;
    ctx.fillRect(x, y, s, s);
    var pad = s * 0.08, arrowH = s * 0.22, w = s - 2 * pad;
    ctx.fillStyle = MUTED;
    font(ctx, "600", Math.max(4, s / MM * 0.9));
    ctx.textAlign = "center";
    ctx.fillText(cc.dir === "down" ? "↓" : "→", x + s / 2, y + pad + arrowH * 0.8);
    var size = 5.5, lines;
    var words = String(cc.clue).split(/\s+/);
    for (; size >= 3.6; size -= 0.3) {
      font(ctx, "400", size);
      // Shrink before ever breaking inside a word ("daytim / e").
      if (words.some(function (wd) { return ctx.measureText(wd).width > w; })) continue;
      lines = wrap(ctx, cc.clue, w, 99);
      if (lines.length * pt(size) * 1.15 <= s - arrowH - 2 * pad && lines.length <= 3) break;
    }
    if (size < 3.6) { size = 3.6; font(ctx, "400", size); lines = wrap(ctx, cc.clue, w, 3); }
    ctx.fillStyle = INK;
    var lh = pt(size) * 1.15, top = y + pad + arrowH + (s - arrowH - 2 * pad - lines.length * lh) / 2;
    lines.forEach(function (l, i) { ctx.fillText(l, x + s / 2, top + lh * (i + 0.8)); });
    ctx.textAlign = "left";
  }

  // The crossword / arroword grid, `withAnswers` for the key. Squares share
  // one hairline (every edge drawn once), so the grid can't drift apart.
  function drawGrid(page, p, arroword, withAnswers, maxH) {
    var ctx = page.ctx;
    var s = Math.min(MAX_CELL[arroword ? "arroword" : "crossword"] * MM, CONTENT_W / p.cols, maxH / p.rows);
    var x0 = MARGIN + (CONTENT_W - s * p.cols) / 2, y0 = page.y;
    for (var r = 0; r < p.rows; r++) {
      for (var c = 0; c < p.cols; c++) {
        var k = r + "," + c, x = x0 + c * s, y = y0 + r * s;
        if (p.grid[k] !== undefined) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(x, y, s, s);
          if (!arroword && p.numbers[k]) {
            font(ctx, "400", Math.min(6, s / MM * 0.7));
            ctx.fillStyle = MUTED;
            ctx.fillText(String(p.numbers[k]), x + s * 0.07, y + pt(Math.min(6, s / MM * 0.7)) * 1.05);
          }
          if (withAnswers) {
            font(ctx, "400", Math.min(13, s / MM * 1.35));
            ctx.fillStyle = INK;
            ctx.textAlign = "center";
            ctx.fillText(p.grid[k], x + s / 2, y + s * 0.68);
            ctx.textAlign = "left";
          }
        } else if (p.clueCells[k]) {
          clueSquare(ctx, x, y, s, p.clueCells[k]);
        } else continue;
        ctx.strokeStyle = LINE;
        ctx.lineWidth = Math.max(1.5, 0.25 * MM);
        ctx.strokeRect(x, y, s, s);
      }
    }
    page.y = y0 + s * p.rows + 9 * MM;
  }

  // Clue lists as columns that flow onto new pages: `groups` is
  // [{ title, items: [{ num, text }] }], laid side by side.
  function drawColumns(pages, page, groups) {
    var gap = 10 * MM, colW = (CONTENT_W - gap * (groups.length - 1)) / groups.length;
    var ctx = page.ctx, headH = pt(9) * 2.2, rowGap = 1.1 * MM;
    var cols = groups.map(function (g, i) { return { g: g, x: MARGIN + i * (colW + gap), y: page.y, page: page, i: 0 }; });
    function head(col) {
      var c2 = col.page.ctx;
      font(c2, "600", 9);
      c2.fillStyle = INK;
      c2.fillText(col.g.title, col.x, col.y + pt(9));
      c2.fillStyle = "#c4c9d0";
      c2.fillRect(col.x, col.y + pt(9) * 1.55, colW, Math.max(1, 0.18 * MM));
      col.y += headH;
    }
    cols.forEach(head);
    var numW = 7 * MM;
    cols.forEach(function (col) {
      col.g.items.forEach(function (it) {
        var c2 = col.page.ctx;
        font(c2, "400", 9.5);
        var lines = wrap(c2, it.text, colW - numW, 4), lh = pt(9.5) * 1.3, h = lines.length * lh + rowGap;
        if (col.y + h > BOTTOM) {
          // Next page: reuse one another column already opened, else a new one.
          var at = pages.indexOf(col.page) + 1;
          col.page = pages[at] || newPage(pages);
          col.y = MARGIN;
          c2 = col.page.ctx;
          font(c2, "400", 9.5);
        }
        if (it.num != null) {
          c2.fillStyle = FAINT;
          c2.textAlign = "right";
          c2.fillText(String(it.num), col.x + numW - 2.5 * MM, col.y + lh * 0.8);
          c2.textAlign = "left";
        }
        c2.fillStyle = INK;
        lines.forEach(function (l, j) { c2.fillText(l, col.x + (it.num != null ? numW : 0), col.y + lh * (j + 0.8)); });
        col.y += h;
      });
    });
    return cols.reduce(function (last, col) { return pages.indexOf(col.page) > pages.indexOf(last) ? col.page : last; }, page);
  }

  // Word search letters (no lines), `found` capsules drawn under them for
  // the key.
  function drawWordSearch(page, p, withAnswers, maxH) {
    var ctx = page.ctx;
    var s = Math.min(MAX_CELL.wordsearch * MM, CONTENT_W / p.cols, maxH / p.rows);
    var x0 = MARGIN + (CONTENT_W - s * p.cols) / 2, y0 = page.y;
    if (withAnswers) {
      ctx.strokeStyle = "rgba(95, 129, 117, .28)";
      ctx.lineCap = "round";
      ctx.lineWidth = s * 0.74;
      p.placements.forEach(function (pl) {
        var n = pl.length - 1;
        ctx.beginPath();
        ctx.moveTo(x0 + (pl.col + 0.5) * s, y0 + (pl.row + 0.5) * s);
        ctx.lineTo(x0 + (pl.col + pl.dc * n + 0.5) * s, y0 + (pl.row + pl.dr * n + 0.5) * s);
        ctx.stroke();
      });
    }
    font(ctx, "400", Math.min(16, s / MM * 1.45));
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    for (var r = 0; r < p.rows; r++) {
      for (var c = 0; c < p.cols; c++) ctx.fillText(p.letters[r][c], x0 + (c + 0.5) * s, y0 + r * s + s * 0.68);
    }
    ctx.textAlign = "left";
    page.y = y0 + s * p.rows + 9 * MM;
  }

  // One list as two side-by-side columns (the second without its own title).
  function halves(title, items) {
    var mid = Math.ceil(items.length / 2);
    return [{ title: title, items: items.slice(0, mid) }, { title: "", items: items.slice(mid) }];
  }
  function clueGroups(p) {
    function list(dir) {
      return p.placements.filter(function (pl) { return pl.dir === dir; })
        .sort(function (a, b) { return a.number - b.number; })
        .map(function (pl) { return { num: pl.number, text: pl.clue }; });
    }
    return [{ title: "Across", items: list("across") }, { title: "Down", items: list("down") }]
      .filter(function (g) { return g.items.length; });
  }

  // opts: { mode: "crossword" | "arroword" | "wordsearch", puzzle, title,
  //         meta, wsAnswers: [text per placement] }
  // Room the grid gets below the header, and how much it leaves for a clue
  // list: none for an arroword (its clues are in the grid).
  var HEADER_H = 20 * MM;
  function reserve(mode) { return mode === "arroword" ? 0 : mode === "wordsearch" ? 60 * MM : 40 * MM; }
  function squareFor(mode, p, landscape) {
    setOrientation(landscape);
    return Math.min(MAX_CELL[mode] * MM, CONTENT_W / p.cols, (BOTTOM - MARGIN - HEADER_H - reserve(mode)) / p.rows);
  }
  function render(opts) {
    FAMILY = fontFamily();
    var p = opts.puzzle, pages = [];
    // Landscape only when it really buys bigger squares (a wide grid).
    var portrait = squareFor(opts.mode, p, false), landscape = squareFor(opts.mode, p, true);
    setOrientation(landscape > portrait * 1.08);
    var page = newPage(pages);
    header(page, opts.title, opts.meta);
    if (opts.mode === "wordsearch") {
      drawWordSearch(page, p, false, BOTTOM - page.y - reserve("wordsearch"));
      page = drawColumns(pages, page, halves("Find the Japanese for",
        p.placements.map(function (pl) { return { num: null, text: pl.clue }; })));
    } else {
      var arroword = opts.mode === "arroword";
      drawGrid(page, p, arroword, false, BOTTOM - page.y - reserve(opts.mode));
      if (!arroword) page = drawColumns(pages, page, clueGroups(p));
    }
    // The answer key, on a page of its own.
    var key = newPage(pages);
    header(key, "Answers", opts.title + (opts.meta ? " · " + opts.meta : ""));
    if (opts.mode === "wordsearch") {
      drawWordSearch(key, p, true, BOTTOM - key.y - reserve("wordsearch"));
      drawColumns(pages, key, halves("Words",
        p.placements.map(function (pl, i) { return { num: null, text: pl.clue + " — " + (opts.wsAnswers ? opts.wsAnswers[i] : pl.answer) }; })));
    } else {
      drawGrid(key, p, opts.mode === "arroword", true, BOTTOM - key.y);
    }
    return pages.map(function (pg) { return pg.canvas; });
  }

  // --- A minimal PDF: one JPEG image per A4 page ------------------------
  function canvasJpeg(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error("canvas export failed")); return; }
        blob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, reject);
      }, "image/jpeg", 0.9);
    });
  }
  function pdfFromJpegs(images) {
    var enc = new TextEncoder(), parts = [], offsets = [], size = 0;
    function add(x) { var b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); size += b.length; }
    function obj(n, body) { offsets[n] = size; add(n + " 0 obj\n"); body(); add("\nendobj\n"); }
    var n = images.length;
    add("%PDF-1.4\n%âãÏÓ\n");
    obj(1, function () { add("<< /Type /Catalog /Pages 2 0 R >>"); });
    var kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3) + " 0 R");
    obj(2, function () { add("<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>"); });
    images.forEach(function (img, i) {
      var pageN = 3 + i * 3, imgN = pageN + 1, contN = pageN + 2;
      var W = img.width > img.height ? 841.89 : 595.28, H = img.width > img.height ? 595.28 : 841.89;
      obj(pageN, function () {
        add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /XObject << /Im0 " + imgN + " 0 R >> >> /Contents " + contN + " 0 R >>");
      });
      obj(imgN, function () {
        add("<< /Type /XObject /Subtype /Image /Width " + img.width + " /Height " + img.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + img.bytes.length + " >>\nstream\n");
        add(img.bytes);
        add("\nendstream");
      });
      var content = "q " + W + " 0 0 " + H + " 0 0 cm /Im0 Do Q";
      obj(contN, function () { add("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream"); });
    });
    var total = 3 + n * 3, xref = size;
    var table = "xref\n0 " + total + "\n0000000000 65535 f \n";
    for (var k = 1; k < total; k++) table += String(offsets[k]).padStart(10, "0") + " 00000 n \n";
    add(table + "trailer\n<< /Size " + total + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    return new Blob(parts, { type: "application/pdf" });
  }

  function build(opts) {
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return ready.then(function () {
      return Promise.all(render(opts).map(function (c) {
        return canvasJpeg(c).then(function (bytes) { return { bytes: bytes, width: c.width, height: c.height }; });
      }));
    }).then(pdfFromJpegs);
  }

  function save(opts, fileName) {
    return build(opts).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return blob;
    });
  }

  return { build: build, save: save, render: render, pdfFromJpegs: pdfFromJpegs };
})();
