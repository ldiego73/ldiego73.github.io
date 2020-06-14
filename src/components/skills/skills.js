import "./skills.scss"

import PropTypes from "prop-types"
import React from "react"

import { SkillItem } from "./skill-item"

const Skills = ({ data, children }) => (
  <div className="skills">
    {data.map((row, i) => (
      <SkillItem
        key={`skill-${i}`}
        name={row.name}
        percentage={row.percentage}
      />
    ))}
    {children}
  </div>
)

Skills.defaultProps = {
  data: [],
}

Skills.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      percentage: PropTypes.number.isRequired,
    })
  ),
}

export { Skills }
