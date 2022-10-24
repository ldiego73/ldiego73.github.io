import "@styles/theme.scss"

import { Footer } from "@components/footer"
import { Header } from "@components/header"
import { TopButton } from "@components/top-button"
import { TranslationProvider } from "@context/translation.provider"
import PropTypes from "prop-types"
import React from "react"

function Layout({ children }) {
  return (
    <TranslationProvider>
      <Header />
      <main>{children}</main>
      <Footer />
      <TopButton />
    </TranslationProvider>
  )
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export { Layout }
