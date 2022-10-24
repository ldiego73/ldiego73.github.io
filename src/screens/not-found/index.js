import { SEO } from "@components/seo"
import { Layout } from "@layouts/main"
import React from "react"
import { useTranslation } from "react-i18next"

import notFound from "../../images/not-found.svg"

function NotFound() {
  const { t } = useTranslation()
  const title = t("not-found.siteTitle", "Not found")

  return (
    <Layout>
      <SEO title={title} />
      <section className="not-found">
        <img src={notFound} alt={title} />
        <h1>{t("not-found.title", "This page doesn't exists")}</h1>
        <p>
          {t(
            "not-found.message",
            `Sorry, the page was not found.
            You could have mistyped the URL, or the page has moved.`
          )}
        </p>
      </section>
    </Layout>
  )
}

export { NotFound }
