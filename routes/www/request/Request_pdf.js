const Request_File = require( './Request_File.js' );
module.exports = class Request_pdf extends Request_File {

  type = 'pdf';

  async do() {

  // Render with screen media so the layout matches the viewport (responsive width)
  await this.page.emulateMediaType('screen');

  // Build PDF options from query
  let pdfOptions = this._getPDFArguments(this.req.query.pdf);

  // Sensible defaults (do not override explicit query params)
  pdfOptions.printBackground = (typeof pdfOptions.printBackground === 'undefined') ? true : pdfOptions.printBackground;
  pdfOptions.preferCSSPageSize = (typeof pdfOptions.preferCSSPageSize === 'undefined') ? false : pdfOptions.preferCSSPageSize;
  pdfOptions.margin = (typeof pdfOptions.margin === 'undefined')
    ? { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    : pdfOptions.margin;

  // Ensure we do NOT accidentally force a single gigantic page height (which can get clipped).
  // If neither `format` nor a complete `width`+`height` are provided, we create a multi-page PDF
  // by setting the paper size to match the current viewport.
  const vp = this.page.viewport();

  // If caller did not request a specific paper format, use viewport-based paper size.
  if (!pdfOptions.format) {
    // Match the requested viewport width (e.g. 1280). Do not use document scrollWidth.
    if (!pdfOptions.width) {
      const w = (vp && vp.width) ? vp.width : 1280;
      pdfOptions.width = `${w}px`;
    }

    // IMPORTANT: If height is not specified, Chrome will use a default paper height (often leading to bottom clipping)
    // when combined with a custom width. Force a reasonable page height to allow pagination.
    if (!pdfOptions.height) {
      const h = (vp && vp.height) ? vp.height : 800;
      pdfOptions.height = `${h}px`;
    }
  }

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