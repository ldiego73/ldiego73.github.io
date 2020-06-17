import "./resume.scss"

import React from "react"
import { useTranslation } from "react-i18next"

import { ResumeSkills } from "./resume-skills"
import { ResumeTimeline } from "./resume-timeline"

const Resume = () => {
  const { t } = useTranslation([
    "translation",
    "educations",
    "experiences",
    "personal.skills",
    "technical.skills",
  ])

  const educations = t("educations:data", {
    returnObjects: true,
    defaultValue: [],
  })
  const experiences = t("experiences:data", {
    returnObjects: true,
    defaultValue: [],
  })
  const personalSkills = t("personal.skills:data", {
    returnObjects: true,
    defaultValue: [],
  })
  const technicalSkills = t("technical.skills:data", {
    returnObjects: true,
    defaultValue: [],
  })

  return (
    <section id="resume" className="resume">
      <div className="container">
        <h3 className="resume__title">{t("resume.title", "Resume")}</h3>
        <div className="resume__content">
          {experiences && (
            <ResumeTimeline
              title={t("resume.experience", "Experience")}
              icon="far fa-chart-bar"
              data={experiences}
            />
          )}
          {educations && (
            <ResumeTimeline
              title={t("resume.education", "Education")}
              icon="fas fa-graduation-cap"
              data={educations}
            />
          )}
        </div>
        <div className="resume__content">
          {technicalSkills && (
            <ResumeSkills
              title={t("resume.skills.technical", "Technical Skill")}
              icon="fas fa-layer-group"
              data={technicalSkills}
            />
          )}
          {personalSkills && (
            <ResumeSkills
              title={t("resume.skills.personal", "Personal Skill")}
              icon="fas fa-user"
              data={personalSkills}
            />
          )}
        </div>
      </div>
    </section>
  )
}

export { Resume }
