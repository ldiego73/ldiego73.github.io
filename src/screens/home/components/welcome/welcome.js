/* eslint-disable react/no-danger */

import "./welcome.scss"

import linksSocialNetworks from "@data/social_networks.json"
import { useHover } from "@hooks/use-hover"
import React from "react"
import { Trans, useTranslation } from "react-i18next"

function Welcome() {
  const { t } = useTranslation()
  const [hoverRef, isHovered] = useHover()

  const name = t("name")
  const position = t("position")

  return (
    <section className="welcome">
      <h1 className="welcome__hello">
        <Trans t={t} i18nKey="hello">
          Hello!, I'm {{ name }}
        </Trans>
        <span
          ref={hoverRef}
          data-testid="welcome-wave"
          className={`emoji wave-hand animated ${isHovered ? "wave" : ""}`}
        />
      </h1>
      <h2 className="welcome__bio">
        <Trans t={t} i18nKey="welcome">
          Hello!, I'm a <span className="name">{{ position }}</span> with
          extensive experience in digital transformation projects, enterprise
          architecture and application development.
        </Trans>
        &nbsp;
        <span className="emoji technologist" />
      </h2>
      <div className="welcome__social">
        <ul>
          {linksSocialNetworks.map(l => (
            <li key={l.name}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={l.name.toLowerCase()}
                aria-label={l.name}
              >
                <em className={l.icon} />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export { Welcome }
