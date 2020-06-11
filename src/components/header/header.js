import React from "react"
import PropTypes from "prop-types"
import { Link } from "gatsby"

import "./header.scss"

const Header = ({ siteTitle }) => (
  <header>
    <div className="header__inner">
      <Link to="/" aria-label="Home" className="header__logo">
        <span className="header__logo__mark">&gt;</span>
        <span className="header__logo__text">/home</span>
        <span className="header__logo__cursor"> </span>
      </Link>
      <div className="header__right">
        <span className="nav__separator"></span>
        <span className="nav__toggle unselectable">
          <svg
            className="nav__toggler"
            width="24"
            height="24"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M22 41C32.4934 41 41 32.4934 41 22C41 11.5066 32.4934 3 22
  3C11.5066 3 3 11.5066 3 22C3 32.4934 11.5066 41 22 41ZM7 22C7
  13.7157 13.7157 7 22 7V37C13.7157 37 7 30.2843 7 22Z"
            ></path>
          </svg>
        </span>
      </div>
    </div>
  </header>
)

Header.propTypes = {
  siteTitle: PropTypes.string,
}

Header.defaultProps = {
  siteTitle: ``,
}

export { Header }
