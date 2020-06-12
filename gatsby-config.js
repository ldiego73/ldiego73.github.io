require("dotenv").config({
  path: `.env`,
})

module.exports = {
  siteMetadata: {
    title: `Luis Diego`,
    description: `Personal Site using Github Pages with Gatsby`,
    author: `@ldiego73`,
    siteUrl: `https://ldiego73.github.io`,
  },
  plugins: [
    `gatsby-plugin-react-helmet`,
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `images`,
        path: `${__dirname}/src/images`,
      },
    },
    `gatsby-transformer-sharp`,
    `gatsby-plugin-sharp`,
    `gatsby-plugin-sass`,
    {
      resolve: `gatsby-plugin-preconnect`,
      options: {
        domains: [
          `https://fonts.gstatic.com`,
          `https://www.google.com`,
          `https://use.fontawesome.com`,
        ],
      },
    },
    {
      resolve: `gatsby-plugin-webfonts`,
      options: {
        fonts: {
          google: [
            {
              family: `Poppins`,
              variants: [`400`, `500`, `700`, `900`],
              fontDisplay: `swap`,
            },
          ],
        },
      },
    },
    {
      resolve: `gatsby-plugin-alias-imports`,
      options: {
        alias: {
          "@src": `src`,
          "@components": `src/components`,
          "@hooks": `src/hooks`,
          "@images": `src/images`,
          "@pages": `src/pages`,
          "@layouts": `src/layouts`,
          "@styles": `src/styles`,
        },
        extensions: [`js`],
      },
    },
    {
      resolve: `gatsby-plugin-sitemap`,
      options: {
        sitemapSize: 5000,
      },
    },
    `gatsby-plugin-robots-txt`,
    {
      resolve: `gatsby-plugin-manifest`,
      options: {
        name: `ldiego`,
        short_name: `starter`,
        start_url: `/`,
        background_color: `#252526`,
        theme_color: `#252526`,
        display: `minimal-ui`,
        icon: `src/images/ldiego-icon.png`, // This path is relative to the root of the site.
      },
    },
    // this (optional) plugin enables Progressive Web App + Offline functionality
    // To learn more, visit: https://gatsby.dev/offline
    `gatsby-plugin-offline`,
  ],
}
