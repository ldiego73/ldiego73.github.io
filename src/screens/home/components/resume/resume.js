import "./resume.scss"

import educations from "@data/educations.json"
import experiences from "@data/experiences.json"
import React from "react"

const technicalSkills = [
  {
    skill: "Microservices",
    percentage: "90%",
  },
  {
    skill: "Serverless",
    percentage: "90%",
  },
  {
    skill: "DevOps",
    percentage: "70%",
  },
  {
    skill: "Web development",
    percentage: "85%",
  },
  {
    skill: "Mobile Applications",
    percentage: "70%",
  },
]

const personalSkills = [
  {
    skill: "TEAM WORK",
    percentage: "90%",
  },
  {
    skill: "COMMUNICATION",
    percentage: "70%",
  },
  {
    skill: "CREATIVE",
    percentage: "80%",
  },
  {
    skill: "ORGANISATION",
    percentage: "75%",
  },
  {
    skill: "ENGLISH",
    percentage: "30%",
  },
]

const Resume = () => (
  <section id="resume" className="resume">
    <div className="container">
      <h3 className="resume__title">Resume</h3>
      <div className="resume__content">
        <div className="resume__experience">
          <h4 className="resume__subtitle">
            <em className="far fa-chart-bar" />
            EXPERIENCE
          </h4>
          <ul className="timeline">
            {experiences.map((e, i) => (
              <li key={`experience-${i}`}>
                <div className="timeline__item">
                  <span className="timeline__date">{e.year}</span>
                  <span className="timeline__position">{e.position}</span>
                  <span className="timeline__company">{e.company}</span>
                  <ul className="timeline__experience">
                    {e.descriptions.map((d, j) => (
                      <li key={`experience-description-${j}`}>{d}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="resume__education">
          <h4 className="resume__subtitle">
            <em className="fas fa-graduation-cap" />
            EDUCATION
          </h4>
          <ul className="timeline">
            {educations.map((e, i) => (
              <li key={`education-${i}`}>
                <div className="timeline__item">
                  <span className="timeline__date">{e.year}</span>
                  <span className="timeline__position">{e.position}</span>
                  <span className="timeline__company">{e.institute}</span>
                  <ul className="timeline__experience">
                    {e.descriptions.map((d, j) => (
                      <li key={`education-description-${j}`}>{d}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="resume__content">
        <div className="resume__skills">
          <h4 className="resume__subtitle">
            <em className="fas fa-layer-group" />
            TECHNICAL SKILLS
          </h4>
          <div className="skills">
            {technicalSkills.map((t, i) => (
              <div key={`technical-skill-${i}`} className="skills__bar">
                <div className="skills__name">{t.skill}</div>
                <div className="skills__bar-outer">
                  <div
                    className="skills__bar-bubble"
                    style={{ left: `calc(${t.percentage} - 1.5em)` }}
                  >
                    {t.percentage}
                  </div>
                  <div
                    className="skills__bar-inner"
                    style={{ width: t.percentage }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="resume__skills">
          <h4 className="resume__subtitle">
            <em className="fas fa-user" />
            PERSONAL SKILLS
          </h4>
          <div className="skills">
            {personalSkills.map((t, i) => (
              <div key={`personal-skill-${i}`} className="skills__bar">
                <div className="skills__name">{t.skill}</div>
                <div className="skills__bar-outer">
                  <div
                    className="skills__bar-bubble"
                    style={{ left: `calc(${t.percentage} - 1.5em)` }}
                  >
                    {t.percentage}
                  </div>
                  <div
                    className="skills__bar-inner"
                    style={{ width: t.percentage }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
)

export { Resume }
