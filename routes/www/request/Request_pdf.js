const Request_File = require( './Request_File.js' );
module.exports = class Request_pdf extends Request_File {

  type = 'pdf';

  async do() {

    // For PDFs we want PRINT media rules (many sites have dedicated print styles that prevent cropping)
    await this.page.emulateMediaType('print');

    await this.page.setViewport({
      width: 1280,
      height: 800, // любая
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

    // IMPORTANT:
    // Do NOT force width/height by default.
    // When you set both width and height, you are telling Chrome the paper size.
    // If the site already defines @page or relies on default A4/Letter, overriding can cause clipping.
    // Only use custom width/height when explicitly provided via query.

    // Clean up known garbage text that sometimes appears at the end of the DELA PDF preview.
    // (It shows up in the generated PDFs as repeated "word" and "mmMwWLliI0fiflO&1".)
    await this.page.evaluate(() => {
      const badToken = /mmMwWLliI0fiflO&1/g;
      const repeatedWord = /^(?:\s*word\s+){20,}/i;

      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const v = node.nodeValue || '';
        if (badToken.test(v) || repeatedWord.test(v.trim())) {
          node.nodeValue = '';
        }
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