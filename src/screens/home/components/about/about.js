/* eslint-disable react/no-danger */

import "./about.scss"

import React from "react"
import { Trans, useTranslation } from "react-i18next"

import profile from "../../../../images/profile.jpeg"

const About = () => {
  const { t } = useTranslation()

  return (
    <section id="about" className="about">
      <div className="container">
        <div className="about__profile">
          <img src={profile} alt="Luis Diego" />
        </div>
        <div className="about__details">
          <h3>{t("about.title", "About me")}</h3>
          <p>
            <Trans t={t} i18nKey="about.me">
              I'm an engineer passionate about technologies, the development of
              fantastic applications whether they are websites, mobile
              applications or anything else. <br /> My goal is to always build
              applications that are scalable, secure, and reliable, offering an
              excellent user experience. <br /> In my free time I like to travel
              and get to know new places, cultures and people. Backpacker at
              heart, good music and adventure.
            </Trans>
          </p>
          <a
            href={t("about.cv")}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Resume"
            className="button"
            data-testid="resume-download"
          >
            {t("about.download", "Download CV")}
          </a>
        </div>
      </div>
    </section>
  )
}

export { About }
