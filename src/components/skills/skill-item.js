import PropTypes from "prop-types"
import React from "react"

const SkillItem = ({ name, percentage }) => {
  const percentageToString = `${percentage * 100}%`

  return (
    <div className="skills__bar">
      <div className="skills__name">{name}</div>
      <div className="skills__bar-outer">
        <div
          className="skills__bar-bubble"
          style={{
            left: `calc(${percentageToString} - 1.5em)`,
          }}
        >
          {percentageToString}
        </div>
        <div
          className="skills__bar-inner"
          style={{ width: percentageToString }}
        />
      </div>
    </div>
  )
}

SkillItem.propTypes = {
  name: PropTypes.string.isRequired,
  percentage: PropTypes.number.isRequired,
}

export { SkillItem }
