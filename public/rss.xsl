<?xml version="1.0" encoding="utf-8"?>
<!-- Styled view of the RSS feed: shown when the feed is opened in a browser. Readers ignore it. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" encoding="utf-8" indent="yes" />
  <xsl:variable name="es" select="/rss/channel/language = 'es'" />
  <xsl:template match="/">
    <html>
      <xsl:attribute name="lang"><xsl:value-of select="/rss/channel/language" /></xsl:attribute>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title><xsl:value-of select="/rss/channel/title" /> · RSS</title>
        <style>
          :root { color-scheme: dark light; --bg:#13151b; --fg:#ece8e0; --muted:#a19e95; --line:#2c303b; --ochre:#dda63c; --red:#d0444b; }
          @media (prefers-color-scheme: light) { :root { --bg:#eef0f3; --fg:#16181e; --muted:#555a64; --line:#d3d8df; --ochre:#9a6a0c; --red:#b0262e; } }
          * { box-sizing: border-box; }
          body { margin: 0; background: var(--bg); color: var(--fg); font: 400 17px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
          main { max-width: 760px; margin: 0 auto; padding: 48px 16px 64px; }
          .note { border: 1px solid var(--line); border-left: 4px solid var(--ochre); border-radius: 8px; padding: 16px 18px; margin-bottom: 32px; }
          .note strong { display: block; margin-bottom: 4px; }
          .note p { margin: 0; color: var(--muted); }
          code { background: color-mix(in srgb, var(--fg) 8%, transparent); padding: 2px 6px; border-radius: 4px; word-break: break-all; }
          h1 { font-size: 40px; line-height: 1; margin: 0 0 8px; text-transform: uppercase; letter-spacing: -0.01em; }
          .lede { color: var(--muted); margin: 0 0 32px; }
          ol { list-style: none; padding: 0; margin: 0; }
          li { padding: 18px 0; border-top: 1px solid var(--line); }
          li a { color: var(--fg); font-weight: 700; font-size: 20px; text-decoration: none; }
          li a:hover { color: var(--red); }
          time { display: block; font: 500 13px ui-monospace, monospace; color: var(--muted); margin-bottom: 4px; }
          li p { margin: 6px 0 0; color: var(--muted); }
          .back { display: inline-block; margin-top: 32px; color: var(--ochre); }
        </style>
      </head>
      <body>
        <main>
          <div class="note">
            <xsl:choose>
              <xsl:when test="$es">
                <strong>Esto es un feed RSS.</strong>
                <p>Copia la dirección de esta página en tu lector (Feedly, Inoreader, NetNewsWire…) para recibir los posts nuevos: <code><xsl:value-of select="/rss/channel/link" />es/rss.xml</code></p>
              </xsl:when>
              <xsl:otherwise>
                <strong>This is an RSS feed.</strong>
                <p>Paste this page's address into your reader (Feedly, Inoreader, NetNewsWire…) to get new posts: <code><xsl:value-of select="/rss/channel/link" />en/rss.xml</code></p>
              </xsl:otherwise>
            </xsl:choose>
          </div>
          <h1><xsl:value-of select="/rss/channel/title" /></h1>
          <p class="lede"><xsl:value-of select="/rss/channel/description" /></p>
          <ol>
            <xsl:for-each select="/rss/channel/item">
              <li>
                <time><xsl:value-of select="substring(pubDate, 6, 11)" /></time>
                <a><xsl:attribute name="href"><xsl:value-of select="link" /></xsl:attribute><xsl:value-of select="title" /></a>
                <p><xsl:value-of select="description" /></p>
              </li>
            </xsl:for-each>
          </ol>
          <a class="back">
            <xsl:attribute name="href"><xsl:value-of select="/rss/channel/link" /><xsl:choose><xsl:when test="$es">es/blog/</xsl:when><xsl:otherwise>en/blog/</xsl:otherwise></xsl:choose></xsl:attribute>
            <xsl:choose><xsl:when test="$es">← Volver al blog</xsl:when><xsl:otherwise>← Back to the blog</xsl:otherwise></xsl:choose>
          </a>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
