import "./header.scss"

import { TranslationContext } from "@context/translation.context"
import { isBrowser } from "@utils/browser"
import { languages } from "@utils/i18n"
import { Link } from "gatsby"
import React, { useContext, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

const Header = () => {
  const { t } = useTranslation()
  const { language, updateLanguage } = useContext(TranslationContext)
  const [opened, setOpen] = useState(false)
  const links = t("header.links", { returnObjects: true, defaultValue: [] })

  const handleToogle = () => {
    setOpen(!opened)
  }

  const closeMenu = () => {
    setOpen(false)
  }

  /* istanbul ignore next */
  useEffect(() => {
    if (isBrowser()) {
      if (opened) {
        window.document.body.classList.add("no-scroll")
      } else {
        window.document.body.classList.remove("no-scroll")
      }
    }
  }, [opened])

  return (
    <header>
      <div className="header__inner">
        <Link
          to="/"
          aria-label="Home"
          className="header__logo"
          data-testid="header-home"
        >
          <span className="header__logo__mark">&gt;</span>
          <span className="header__logo__text">
            {t("header.home", "/home")}
          </span>
          <span className="header__logo__cursor"> </span>
        </Link>
        <div className="header__right">
          {links &&
            links.map((l, i) => (
              <a
                key={`header-link-${i}`}
                href={l.to}
                className="header__link"
                arial-label={l.title}
                data-testid={l.title.toLowerCase()}
              >
                {l.title}
              </a>
            ))}
          <span className="header__separator" />
          {languages.map((lng, i) => (
            <button
              key={`language-${i}`}
              type="button"
              className={`header__language ${language === lng ? "active" : ""}`}
              onClick={() => updateLanguage(lng)}
              data-testid={`header-language-${lng}`}
            >
              {lng}
            </button>
          ))}
          <button
            type="button"
            className={opened ? "header__menu is-active" : "header__menu"}
            aria-label="menu"
            onClick={handleToogle}
            data-testid="header-menu"
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className={opened ? "header__mobile open" : "header__mobile"}>
        {links &&
          links.map((l, i) => (
            <a
              key={`header-link-${i}`}
              href={l.to}
              className="header__link mobile"
              arial-label={l.title}
              onClick={closeMenu}
            >
              {l.title}
            </a>
          ))}
      </div>
    </header>
  )
}

export { Header }
