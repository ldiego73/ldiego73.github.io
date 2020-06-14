import { Skills } from "@components/skills"
import React from "react"

const ResumeSkills = ({ title, icon, data }) => (
  <div className="resume__skills">
    <h4 className="resume__subtitle">
      <em className={icon} />
      {title}
    </h4>
    <Skills data={data} />
  </div>
)

export { ResumeSkills }
