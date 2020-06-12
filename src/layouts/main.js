import React from "react"
import PropTypes from "prop-types"

import { Header } from "@components/header"
import { TopButton } from "@components/top-button"
import "@styles/theme.scss"

const Layout = ({ children }) => {
  return (
    <>
      <Header />
      <main>{children}</main>
      <TopButton />
    </>
  )
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export { Layout }
