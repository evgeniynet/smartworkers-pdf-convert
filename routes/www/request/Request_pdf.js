const Request_File = require( './Request_File.js' );
module.exports = class Request_pdf extends Request_File {

  type = 'pdf';

  async do() {

    // For PDFs we want PRINT media rules (many sites have dedicated print styles that prevent cropping)
      // Media emulation: default to 'screen' because some templates have broken/overwide print CSS.
  // Allow override via query: pdf[media]=print
  const requestedMedia = (this.req.query.pdf && this.req.query.pdf.media) ? String(this.req.query.pdf.media).toLowerCase() : 'screen';
  await this.page.emulateMediaType(requestedMedia === 'print' ? 'print' : 'screen');
  
    await this.page.setViewport({
      width: 800,
      height: 1280, // любая
      deviceScaleFactor: 1,
    });

    // Build PDF options from query
    let pdfOptions = this._getPDFArguments(this.req.query.pdf);

    // Defaults (do not override explicit query params)
    pdfOptions.printBackground = (typeof pdfOptions.printBackground === 'undefined') ? true : pdfOptions.printBackground;

    // Prefer CSS @page size if the site provides it (avoids many "cropped PDF" cases)
    pdfOptions.preferCSSPageSize = (typeof pdfOptions.preferCSSPageSize === 'undefined') ? true : pdfOptions.preferCSSPageSize;

    // If caller enables header/footer, give Chrome some breathing room.
    // Otherwise 0 margins are fine.
    if (pdfOptions.displayHeaderFooter) {
      pdfOptions.margin = (typeof pdfOptions.margin === 'undefined')
        ? { top: '12mm', right: '0mm', bottom: '12mm', left: '0mm' }
        : pdfOptions.margin;
    } else {
      pdfOptions.margin = (typeof pdfOptions.margin === 'undefined')
        ? { top: '0px', right: '0px', bottom: '0px', left: '0px' }
        : pdfOptions.margin;
    }

    const dims = await this.page.evaluate(() => ({
  innerWidth: window.innerWidth,
  outerWidth: window.outerWidth,
  screenWidth: window.screen.width,
  dpr: window.devicePixelRatio,
  docScrollWidth: document.documentElement.scrollWidth,
}));
this.req.logger.debug('Viewport/screen diagnostics', dims);

    // IMPORTANT:
    // Do NOT force width/height by default.
    // When you set both width and height, you are telling Chrome the paper size.
    // If the site already defines @page or relies on default A4/Letter, overriding can cause clipping.
    // Only use custom width/height when explicitly provided via query.

    // Clean up known garbage text that sometimes appears at the end of the DELA PDF preview.
    // (It shows up in the generated PDFs as repeated "word" and "mmMwWLliI0fiflO&1".)
      // Clean up known garbage text that sometimes appears in the DELA PDF preview.
  // It may show up as plain text nodes, inside form values, or duplicated in HTML.
  await this.page.evaluate(() => {
    const TOKEN = 'mmMwWLliI0fiflO&1';
    const tokenRe = new RegExp(TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const repeatedWord = /^(?:\s*word\s+){10,}/i;

    const root = document.body || document.documentElement;
    if (!root) return;

    // 1) Fast path: strip from body HTML (covers many cases where it is embedded in markup)
    try {
      if (root.innerHTML && root.innerHTML.includes(TOKEN)) {
        root.innerHTML = root.innerHTML.replace(tokenRe, '');
      }
    } catch (e) {
      // ignore
    }

    // 2) Walk text nodes (covers cases where it is plain text)
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const v = node.nodeValue || '';
        const trimmed = v.trim();
        if (!v) continue;
        if (v.includes(TOKEN)) {
          node.nodeValue = v.replace(tokenRe, '');
          continue;
        }
        if (repeatedWord.test(trimmed)) {
          node.nodeValue = '';
        }
      }
    } catch (e) {
      // ignore
    }

    // 3) Strip from common value-bearing attributes (inputs/textareas)
    try {
      const valueNodes = root.querySelectorAll('input, textarea');
      valueNodes.forEach(el => {
        if (typeof el.value === 'string' && el.value.includes(TOKEN)) {
          el.value = el.value.replace(tokenRe, '');
        }
        if (typeof el.defaultValue === 'string' && el.defaultValue.includes(TOKEN)) {
          el.defaultValue = el.defaultValue.replace(tokenRe, '');
        }
      });
    } catch (e) {
      // ignore
    }

    // 4) Strip from some attributes where it sometimes leaks
    try {
      const all = root.querySelectorAll('*');
      all.forEach(el => {
        for (const attr of Array.from(el.attributes || [])) {
          if (typeof attr.value === 'string' && attr.value.includes(TOKEN)) {
            el.setAttribute(attr.name, attr.value.replace(tokenRe, ''));
          }
        }
      });
    } catch (e) {
      // ignore
    }
  });

    // Never set `path` when returning the buffer
    delete pdfOptions.path;

    this.req.logger.debug('pdf options:', pdfOptions);

    this.res.setHeader('Content-Disposition', 'filename="' + this.hostName + '.pdf"');
    this.res.writeHead(200, { 'Content-Type': 'application/pdf' });
    this.res.end(await this.page.pdf(pdfOptions), 'binary');

  }

    _getPDFArguments( queryPDF ) {
      if ( ! queryPDF ) {
        return {};
      }
      delete queryPDF.path;
      if ( queryPDF.scale ) {
        queryPDF.scale = parseFloat( queryPDF.scale );
      }
      if ( queryPDF.displayHeaderFooter ) {
        queryPDF.displayHeaderFooter = Boolean( queryPDF.displayHeaderFooter );
      }
      if ( queryPDF.printBackground ) {
        queryPDF.printBackground = Boolean( queryPDF.printBackground );
      }
      if ( queryPDF.landscape ) {
        queryPDF.landscape = Boolean( queryPDF.landscape );
      }
      if ( queryPDF.preferCSSPageSize ) {
        queryPDF.preferCSSPageSize = Boolean( queryPDF.preferCSSPageSize );
      }
      return queryPDF;
    }

}