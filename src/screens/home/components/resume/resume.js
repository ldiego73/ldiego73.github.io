import React from "react"

import "./resume.scss"

const experiences = [
  {
    year: 2016,
    position: "Solutions Architect",
    company: "Belcorp, Lima",
    descriptions: [
      "Implementation of the first DevOps platform for mobile applications.",
      "Standards documentation of the main technologies .Net, Java, Kotlin, JavaScript, etc.",
      "Using clean architecture for mobile application development.",
      "Implementation of microservices architecture, vision and apis platform.",
    ],
  },
  {
    year: 2016,
    position: "Associate Consultant",
    company: "Hundred, Lima",
    descriptions: [
      `50% reduction in time in the synchronization process for the App "Gestiona tu Negocio".`,
      "Implementation of an optional and/or mandatory update model for mobile applications.",
      "First implementation of the modular pattern in Belcorp apps.",
    ],
  },
  {
    year: 2014,
    position: "Technical Leader Mobile",
    company: "Avances Tecnológicos",
    descriptions: [
      "Implementation of Architecture for Yanbal applications for Consultants (Orders, Kiosk).",
      "Launch of the first hybrid app for Yanbal using Ionic and Angular.",
      "Winner of the Fincyt contest for the idea of Cuponeo for MYPEs.",
      "Definition and development of the first microservices architecture using NodeJS for the company.",
    ],
  },
]

const educations = [
  {
    year: 2014,
    position: "Systems Engineer",
    institute: "Universidad Peruana de las Américas, Lima",
    descriptions: [
      "Management and project management using PMBOK.",
      "Installation and configuration of operating systems.",
      "Analysis, documentation of applications.",
      "Security and business applications.",
    ],
  },
  {
    year: 2009,
    position: "Professional Computer and Systems Technician",
    institute: "Cimas, Lima",
    descriptions: [
      "Development of web applications using PHP, ASP. NET, etc.",
      "Development of desktop applications using Java and .Net.",
      "Advanced use of Linux networks for server administration.",
      "Advanced Office Management.",
    ],
  },
]

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
                    {e.descriptions.map((d, i) => (
                      <li key={`experience-description-${i}`}>{d}</li>
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
                    {e.descriptions.map((d, i) => (
                      <li key={`education-description-${i}`}>{d}</li>
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
                  ></div>
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
                  ></div>
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
