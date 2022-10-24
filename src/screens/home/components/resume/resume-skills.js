import { Skills } from "@components/skills"
import React from "react"

function ResumeSkills({ title, icon, data }) {
  return <div className="resume__skills">
    <h4 className="resume__subtitle">
      <em className={icon} />
      {title}
    </h4>
    <Skills data={data} />
  </div>
}

export { ResumeSkills }
