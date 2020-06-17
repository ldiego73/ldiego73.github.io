import "./footer.scss"

import linksSocialNetworks from "@data/social_networks.json"
import React from "react"
import { useTranslation } from "react-i18next"

const Footer = () => {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  return (
    <footer>
      <div className="container">
        <div className="footer__copyright">
          {t("footer.title", {
            defaultValue: `Copyright ©${year} All rights reserved`,
            year,
          })}
        </div>
        <div className="footer__links">
          <ul>
            {linksSocialNetworks.map(l => (
              <li key={l.name}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={l.name}
                  data-testid={`footer-${l.name.toLowerCase()}`}
                >
                  <em className={l.icon} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}

export { Footer }
