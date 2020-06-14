/* eslint-disable react/no-danger */

import "./welcome.scss"

import data from "@data/home.json"
import links from "@data/links.json"
import { useHover } from "@hooks/use-hover"
import React from "react"

const Welcome = () => {
  const [hoverRef, isHovered] = useHover()

  const bioHtml = data.bio.replace(
    "{POSITION}",
    `<span class="name">${data.position}</span>`
  )

  return (
    <section className="welcome">
      <h1 className="welcome__hello">
        Hello!, I'm {data.name}{" "}
        <span
          ref={hoverRef}
          data-testid="welcome-wave"
          className={`emoji wave-hand animated ${isHovered ? "wave" : ""}`}
        />
      </h1>
      <h2 className="welcome__bio">
        <span dangerouslySetInnerHTML={{ __html: bioHtml }} />
        &nbsp;
        <span className="emoji technologist" />
      </h2>
      <div className="welcome__social">
        <ul>
          {links.map(l => (
            <li key={l.name}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
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
